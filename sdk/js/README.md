# payclaw (JS/TS)

[English](#english) | [繁體中文](#繁體中文)

---

<a name="english"></a>

Drop-in x402 payment middleware for MCP servers. Charge AI agents per tool call using USDC on Base chain — works with Cloudflare Workers, Vercel Edge, Express, and Hono.

```
npm install @teapper/payclaw-x402
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
import { requirePayment } from "@teapper/payclaw-x402";

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
import { requirePayment } from "@teapper/payclaw-x402";

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
import { requirePayment } from "@teapper/payclaw-x402";

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

## Response formats

**HTTP 402 — payment required:**
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

**HTTP 429 — rate limit exceeded:**
```json
{
  "error": "Too Many Requests",
  "reason": "rate limit exceeded"
}
```

## Base Mainnet

```typescript
import { requirePayment } from "@teapper/payclaw-x402";

const gate = requirePayment({
  priceUsdc: 0.001,
  walletAddress: "0xYourWallet",
  network: "base",
  chainId: 8453,
  usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  rpcUrl: "https://mainnet.base.org",
});
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
| `rateLimitRequests` | `10` | Max requests per IP per window (0 = disabled) |
| `rateLimitWindowMs` | `60000` | Rate limit window in milliseconds |
| `trustProxy` | `false` | Trust `X-Forwarded-For` for per-IP rate limiting. Set `true` only when behind a trusted reverse proxy. |

---

## Nonce store — multi-worker warning

The default nonce store is an **in-memory Map**. This works for single-process deployments only.

**It does NOT protect against replay attacks across multiple worker instances.** Use a shared store for multi-worker deployments:

```typescript
import { requirePayment } from "@teapper/payclaw-x402";
import type { NonceStore } from "@teapper/payclaw-x402";

// Cloudflare Workers KV adapter
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

Get free testnet USDC from the [Circle faucet](https://faucet.circle.com) — select **Base Sepolia** and paste your wallet address.

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

payclaw is infrastructure software only. It is not a payment processor, money transmitter, or financial service. It does not custody funds. IP addresses may be temporarily stored for rate limiting purposes only. Use at your own risk.

---

<a name="繁體中文"></a>

# payclaw JS/TS（繁體中文）

適用於 MCP 伺服器的 x402 支付中介軟體。讓 AI 代理每次工具呼叫使用 Base 鏈上的 USDC 付款 — 支援 Cloudflare Workers、Vercel Edge、Express 及 Hono。

```
npm install @teapper/payclaw-x402
```

## 運作原理

1. Agent 呼叫你的工具端點
2. 無有效付款 → 伺服器返回 **HTTP 402**，附上價格和錢包地址
3. Agent 在 Base 鏈支付 USDC，取得 tx hash
4. Agent 帶上 `X-Payment: <tx_hash>` header 重試
5. payclaw 在鏈上驗證 → 執行工具

資金直接流轉：**Agent 錢包 → 你的錢包**。payclaw 從不持有資金。

---

## Cloudflare Workers

```typescript
import { requirePayment } from "@teapper/payclaw-x402";

const gate = requirePayment({
  priceUsdc: 0.001,
  walletAddress: "0x你的錢包地址",
});

export default {
  fetch: gate.wrapFetch(async (req) => {
    return Response.json({ result: "工具輸出" });
  }),
};
```

## Vercel Edge / Next.js

```typescript
import { requirePayment } from "@teapper/payclaw-x402";

export const runtime = "edge";

const gate = requirePayment({
  priceUsdc: 0.001,
  walletAddress: "0x你的錢包地址",
});

export default gate.wrapFetch(async (req) => {
  return Response.json({ result: "工具輸出" });
});
```

## Express / Hono

```typescript
import express from "express";
import { requirePayment } from "@teapper/payclaw-x402";

const app = express();

const gate = requirePayment({
  priceUsdc: 0.001,
  walletAddress: "0x你的錢包地址",
});

app.post("/tool", gate, (req, res) => {
  res.json({ result: "工具輸出" });
});
```

---

## 回應格式

**HTTP 402 — 需要付款：**
```json
{
  "x402": true,
  "price": "0.001",
  "currency": "USDC",
  "network": "base-sepolia",
  "recipient": "0x你的錢包",
  "chain_id": 84532,
  "reason": "missing X-Payment header"
}
```

**HTTP 429 — 請求頻率超限：**
```json
{
  "error": "Too Many Requests",
  "reason": "rate limit exceeded"
}
```

## Base 主網

```typescript
import { requirePayment } from "@teapper/payclaw-x402";

const gate = requirePayment({
  priceUsdc: 0.001,
  walletAddress: "0x你的錢包",
  network: "base",
  chainId: 8453,
  usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  rpcUrl: "https://mainnet.base.org",
});
```

---

## 設定選項

| 參數 | 預設值 | 說明 |
|------|--------|------|
| `priceUsdc` | 必填 | 每次呼叫的 USDC 價格 |
| `walletAddress` | 必填 | 你的錢包（0x...） |
| `network` | `base-sepolia` | 網路名稱 |
| `chainId` | `84532` | Chain ID |
| `usdcAddress` | Base Sepolia USDC | USDC 合約地址 |
| `rpcUrl` | `https://sepolia.base.org` | JSON-RPC 端點 |
| `freshnessSeconds` | `300` | 交易最大有效時間（秒） |
| `nonceCacheTtl` | `600` | Nonce 快取 TTL（秒） |
| `nonceStore` | 記憶體 Map | 自訂 nonce 儲存（見下方） |
| `rateLimitRequests` | `10` | 每個 IP 每視窗最大請求數（0 = 停用） |
| `rateLimitWindowMs` | `60000` | 頻率限制視窗（毫秒） |
| `trustProxy` | `false` | 信任 X-Forwarded-For 做 per-IP 頻率限制。僅在受信任的反向代理後方設為 `true`。 |

---

## Nonce 儲存 — 多 Worker 警告

預設 nonce 儲存為**記憶體 Map**，僅適用於單一程序部署。

**多 Worker 實例無法防止重放攻擊。** 多 Worker 部署請使用共用儲存：

```typescript
import { requirePayment } from "@teapper/payclaw-x402";
import type { NonceStore } from "@teapper/payclaw-x402";

// Cloudflare Workers KV 適配器
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
  walletAddress: "0x你的錢包",
  nonceStore: createKVNonceStore(env.NONCE_KV),
});
```

---

## 取得測試網 USDC

從 [Circle faucet](https://faucet.circle.com) 免費取得測試網 USDC — 選擇 **Base Sepolia** 並貼上你的錢包地址。

---

## 安全性

- **重放保護**：Nonce 儲存防止 tx hash 重複使用。多 Worker 部署請使用共用儲存（KV、Redis）。
- **ERC-20 驗證**：從 `eth_getTransactionReceipt` 讀取 Transfer 事件日誌 — 而非 `tx.value`（USDC 的 `tx.value` 永遠為 0）。
- **交易狀態**：拒絕已回滾的交易（`status != 0x1`）。
- **整數運算**：USDC 金額以 BigInt 單位比較，無浮點數誤差。
- **區塊時間戳**：使用鏈上區塊時間戳進行新鮮度檢查。

---

## 法律聲明

MIT 授權。遵守制裁（OFAC）及相關法規是部署方的責任。

payclaw 僅為基礎設施軟體，並非支付處理器、貨幣傳輸業者或金融服務。本軟體不持有任何資金。IP 位址僅可能因頻率限制目的而暫時儲存。使用風險由使用者自行承擔。
