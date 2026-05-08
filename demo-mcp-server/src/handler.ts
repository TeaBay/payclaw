import { Redis } from "@upstash/redis";
import { requirePayment } from "./payclaw/index.js";
import type { PayclawConfig, NonceStore } from "./payclaw/index.js";

let _redis: Redis | null = null;
function getRedis(): Redis {
  if (_redis) return _redis;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "Redis is required. Connect a KV store in your Vercel project settings."
    );
  }
  _redis = new Redis({ url, token });
  return _redis;
}

function createRedisNonceStore(): NonceStore {
  return {
    async has(txHash) {
      return (await getRedis().get(txHash.toLowerCase())) !== null;
    },
    async set(txHash, ttlSeconds) {
      const key = txHash.toLowerCase();
      const result = await getRedis().set(key, "1", { ex: ttlSeconds, nx: true });
      return result === "OK";
    },
  };
}

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_SECS = 60;

const RATE_LIMIT_LUA = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return count
`;

async function checkRedisRateLimit(ip: string): Promise<boolean> {
  const key = `rl:${ip}`;
  const count = (await getRedis().eval(RATE_LIMIT_LUA, [key], [String(RATE_LIMIT_WINDOW_SECS)])) as number;
  return count <= RATE_LIMIT_MAX;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function ok(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function rpcErr(id: string | number | null, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

export type PaymentGate = ReturnType<typeof requirePayment>;

const MAINNET_CONFIG = {
  network: "base",
  chainId: 8453,
  usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  rpcUrl: "https://mainnet.base.org",
} as const;

export function createGate(walletAddress: string, priceUsdc: number): PaymentGate {
  if (!walletAddress || !walletAddress.startsWith("0x")) {
    throw new Error("WALLET_ADDRESS is not set or invalid. Set it as an environment variable.");
  }
  const config: PayclawConfig = {
    priceUsdc,
    walletAddress,
    ...MAINNET_CONFIG,
    nonceStore: createRedisNonceStore(),
    rateLimitRequests: 0,
    trustProxy: true,
  };
  return requirePayment(config);
}

const BLOCKED_HEADERS = new Set([
  "host", "transfer-encoding", "connection", "keep-alive", "upgrade",
  "proxy-authorization", "authorization", "cookie", "set-cookie",
  "te", "trailers", "x-forwarded-for",
  "x-forwarded-host", "x-forwarded-proto", "x-real-ip",
]);

const PRIVATE_IP_PATTERNS = [
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^169\.254\.\d{1,3}\.\d{1,3}$/,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^::$/,
  /^fe[89ab][0-9a-f]:/i,
  /^::ffff:/i,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
];

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.gce.internal",
  "169.254.169.254",
]);

const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const MAX_BODY_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const PROXY_TIMEOUT_MS = 10_000;

function isPrivateIp(ip: string): boolean {
  return PRIVATE_IP_PATTERNS.some((re) => re.test(ip));
}

type ValidateResult = { error: string } | { resolvedIp: string; hostname: string };

async function validateProxyUrl(rawUrl: string): Promise<ValidateResult> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { error: "invalid URL" };
  }
  if (parsed.protocol !== "https:") return { error: "url must use HTTPS" };
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase()) || isPrivateIp(hostname)) {
    return { error: "url resolves to a blocked address" };
  }
  const isIpLiteral = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) || hostname.includes(":");
  if (isIpLiteral) {
    if (isPrivateIp(hostname)) return { error: "url resolves to a blocked address" };
    return { resolvedIp: hostname, hostname };
  }
  try {
    const dns = await import("dns");
    const [v4, v6] = await Promise.allSettled([
      dns.promises.resolve4(hostname),
      dns.promises.resolve6(hostname),
    ]);
    const addresses = [
      ...(v4.status === "fulfilled" ? v4.value : []),
      ...(v6.status === "fulfilled" ? v6.value : []),
    ];
    if (addresses.length === 0) return { error: "unable to resolve hostname" };
    if (addresses.some(isPrivateIp)) return { error: "url resolves to a private IP address" };
    return { resolvedIp: addresses[0], hostname };
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "MODULE_NOT_FOUND" || code === "ERR_MODULE_NOT_FOUND") {
      return { resolvedIp: hostname, hostname };
    }
    return { error: "unable to resolve hostname" };
  }
}

async function proxyRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: string
): Promise<{ status: number; body: unknown }> {
  const validation = await validateProxyUrl(url);
  if ("error" in validation) return { status: 400, body: { error: validation.error } };
  const { resolvedIp, hostname } = validation;

  const encoder = new TextEncoder();
  if (body && encoder.encode(body).length > MAX_BODY_BYTES) {
    return { status: 400, body: { error: "request body exceeds 64 KB limit" } };
  }

  const safeHeaders: Record<string, string> = { "Content-Type": "application/json" };
  for (const [k, v] of Object.entries(headers)) {
    if (!BLOCKED_HEADERS.has(k.toLowerCase())) safeHeaders[k] = v;
  }

  const upperMethod = method.toUpperCase();
  if (!ALLOWED_METHODS.has(upperMethod)) {
    return { status: 400, body: { error: "invalid HTTP method" } };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  // Use undici with custom lookup to bind outbound connection to the validated IP,
  // preventing DNS rebinding between validation and fetch.
  type FetchFn = (url: string, init: RequestInit) => Promise<Response>;
  let doFetch: FetchFn = (u, init) => fetch(u, init);
  try {
    const undici = await import("undici");
    const isIpv6 = resolvedIp.includes(":");
    const dispatcher = new undici.Agent({
      connect: {
        servername: hostname,
        lookup: (_h: string, _o: unknown, cb: (err: Error | null, addr: string, family: number) => void) => {
          cb(null, resolvedIp, isIpv6 ? 6 : 4);
        },
      },
    });
    doFetch = (u, init) => undici.fetch(u, { ...init, dispatcher } as Parameters<typeof undici.fetch>[1]) as unknown as Promise<Response>;
  } catch {
    // In Node.js, undici should always be available — fail closed to prevent DNS rebinding.
    // In Workers/Edge runtimes, network isolation makes hostname-based fetch safe.
    if (typeof process !== "undefined" && process.versions?.node) {
      clearTimeout(timer);
      return { status: 500, body: { error: "proxy unavailable: DNS pinning failed" } };
    }
    doFetch = (u, init) => fetch(u, init);
  }

  try {
    const res = await doFetch(url, {
      method: upperMethod,
      headers: safeHeaders,
      body: upperMethod !== "GET" ? body : undefined,
      redirect: "error",
      signal: controller.signal,
    });

    const contentLength = Number(res.headers.get("content-length") ?? 0);
    if (contentLength > MAX_RESPONSE_BYTES) {
      res.body?.cancel();
      return { status: 413, body: { error: "response exceeds 1 MB limit" } };
    }
    const ct = res.headers.get("content-type") ?? "";
    const reader = res.body?.getReader();
    if (!reader) return { status: res.status, body: null };
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.length;
        if (totalBytes > MAX_RESPONSE_BYTES) {
          reader.cancel();
          return { status: 413, body: { error: "response exceeds 1 MB limit" } };
        }
        chunks.push(value);
      }
    }
    const combined = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length; }
    const text = new TextDecoder().decode(combined);

    let responseBody: unknown;
    if (ct.includes("application/json")) {
      try { responseBody = JSON.parse(text); } catch { responseBody = text; }
    } else {
      responseBody = text;
    }

    return { status: res.status, body: responseBody };
  } finally {
    clearTimeout(timer);
  }
}

export async function handleMcp(req: Request, gate: PaymentGate, priceUsdc: number): Promise<Response> {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const ip = req.headers.get("x-real-ip")
    ?? req.headers.get("cf-connecting-ip")
    ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim()
    ?? "unknown";
  if (!await checkRedisRateLimit(ip)) {
    return json(rpcErr(null, -32000, "Rate limit exceeded"), 429);
  }

  let rpc: JsonRpcRequest;
  try {
    rpc = (await req.json()) as JsonRpcRequest;
  } catch {
    return json(rpcErr(null, -32700, "Parse error"), 400);
  }

  const rawId = rpc.id;
  if (rawId !== undefined && typeof rawId !== "string" && typeof rawId !== "number") {
    return json(rpcErr(null, -32600, "Invalid Request: id must be string or number"), 400);
  }
  const id = rawId ?? null;
  if (typeof rpc.method !== "string") {
    return json(rpcErr(id, -32600, "Invalid Request: method must be a string"), 400);
  }

  if (rpc.method === "initialize") {
    return json(ok(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "payclaw", version: "0.1.1" },
    }));
  }

  if (rpc.method === "ping") {
    return json(ok(id, {}));
  }

  if (rpc.method.startsWith("notifications/")) {
    return new Response(null, { status: 204 });
  }

  if (rpc.method === "resources/list") {
    return json(ok(id, { resources: [] }));
  }

  if (rpc.method === "prompts/list") {
    return json(ok(id, { prompts: [] }));
  }

  if (rpc.method === "tools/list") {
    return json(ok(id, {
      tools: [
        {
          name: "proxy_request",
          description: `Forward an HTTP request to any HTTPS API. Costs ${priceUsdc} USDC per call via x402 on Base Mainnet.`,
          inputSchema: {
            type: "object",
            properties: {
              url: { type: "string", description: "HTTPS endpoint to call" },
              method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"], default: "GET" },
              headers: { type: "object", description: "Optional HTTP headers", additionalProperties: { type: "string" } },
              body: { type: "string", description: "Optional request body (JSON string)" },
            },
            required: ["url"],
          },
        },
      ],
    }));
  }

  if (rpc.method === "tools/call") {
    const gateResponse = await gate.wrapFetch(async () => {
      const params = rpc.params as { name?: string; arguments?: { url?: string; method?: string; headers?: Record<string, string>; body?: string } };

      if (params?.name !== "proxy_request") {
        return json(rpcErr(id, -32601, "Unknown tool"));
      }

      const { url, method = "GET", headers = {}, body } = params?.arguments ?? {};

      if (!url) {
        return json(rpcErr(id, -32602, "url is required"));
      }

      try {
        const result = await proxyRequest(url, method, headers, body);
        return json(ok(id, {
          content: [{ type: "text", text: JSON.stringify(result.body, null, 2) }],
          status: result.status,
        }));
      } catch (e) {
        console.error("[proxy] error:", e);
        return json(rpcErr(id, -32000, "Proxy request failed"));
      }
    })(req);

    if (gateResponse.status === 402 || gateResponse.status === 429) {
      const body = await gateResponse.json();
      return json(
        rpcErr(id, -32000, gateResponse.status === 429 ? "Rate limit exceeded" : "Payment required", body),
        gateResponse.status
      );
    }

    return gateResponse;
  }

  return json(rpcErr(id, -32601, "Method not found"));
}
