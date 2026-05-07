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

const FAKE_KB: Record<string, string[]> = {
  default: [
    "The answer is 42.",
    "Payclaw enables MCP server monetization via x402.",
    "Base chain is an Ethereum L2 by Coinbase.",
  ],
  usdc: [
    "USDC is a stablecoin pegged 1:1 to the US dollar.",
    "USDC on Base Mainnet: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  ],
  x402: [
    "x402 revives HTTP 402 Payment Required for machine-to-machine payments.",
    "Payment flow: agent pays USDC on-chain, retries with X-Payment header.",
  ],
};

function searchKnowledge(query: string): string[] {
  const key = Object.keys(FAKE_KB).find((k) => query.toLowerCase().includes(k));
  return key ? FAKE_KB[key] : FAKE_KB.default;
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

export async function handleMcp(req: Request, gate: PaymentGate, priceUsdc: number): Promise<Response> {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let rpc: JsonRpcRequest;
  try {
    rpc = (await req.json()) as JsonRpcRequest;
  } catch {
    return json(rpcErr(null, -32700, "Parse error"), 400);
  }

  const id = rpc.id ?? null;

  // MCP lifecycle
  if (rpc.method === "initialize") {
    return json(ok(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "payclaw-search", version: "0.1.1" },
    }));
  }

  if (rpc.method === "ping") {
    return json(ok(id, {}));
  }

  // Notifications must not return errors — silently accept
  if (rpc.method.startsWith("notifications/")) {
    return new Response(null, { status: 204 });
  }

  // Empty capability lists for unsupported features
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
          name: "search_knowledge",
          description: `Search the knowledge base. Costs ${priceUsdc} USDC per call.`,
          inputSchema: {
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"],
          },
        },
      ],
    }));
  }

  if (rpc.method === "tools/call") {
    const gateResponse = await gate.wrapFetch(async () => {
      const params = rpc.params as { name?: string; arguments?: { query?: string } };
      if (params?.name !== "search_knowledge") {
        return json(rpcErr(id, -32601, "Unknown tool"));
      }
      const results = searchKnowledge(params?.arguments?.query ?? "");
      return json(ok(id, { content: [{ type: "text", text: results.join("\n") }] }));
    })(req);

    // Wrap 402/429 in JSON-RPC envelope so mcp-remote can match response to request
    if (gateResponse.status === 402 || gateResponse.status === 429) {
      const body = await gateResponse.json();
      return json(
        rpcErr(id, -32000, gateResponse.status === 429 ? "Rate limit exceeded" : "Payment required", body),
        gateResponse.status
      );
    }

    return gateResponse;
  }

  // Unknown method — HTTP 200 with JSON-RPC error (per JSON-RPC 2.0 spec)
  return json(rpcErr(id, -32601, "Method not found"));
}
