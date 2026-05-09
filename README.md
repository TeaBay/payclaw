# payclaw

[English](#english) | [繁體中文](#繁體中文)

[![payclaw MCP server](https://glama.ai/mcp/servers/TeaBay/payclaw/badges/score.svg)](https://glama.ai/mcp/servers/TeaBay/payclaw)
[![PyPI](https://img.shields.io/pypi/v/payclaw)](https://pypi.org/project/payclaw/)
[![npm](https://img.shields.io/npm/v/payclaw-x402)](https://www.npmjs.com/package/payclaw-x402)
[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/F1F01XSFJ0)

---

<a name="english"></a>

Drop-in x402 payment middleware for MCP servers. Charge AI agents per tool call using USDC on Base chain — 10 lines of code, no payment processor, no KYC.

Money flows directly: **agent wallet → your wallet**. payclaw never holds funds.

---

## Quick Start

**Python**
```bash
pip install payclaw
```

```python
from fastapi import FastAPI, Request
from payclaw import require_payment, PayclawConfig

app = FastAPI()
config = PayclawConfig(price_usdc=0.001, wallet_address="0xYourWallet")

@app.post("/tool")
@require_payment(config)
async def my_tool(request: Request):
    return {"result": "tool output"}
```

**JavaScript / TypeScript**
```bash
npm install payclaw-x402
```

```typescript
import { requirePayment } from "payclaw-x402";

const gate = requirePayment({ priceUsdc: 0.001, walletAddress: "0xYourWallet" });

export default { fetch: gate.wrapFetch(async (req) => {
  return Response.json({ result: "tool output" });
})};
```

---

## How it works

1. Agent calls your tool endpoint
2. No valid payment → server returns **HTTP 402** with price and wallet address
3. Agent pays USDC on Base chain, gets tx hash
4. Agent retries with `X-Payment: <tx_hash>` header
5. payclaw verifies on-chain → executes your tool

---

## Packages

| Package | Install | Docs |
|---------|---------|------|
| Python SDK | `pip install payclaw` | [sdk/python](sdk/python/) |
| JavaScript SDK | `npm install payclaw-x402` | [sdk/js](sdk/js/) |
| payclaw Search MCP | Live at `payclaw-mcp.vercel.app` | [demo-mcp-server](demo-mcp-server/) |

**payclaw Search MCP** is a production MCP server that charges agents per search query using x402. Use it as a reference implementation or connect directly.

**Live endpoint:** `https://payclaw-mcp.vercel.app/api/mcp`

Connect with Claude Desktop:
```json
{
  "mcpServers": {
    "payclaw": {
      "command": "npx",
      "args": ["mcp-remote", "https://payclaw-mcp.vercel.app/api/mcp"]
    }
  }
}
```

---

## Base Mainnet

```python
from payclaw import mainnet_config
config = mainnet_config(price_usdc=0.001, wallet_address="0xYourWallet")
```

```typescript
const gate = requirePayment({
  priceUsdc: 0.001, walletAddress: "0xYourWallet",
  network: "base", chainId: 8453,
  usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  rpcUrl: "https://mainnet.base.org",
});
```

---

## Security

- Replay protection via SQLite (Python) or Redis/KV (JS)
- ERC-20 Transfer event verification (not `tx.value`)
- Chain ID verification (prevents testnet replay attacks)
- Receipt status check (rejects reverted transactions)
- Integer math for USDC amounts (no floating point)

---

## Legal

MIT License. payclaw is infrastructure software only. It is not a payment processor, money transmitter, or financial service. It does not custody funds. IP addresses may be temporarily stored for rate limiting purposes only. Use at your own risk. Compliance with sanctions (OFAC) and applicable regulations is the responsibility of the deploying party.

---

<a name="繁體中文"></a>

# payclaw（繁體中文）

[![payclaw MCP server](https://glama.ai/mcp/servers/TeaBay/payclaw/badges/score.svg)](https://glama.ai/mcp/servers/TeaBay/payclaw)
[![PyPI](https://img.shields.io/pypi/v/payclaw)](https://pypi.org/project/payclaw/)
[![npm](https://img.shields.io/npm/v/payclaw-x402)](https://www.npmjs.com/package/payclaw-x402)
[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/F1F01XSFJ0)

適用於 MCP 伺服器的 x402 支付中介軟體。讓 AI 代理每次工具呼叫使用 Base 鏈上的 USDC 付款 — 10 行程式碼，無需支付處理器，無需 KYC。

資金直接流轉：**Agent 錢包 → 你的錢包**。payclaw 從不持有資金。

---

## 快速開始

**Python**
```bash
pip install payclaw
```

```python
from fastapi import FastAPI, Request
from payclaw import require_payment, PayclawConfig

app = FastAPI()
config = PayclawConfig(price_usdc=0.001, wallet_address="0x你的錢包")

@app.post("/tool")
@require_payment(config)
async def my_tool(request: Request):
    return {"result": "工具輸出"}
```

**JavaScript / TypeScript**
```bash
npm install payclaw-x402
```

```typescript
import { requirePayment } from "payclaw-x402";

const gate = requirePayment({ priceUsdc: 0.001, walletAddress: "0x你的錢包" });

export default { fetch: gate.wrapFetch(async (req) => {
  return Response.json({ result: "工具輸出" });
})};
```

---

## 運作原理

1. Agent 呼叫你的工具端點
2. 無有效付款 → 伺服器返回 **HTTP 402**，附上價格和錢包地址
3. Agent 在 Base 鏈支付 USDC，取得 tx hash
4. Agent 帶上 `X-Payment: <tx_hash>` header 重試
5. payclaw 在鏈上驗證 → 執行工具

---

## 套件

| 套件 | 安裝 | 文件 |
|------|------|------|
| Python SDK | `pip install payclaw` | [sdk/python](sdk/python/) |
| JavaScript SDK | `npm install payclaw-x402` | [sdk/js](sdk/js/) |
| payclaw Search MCP | 線上於 `payclaw-mcp.vercel.app` | [demo-mcp-server](demo-mcp-server/) |

**payclaw Search MCP** 係一個生產環境 MCP server，每次搜尋查詢向 agent 收取 x402 費用。可作為參考實作或直接連接使用。

**線上端點：** `https://payclaw-mcp.vercel.app/api/mcp`

以 Claude Desktop 連接：
```json
{
  "mcpServers": {
    "payclaw": {
      "command": "npx",
      "args": ["mcp-remote", "https://payclaw-mcp.vercel.app/api/mcp"]
    }
  }
}
```

---

## 法律聲明

MIT 授權。payclaw 僅為基礎設施軟體，並非支付處理器、貨幣傳輸業者或金融服務。本軟體不持有任何資金。使用風險由使用者自行承擔。遵守制裁（OFAC）及相關法規是部署方的責任。
