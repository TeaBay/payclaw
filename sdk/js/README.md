# payclaw (JS/TS)

Drop-in x402 payment middleware for MCP servers. Charge AI agents per tool call using USDC on Base chain — works with Cloudflare Workers, Vercel Edge, Express, and Hono.

```
npm install payclaw
```

## How it works

1. Agent calls your tool endpoint
2. No valid payment → server returns **HTTP 402** with price and wallet address
3. Agent pays USDC on Base chain, gets tx hash
4. Agent retries with `X-Payment: <tx_hash>` header
5. payclaw verifies on-chain → executes your tool

Money flows directly: **agent wallet → your wallet**. payclaw never holds funds.

---

## Cloudflare Workers

```typescript
import { requirePayment } from "payclaw";

const gate = requirePayment({
  priceUsdc: 0.001,
  walletAddress: "0xYourWalletAddress",
});

export default {
  fetch: gate.wrapFetch(async (req) => {
    return Response.json({ result: "tool output" });
  }),
};
```

## Vercel Edge / Next.js

```typescript
import { requirePayment } from "payclaw";

export const runtime = "edge";

const gate = requirePayment({
  priceUsdc: 0.001,
  walletAddress: "0xYourWalletAddress",
});

export default gate.wrapFetch(async (req) => {
  return Response.json({ result: "tool output" });
});
```

## Express / Hono

```typescript
import express from "express";
import { requirePayment } from "payclaw";

const app = express();

const gate = requirePayment({
  priceUsdc: 0.001,
  walletAddress: "0xYourWalletAddress",
});

app.post("/tool", gate, (req, res) => {
  res.json({ result: "tool output" });
});
```

---

## 402 Response format

```json
{
  "x402": true,
  "price": "0.001",
  "currency": "USDC",
  "network": "base-sepolia",
  "recipient": "0xYourWallet",
  "chain_id": 84532,
  "reason": "missing X-Payment header"
}
```

---

## Config options

| Parameter | Default | Description |
|-----------|---------|-------------|
| `priceUsdc` | required | Price per call in USDC |
| `walletAddress` | required | Your wallet (0x...) |
| `network` | `base-sepolia` | Network name |
| `chainId` | `84532` | Chain ID |
| `usdcAddress` | Base Sepolia USDC | USDC contract address |
| `rpcUrl` | `https://sepolia.base.org` | JSON-RPC endpoint |
| `freshnessSeconds` | `300` | Max tx age in seconds |
| `nonceCacheTtl` | `600` | Nonce cache TTL in seconds |
| `nonceStore` | In-memory Map | Custom nonce store (see below) |

---

## Nonce store — multi-worker warning

The default nonce store is an **in-memory Map**. This works correctly for:
- Single Cloudflare Worker isolate
- Single Vercel Edge instance
- Single Node.js process

**It does NOT protect against replay attacks across multiple worker instances.** If your deployment runs multiple parallel workers (e.g. Cloudflare Workers with high traffic), use a shared store:

```typescript
import { requirePayment } from "payclaw";
import type { NonceStore } from "payclaw";

// Example: Cloudflare Workers KV adapter
function createKVNonceStore(kv: KVNamespace): NonceStore {
  return {
    async has(txHash) {
      return (await kv.get(txHash.toLowerCase())) !== null;
    },
    async set(txHash, ttlSeconds) {
      const key = txHash.toLowerCase();
      const existing = await kv.get(key);
      if (existing) return false;
      await kv.put(key, "1", { expirationTtl: ttlSeconds });
      return true;
    },
  };
}

const gate = requirePayment({
  priceUsdc: 0.001,
  walletAddress: "0xYourWallet",
  nonceStore: createKVNonceStore(env.NONCE_KV),
});
```

---

## Getting testnet USDC

To test on Base Sepolia, get free testnet USDC from the [Circle faucet](https://faucet.circle.com) — select **Base Sepolia** and paste your wallet address.

---

## Security

- **Replay protection**: Nonce store prevents tx hash reuse. Use a shared store (KV, Redis) for multi-worker deployments.
- **ERC-20 verification**: Reads Transfer event logs from `eth_getTransactionReceipt` — not `tx.value` (always 0 for USDC).
- **Receipt status**: Rejects reverted transactions (`status != 0x1`).
- **Integer math**: USDC amounts compared as BigInt units. No floating point.
- **Block timestamp**: Uses on-chain block timestamp for freshness check.

---

## Legal

MIT License. Compliance with sanctions (OFAC) and applicable regulations is the responsibility of the deploying party.
