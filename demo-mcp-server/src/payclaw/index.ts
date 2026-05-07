import type { PayclawConfig, ResolvedConfig, X402Body, NonceStore } from "./types.js";
import { verifyPayment } from "./verify.js";

export type { PayclawConfig, NonceStore, X402Body } from "./types.js";

const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const RPC_BASE_SEPOLIA = "https://sepolia.base.org";

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
      if (store.has(key)) return false;
      store.set(key, Math.floor(Date.now() / 1000) + ttlSeconds);
      return true;
    },
  };
}

function resolve(config: PayclawConfig): ResolvedConfig {
  if (!config.walletAddress.startsWith("0x") || config.walletAddress.length !== 42) {
    throw new Error(`Invalid walletAddress: ${config.walletAddress}`);
  }
  if (config.priceUsdc <= 0) throw new Error("priceUsdc must be > 0");
  return {
    priceUsdc: config.priceUsdc,
    // Integer math only — USDC has 6 decimals
    priceUnits: BigInt(Math.round(config.priceUsdc * 1_000_000)),
    walletAddress: config.walletAddress,
    network: config.network ?? "base-sepolia",
    chainId: config.chainId ?? 84532,
    usdcAddress: config.usdcAddress ?? USDC_BASE_SEPOLIA,
    rpcUrl: config.rpcUrl ?? RPC_BASE_SEPOLIA,
    freshnessSeconds: config.freshnessSeconds ?? 300,
    nonceCacheTtl: config.nonceCacheTtl ?? 600,
    nonceStore: config.nonceStore ?? createMemoryNonceStore(),
  };
}

function isValidTxHash(h: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(h);
}

function build402(cfg: ResolvedConfig, reason?: string): X402Body {
  return {
    x402: true,
    price: String(cfg.priceUsdc),
    currency: "USDC",
    network: cfg.network,
    recipient: cfg.walletAddress,
    chain_id: cfg.chainId,
    ...(reason ? { reason } : {}),
  };
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

  // Cloudflare Workers / fetch-based handler wrapper
  function wrapFetch(
    handler: (req: Request, ...rest: unknown[]) => Promise<Response>
  ): (req: Request, ...rest: unknown[]) => Promise<Response> {
    return async (req, ...rest) => {
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
    const txHash: string | undefined =
      req.headers?.["x-payment"] ?? req.header?.("x-payment");
    if (!txHash) {
      return res.status(402).json(build402(cfg, "missing X-Payment header"));
    }
    if (!txHash.startsWith("0x") || txHash.length !== 66 || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
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
