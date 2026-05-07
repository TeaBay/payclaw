import { Redis } from "@upstash/redis";
import { requirePayment } from "./payclaw/index.js";
import type { PayclawConfig, NonceStore } from "./payclaw/index.js";

function createRedisNonceStore(): NonceStore {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "Redis is required for nonce storage. Connect a KV store in your Vercel project settings."
    );
  }
  const redis = new Redis({ url, token });
  return {
    async has(txHash) {
      return (await redis.get(txHash.toLowerCase())) !== null;
    },
    async set(txHash, ttlSeconds) {
      const key = txHash.toLowerCase();
      const result = await redis.set(key, "1", { ex: ttlSeconds, nx: true });
      return result === "OK";
    },
  };
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
  };
  return requirePayment(config);
}

async function proxyRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: string
): Promise<{ status: number; body: unknown }> {
  if (!url.startsWith("https://")) {
    return { status: 400, body: { error: "url must use HTTPS" } };
  }
  const res = await fetch(url, {
    method: method.toUpperCase(),
    headers: { "Content-Type": "application/json", ...headers },
    body: method.toUpperCase() !== "GET" ? body : undefined,
  });
  let responseBody: unknown;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    responseBody = await res.json();
  } else {
    responseBody = await res.text();
  }
  return { status: res.status, body: responseBody };
}

export async function handleMcp(req: Request, gate: PaymentGate, priceUsdc: number): Promise<Response> {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let rpc: JsonRpcRequest;
  try {
    rpc = (await req.json()) as JsonRpcRequest;
  } catch {
    return json(rpcErr(null, -32700, "Parse error"), 400);
  }

  const id = rpc.id ?? null;

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
        return json(rpcErr(id, -32000, `Proxy error: ${e}`));
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
