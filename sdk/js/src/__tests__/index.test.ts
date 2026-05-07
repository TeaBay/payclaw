import { describe, it, expect, vi, beforeEach } from "vitest";
import { requirePayment } from "../index.js";

const WALLET = "0x" + "a".repeat(40);
const TX = "0x" + "f".repeat(64);

function makeGate(opts = {}) {
  return requirePayment({ priceUsdc: 0.001, walletAddress: WALLET, rateLimitRequests: 0, ...opts });
}

function makeRequest(headers: Record<string, string> = {}, body = "{}") {
  return new Request("https://example.com/tool", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

describe("requirePayment config validation", () => {
  it("throws on invalid wallet", () => {
    expect(() => requirePayment({ priceUsdc: 0.001, walletAddress: "bad" })).toThrow();
  });
  it("throws on zero price", () => {
    expect(() => requirePayment({ priceUsdc: 0, walletAddress: WALLET })).toThrow();
  });
});

describe("wrapFetch — format validation", () => {
  it("returns 402 when X-Payment header missing", async () => {
    const gate = makeGate();
    const res = await gate.wrapFetch(async () => new Response("ok"))(makeRequest());
    expect(res.status).toBe(402);
    const body = await res.json() as any;
    expect(body.x402).toBe(true);
    expect(body.reason).toMatch(/missing/);
  });

  it("returns 402 on short tx hash", async () => {
    const gate = makeGate();
    const res = await gate.wrapFetch(async () => new Response("ok"))(
      makeRequest({ "x-payment": "0xabc" })
    );
    expect(res.status).toBe(402);
    const body = await res.json() as any;
    expect(body.reason).toMatch(/format/);
  });

  it("returns 402 on non-hex tx hash", async () => {
    const gate = makeGate();
    const res = await gate.wrapFetch(async () => new Response("ok"))(
      makeRequest({ "x-payment": "0x" + "z".repeat(64) })
    );
    expect(res.status).toBe(402);
  });
});

describe("wrapFetch — rate limiting", () => {
  it("returns 429 after limit exceeded", async () => {
    const gate = requirePayment({
      priceUsdc: 0.001,
      walletAddress: WALLET,
      rateLimitRequests: 2,
      rateLimitWindowMs: 60_000,
    });
    const req = () => makeRequest({ "x-forwarded-for": "1.2.3.4" });
    await gate.wrapFetch(async () => new Response("ok"))(req());
    await gate.wrapFetch(async () => new Response("ok"))(req());
    const res = await gate.wrapFetch(async () => new Response("ok"))(req());
    expect(res.status).toBe(429);
  });

  it("different IPs are independent", async () => {
    const gate = requirePayment({
      priceUsdc: 0.001,
      walletAddress: WALLET,
      rateLimitRequests: 1,
      rateLimitWindowMs: 60_000,
    });
    const handler = async () => new Response("ok");
    await gate.wrapFetch(handler)(makeRequest({ "x-forwarded-for": "1.1.1.1" }));
    const res = await gate.wrapFetch(handler)(makeRequest({ "x-forwarded-for": "2.2.2.2" }));
    expect(res.status).not.toBe(429);
  });
});

describe("toUnits precision", () => {
  it("0.001 USDC = 1000 units", () => {
    const gate = makeGate({ priceUsdc: 0.001 });
    // Internal — verify via 402 body price field
    const cfg = (gate as any).cfg ?? null;
    // We test indirectly: a payment with exactly 1000 units should pass amount check
    // This is covered in verify.test.ts — here just confirm no throw
    expect(() => makeGate({ priceUsdc: 0.001 })).not.toThrow();
    expect(() => makeGate({ priceUsdc: 0.1 })).not.toThrow();
    expect(() => makeGate({ priceUsdc: 1.005 })).not.toThrow();
  });
});

describe("402 response body", () => {
  it("contains correct x402 fields", async () => {
    const gate = makeGate();
    const res = await gate.wrapFetch(async () => new Response("ok"))(makeRequest());
    const body = await res.json() as any;
    expect(body.x402).toBe(true);
    expect(body.currency).toBe("USDC");
    expect(body.network).toBe("base-sepolia");
    expect(body.recipient).toBe(WALLET);
    expect(body.chain_id).toBe(84532);
  });
});
