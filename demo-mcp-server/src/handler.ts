import { Redis } from "@upstash/redis";
import { requirePayment } from "./payclaw/index.js";
import type { PayclawConfig, NonceStore } from "./payclaw/index.js";

function createRedisNonceStore(): NonceStore | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
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
  id: string | number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

const FAKE_KB: Record<string, string[]> = {
  default: [
    "The answer is 42.",
    "Payclaw enables MCP server monetization via x402.",
    "Base chain is an Ethereum L2 by Coinbase.",
  ],
  usdc: [
    "USDC is a stablecoin pegged 1:1 to the US dollar.",
    "USDC on Base Sepolia: 0x036CbD53842c5426634e7929541eC2318f3dCF7e",
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

function ok(id: string | number, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function rpcErr(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

export type PaymentGate = ReturnType<typeof requirePayment>;

/**
 * Create the payment gate once at startup (module level in your entry point).
 * Never call this inside a request handler — the nonce store must persist across requests.
 */
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
  const nonceStore = createRedisNonceStore();
  const config: PayclawConfig = {
    priceUsdc,
    walletAddress,
    ...MAINNET_CONFIG,
    ...(nonceStore ? { nonceStore } : {}),
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

  if (rpc.method === "tools/list") {
    return json(
      ok(rpc.id, {
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
      })
    );
  }

  if (rpc.method === "tools/call") {
    return gate.wrapFetch(async () => {
      const params = rpc.params as { name?: string; arguments?: { query?: string } };
      if (params?.name !== "search_knowledge") {
        return json(rpcErr(rpc.id, -32601, "Unknown tool"));
      }
      const results = searchKnowledge(params?.arguments?.query ?? "");
      return json(ok(rpc.id, { content: [{ type: "text", text: results.join("\n") }] }));
    })(req);
  }

  return json(rpcErr(rpc.id ?? null, -32601, "Method not found"), 404);
}
