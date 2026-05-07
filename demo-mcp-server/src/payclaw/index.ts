import type { PayclawConfig, ResolvedConfig, X402Body, NonceStore } from "./types.js";
import { verifyPayment } from "./verify.js";

export type { PayclawConfig, NonceStore, X402Body } from "./types.js";

const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const RPC_BASE_SEPOLIA = "https://sepolia.base.org";

function toUnits(priceUsdc: number): bigint {
  // String-based conversion avoids IEEE 754 float precision errors
  const s = priceUsdc.toFixed(6);
  const [intPart, decPart = ""] = s.split(".");
  return BigInt(intPart) * 1_000_000n + BigInt(decPart.padEnd(6, "0").slice(0, 6));
}

function createRateLimiter(maxRequests: number, windowMs: number) {
  const log = new Map<string, number[]>();
  let sweepCounter = 0;
  return function isAllowed(ip: string): boolean {
    const now = Date.now();
    const cutoff = now - windowMs;
    if (++sweepCounter % 500 === 0) {
      for (const [k, ts] of log) {
        if (!ts.some((t) => t > cutoff)) log.delete(k);
      }
    }
    const times = (log.get(ip) ?? []).filter((t) => t > cutoff);
    if (times.length >= maxRequests) {
      log.set(ip, times);
      return false;
    }
    times.push(now);
    log.set(ip, times);
    return true;
  };
}

function clientIp(headers: { get(k: string): string | null }, trustProxy: boolean): string {
  if (trustProxy) return headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  return "unknown";
}

/** In-memory nonce store — sufficient for single-process/single-worker deployments. */
function createMemoryNonceStore(): NonceStore {
  const store = new Map<string, number>();
  return {
    async has(txHash) {
      const key = txHash.toLowerCase();
      const exp = store.get(key);
      if (exp === undefined) return false;
      if (Math.floor(Date.now() / 1000) > exp) { store.delete(key); return false; }
      return true;
    },
    async set(txHash, ttlSeconds) {
      const key = txHash.toLowerCase();
      const now = Math.floor(Date.now() / 1000);
      const existing = store.get(key);
      if (existing !== undefined && now <= existing) return false;
      store.set(key, now + ttlSeconds);
      return true;
    },
  };
}

function resolve(config: PayclawConfig): ResolvedConfig {
  if (!config.walletAddress.startsWith("0x") || config.walletAddress.length !== 42) {
    throw new Error(`Invalid walletAddress: ${config.walletAddress}`);
  }
  if (config.priceUsdc <= 0) throw new Error("priceUsdc must be > 0");
  const rpcUrl = config.rpcUrl ?? RPC_BASE_SEPOLIA;
  if (!rpcUrl.startsWith("https://")) throw new Error("rpcUrl must use HTTPS");
  const freshnessSeconds = config.freshnessSeconds ?? 300;
  const nonceCacheTtl = config.nonceCacheTtl ?? 600;
  if (nonceCacheTtl < freshnessSeconds) {
    throw new Error(`nonceCacheTtl (${nonceCacheTtl}s) must be >= freshnessSeconds (${freshnessSeconds}s)`);
  }
  return {
    priceUsdc: config.priceUsdc,
    priceUnits: toUnits(config.priceUsdc),
    walletAddress: config.walletAddress,
    network: config.network ?? "base-sepolia",
    chainId: config.chainId ?? 84532,
    usdcAddress: config.usdcAddress ?? USDC_BASE_SEPOLIA,
    rpcUrl,
    freshnessSeconds,
    nonceCacheTtl,
    nonceStore: config.nonceStore ?? createMemoryNonceStore(),
  };
}

function isValidTxHash(h: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(h);
}

function build402(cfg: ResolvedConfig, reason?: string): X402Body {
  const body: X402Body = {
    x402: true,
    price: String(cfg.priceUsdc),
    currency: "USDC",
    network: cfg.network,
    recipient: cfg.walletAddress,
    chain_id: cfg.chainId,
  };
  if (reason) body.reason = reason;
  return body;
}

/**
 * Returns a Cloudflare Workers / Hono / Express-compatible middleware.
 *
 * Cloudflare Workers (fetch handler):
 *   const gate = requirePayment(config);
 *   export default { fetch: gate(myHandler) };
 *
 * Hono:
 *   app.use("/tool", requirePayment(config));
 *
 * Express:
 *   app.post("/tool", requirePayment(config), handler);
 */
export function requirePayment(config: PayclawConfig) {
  const cfg = resolve(config);
  const maxReq = config.rateLimitRequests ?? 10;
  const windowMs = config.rateLimitWindowMs ?? 60_000;
  const trustProxy = config.trustProxy ?? false;
  const checkRate = maxReq > 0 ? createRateLimiter(maxReq, windowMs) : null;

  // Cloudflare Workers / fetch-based handler wrapper
  function wrapFetch(
    handler: (req: Request, ...rest: unknown[]) => Promise<Response>
  ): (req: Request, ...rest: unknown[]) => Promise<Response> {
    return async (req, ...rest) => {
      if (checkRate && !checkRate(clientIp(req.headers, trustProxy))) {
        return Response.json({ error: "Too Many Requests", reason: "rate limit exceeded" }, { status: 429 });
      }
      const txHash = req.headers.get("x-payment");
      if (!txHash) {
        return Response.json(build402(cfg, "missing X-Payment header"), { status: 402 });
      }
      if (!isValidTxHash(txHash)) {
        return Response.json(build402(cfg, "invalid tx hash format"), { status: 402 });
      }
      const result = await verifyPayment(txHash, cfg);
      if (!result.ok) {
        return Response.json(build402(cfg, result.reason), { status: 402 });
      }
      return handler(req, ...rest);
    };
  }

  // Express / Hono middleware signature (req, res, next)
  async function expressMiddleware(req: any, res: any, next: () => void) {
    const ip = trustProxy
      ? ((req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ?? "unknown")
      : "unknown";
    if (checkRate && !checkRate(ip)) {
      return res.status(429).json({ error: "Too Many Requests", reason: "rate limit exceeded" });
    }
    const txHash: string | undefined =
      req.headers?.["x-payment"] ?? req.header?.("x-payment");
    if (!txHash) {
      return res.status(402).json(build402(cfg, "missing X-Payment header"));
    }
    if (!isValidTxHash(txHash)) {
      return res.status(402).json(build402(cfg, "invalid tx hash format"));
    }
    const result = await verifyPayment(txHash, cfg);
    if (!result.ok) {
      return res.status(402).json(build402(cfg, result.reason));
    }
    next();
  }

  // Return both — caller picks the one they need
  return Object.assign(expressMiddleware, { wrapFetch });
}
