import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verifyPayment } from "../verify.js";
import type { ResolvedConfig } from "../types.js";

const WALLET = "0x" + "a".repeat(40);
const TX = "0x" + "f".repeat(64);
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function makeNonceStore() {
  const used = new Set<string>();
  return {
    async has(h: string) { return used.has(h.toLowerCase()); },
    async set(h: string) {
      const k = h.toLowerCase();
      if (used.has(k)) return false;
      used.add(k);
      return true;
    },
  };
}

function makeConfig(nonceStore = makeNonceStore()): ResolvedConfig {
  return {
    priceUsdc: 0.001,
    priceUnits: 1000n,
    walletAddress: WALLET,
    network: "base-sepolia",
    chainId: 84532,
    usdcAddress: USDC,
    rpcUrl: "https://sepolia.base.org",
    freshnessSeconds: 300,
    nonceCacheTtl: 600,
    nonceStore,
  };
}

const recentTs = "0x" + Math.floor(Date.now() / 1000 - 10).toString(16);

function makeRpcMock(overrides: Record<string, unknown> = {}) {
  const tx = overrides.tx ?? { blockNumber: "0x1" };
  const receipt = overrides.receipt ?? {
    status: "0x1",
    logs: [{
      address: USDC,
      topics: [TRANSFER_TOPIC, "0x" + "0".repeat(64), "0x" + "0".repeat(24) + WALLET.slice(2)],
      data: "0x3e8",
    }],
  };
  const block = overrides.block ?? { timestamp: recentTs };

  return vi.fn((_url: string, method: string) => {
    if (method === "eth_getTransactionByHash") return Promise.resolve(tx);
    if (method === "eth_getTransactionReceipt") return Promise.resolve(receipt);
    if (method === "eth_getBlockByNumber") return Promise.resolve(block);
    return Promise.resolve(null);
  });
}

describe("verifyPayment", () => {
  it("accepts valid payment", async () => {
    const mock = makeRpcMock();
    vi.doMock("../verify.js", () => ({}));
    // Patch fetch for RPC calls
    const fetchMock = vi.fn((url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      const results: Record<string, unknown> = {
        eth_getTransactionByHash: { blockNumber: "0x1" },
        eth_getTransactionReceipt: {
          status: "0x1",
          logs: [{
            address: USDC,
            topics: [TRANSFER_TOPIC, "0x" + "0".repeat(64), "0x" + "0".repeat(24) + WALLET.slice(2)],
            data: "0x3e8",
          }],
        },
        eth_getBlockByNumber: { timestamp: recentTs },
      };
      return Promise.resolve(new Response(JSON.stringify({ result: results[body.method] })));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyPayment(TX, makeConfig());
    expect(result.ok).toBe(true);
  });

  it("rejects already-used tx", async () => {
    const store = makeNonceStore();
    await store.set(TX);
    const result = await verifyPayment(TX, makeConfig(store));
    expect(result.ok).toBe(false);
    expect((result as any).reason).toMatch(/already used/);
  });

  it("rejects reverted tx", async () => {
    vi.stubGlobal("fetch", vi.fn((_, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (body.method === "eth_getTransactionByHash") {
        return Promise.resolve(new Response(JSON.stringify({ result: { blockNumber: "0x1" } })));
      }
      if (body.method === "eth_getTransactionReceipt") {
        return Promise.resolve(new Response(JSON.stringify({ result: { status: "0x0", logs: [] } })));
      }
      return Promise.resolve(new Response(JSON.stringify({ result: null })));
    }));
    const result = await verifyPayment(TX, makeConfig());
    expect(result.ok).toBe(false);
    expect((result as any).reason).toMatch(/reverted/);
  });

  it("rejects insufficient amount", async () => {
    vi.stubGlobal("fetch", vi.fn((_, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (body.method === "eth_getTransactionByHash") {
        return Promise.resolve(new Response(JSON.stringify({ result: { blockNumber: "0x1" } })));
      }
      if (body.method === "eth_getTransactionReceipt") {
        return Promise.resolve(new Response(JSON.stringify({
          result: {
            status: "0x1",
            logs: [{
              address: USDC,
              topics: [TRANSFER_TOPIC, "0x" + "0".repeat(64), "0x" + "0".repeat(24) + WALLET.slice(2)],
              data: "0x1", // only 1 unit
            }],
          },
        })));
      }
      return Promise.resolve(new Response(JSON.stringify({ result: null })));
    }));
    const result = await verifyPayment(TX, makeConfig());
    expect(result.ok).toBe(false);
    expect((result as any).reason).toMatch(/insufficient/);
  });

  it("rejects stale tx", async () => {
    const oldTs = "0x" + Math.floor(Date.now() / 1000 - 400).toString(16);
    vi.stubGlobal("fetch", vi.fn((_, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (body.method === "eth_getTransactionByHash") {
        return Promise.resolve(new Response(JSON.stringify({ result: { blockNumber: "0x1" } })));
      }
      if (body.method === "eth_getTransactionReceipt") {
        return Promise.resolve(new Response(JSON.stringify({
          result: {
            status: "0x1",
            logs: [{
              address: USDC,
              topics: [TRANSFER_TOPIC, "0x" + "0".repeat(64), "0x" + "0".repeat(24) + WALLET.slice(2)],
              data: "0x3e8",
            }],
          },
        })));
      }
      if (body.method === "eth_getBlockByNumber") {
        return Promise.resolve(new Response(JSON.stringify({ result: { timestamp: oldTs } })));
      }
      return Promise.resolve(new Response(JSON.stringify({ result: null })));
    }));
    const result = await verifyPayment(TX, makeConfig());
    expect(result.ok).toBe(false);
    expect((result as any).reason).toMatch(/old/);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});
