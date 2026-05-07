# payclaw

[English](#english) | [繁體中文](#繁體中文)

---

<a name="english"></a>

Drop-in x402 payment middleware for MCP servers. Charge AI agents per tool call using USDC on Base chain — 10 lines of code, no payment processor, no KYC.

```
pip install payclaw
```

## How it works

1. Agent calls your tool endpoint
2. No valid payment → server returns **HTTP 402** with price and wallet address
3. Agent pays USDC on Base chain, gets tx hash
4. Agent retries with `X-Payment: <tx_hash>` header
5. payclaw verifies on-chain → executes your tool

Money flows directly: **agent wallet → your wallet**. payclaw never holds funds.

---

## FastAPI

```python
from fastapi import FastAPI, Request
from payclaw import require_payment, PayclawConfig

app = FastAPI()

config = PayclawConfig(
    price_usdc=0.001,
    wallet_address="0xYourWalletAddress",
)

@app.post("/search")
@require_payment(config)
async def search(request: Request, q: str):
    return {"results": ["result1", "result2"]}
```

## Flask

```python
from flask import Flask, jsonify
from payclaw import require_payment, PayclawConfig

app = Flask(__name__)

config = PayclawConfig(
    price_usdc=0.001,
    wallet_address="0xYourWalletAddress",
)

@app.route("/search", methods=["POST"])
@require_payment(config)
def search():
    return jsonify({"results": ["result1", "result2"]})
```

## Custom framework

```python
from payclaw import PayclawMiddleware, PayclawConfig

config = PayclawConfig(price_usdc=0.001, wallet_address="0xYourWallet")
middleware = PayclawMiddleware(config)

# In your request handler:
allowed, reason = middleware.check(dict(request.headers))
if not allowed:
    status, body = middleware.response_for(reason)
    # return status response with body
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

---

## Base Mainnet

```python
from payclaw import mainnet_config, require_payment

config = mainnet_config(
    price_usdc=0.001,
    wallet_address="0xYourWallet",
)

@app.post("/tool")
@require_payment(config)
async def my_tool(request: Request):
    return {"result": "..."}
```

---

## Config options

| Parameter | Default | Description |
|-----------|---------|-------------|
| `price_usdc` | required | Price per call in USDC |
| `wallet_address` | required | Your wallet (0x...) |
| `network` | `base-sepolia` | Network name |
| `chain_id` | `84532` | Chain ID |
| `usdc_address` | Base Sepolia USDC | USDC contract address |
| `rpc_url` | `https://sepolia.base.org` | JSON-RPC endpoint |
| `freshness_seconds` | `300` | Max tx age in seconds |
| `nonce_cache_ttl` | `600` | Nonce cache TTL in seconds |
| `nonce_db_path` | `.payclaw_nonces.db` | SQLite file for replay protection |
| `rate_limit_requests` | `10` | Max requests per IP per window (0 = disabled) |
| `rate_limit_window_seconds` | `60` | Rate limit window in seconds |
| `trust_proxy` | `False` | Trust X-Forwarded-For for per-IP rate limiting. Set `True` only when behind a trusted reverse proxy. |

---

## Getting testnet USDC

Get free testnet USDC from the [Circle faucet](https://faucet.circle.com) — select **Base Sepolia** and paste your wallet address.

---

## Containerized deployments

The nonce cache is a SQLite file (default: `.payclaw_nonces.db`). In Docker or serverless environments, **mount a persistent volume**:

```python
config = PayclawConfig(
    price_usdc=0.001,
    wallet_address="0xYourWallet",
    nonce_db_path="/data/payclaw_nonces.db",
)
```

Without persistence, a container restart clears the nonce cache and allows replay attacks within the `freshness_seconds` window.

---

## Async frameworks (FastAPI)

`verify_payment` uses synchronous HTTP. For high-throughput deployments, wrap with `asyncio.to_thread`:

```python
import asyncio
from payclaw import PayclawMiddleware, PayclawConfig

middleware = PayclawMiddleware(config)

@app.post("/tool")
async def my_tool(request: Request):
    headers = dict(request.headers)
    allowed, reason = await asyncio.to_thread(middleware.check, headers)
    if not allowed:
        status, body = middleware.response_for(reason)
        return JSONResponse(status_code=status, content=body)
    return {"result": "..."}
```

---

## Security

- **Replay protection**: SQLite nonce cache survives restarts. Atomic INSERT OR IGNORE prevents race conditions.
- **ERC-20 verification**: Reads Transfer event logs from `eth_getTransactionReceipt` — not `tx.value` (always 0 for USDC).
- **Integer math**: USDC amounts compared as integer units. No floating point.
- **Block timestamp**: Uses on-chain block timestamp for freshness check.

---

## Legal

MIT License. Compliance with sanctions (OFAC) and applicable regulations is the responsibility of the deploying party.

payclaw is infrastructure software only. It is not a payment processor, money transmitter, or financial service. It does not custody funds. IP addresses may be temporarily stored for rate limiting purposes only. Use at your own risk.

---

<a name="繁體中文"></a>

# payclaw（繁體中文）

適用於 MCP 伺服器的 x402 支付中介軟體。讓 AI 代理每次工具呼叫使用 Base 鏈上的 USDC 付款 — 10 行程式碼，無需支付處理器，無需 KYC。

```
pip install payclaw
```

## 運作原理

1. Agent 呼叫你的工具端點
2. 無有效付款 → 伺服器返回 **HTTP 402**，附上價格和錢包地址
3. Agent 在 Base 鏈支付 USDC，取得 tx hash
4. Agent 帶上 `X-Payment: <tx_hash>` header 重試
5. payclaw 在鏈上驗證 → 執行工具

資金直接流轉：**Agent 錢包 → 你的錢包**。payclaw 從不持有資金。

---

## FastAPI

```python
from fastapi import FastAPI, Request
from payclaw import require_payment, PayclawConfig

app = FastAPI()

config = PayclawConfig(
    price_usdc=0.001,
    wallet_address="0x你的錢包地址",
)

@app.post("/search")
@require_payment(config)
async def search(request: Request, q: str):
    return {"results": ["result1", "result2"]}
```

## Flask

```python
from flask import Flask, jsonify
from payclaw import require_payment, PayclawConfig

app = Flask(__name__)

config = PayclawConfig(
    price_usdc=0.001,
    wallet_address="0x你的錢包地址",
)

@app.route("/search", methods=["POST"])
@require_payment(config)
def search():
    return jsonify({"results": ["result1", "result2"]})
```

## 自訂框架

```python
from payclaw import PayclawMiddleware, PayclawConfig

config = PayclawConfig(price_usdc=0.001, wallet_address="0x你的錢包")
middleware = PayclawMiddleware(config)

# 在你的請求處理器中：
allowed, reason = middleware.check(dict(request.headers))
if not allowed:
    status, body = middleware.response_for(reason)
    # 返回 status 狀態碼與 body
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

---

## Base 主網

```python
from payclaw import mainnet_config, require_payment

config = mainnet_config(
    price_usdc=0.001,
    wallet_address="0x你的錢包",
)

@app.post("/tool")
@require_payment(config)
async def my_tool(request: Request):
    return {"result": "..."}
```

---

## 設定選項

| 參數 | 預設值 | 說明 |
|------|--------|------|
| `price_usdc` | 必填 | 每次呼叫的 USDC 價格 |
| `wallet_address` | 必填 | 你的錢包（0x...） |
| `network` | `base-sepolia` | 網路名稱 |
| `chain_id` | `84532` | Chain ID |
| `usdc_address` | Base Sepolia USDC | USDC 合約地址 |
| `rpc_url` | `https://sepolia.base.org` | JSON-RPC 端點 |
| `freshness_seconds` | `300` | 交易最大有效時間（秒） |
| `nonce_cache_ttl` | `600` | Nonce 快取 TTL（秒） |
| `nonce_db_path` | `.payclaw_nonces.db` | 重放保護用 SQLite 檔案 |
| `rate_limit_requests` | `10` | 每個 IP 每視窗最大請求數（0 = 停用） |
| `rate_limit_window_seconds` | `60` | 頻率限制視窗（秒） |
| `trust_proxy` | `False` | 信任 X-Forwarded-For 做 per-IP 頻率限制。僅在受信任的反向代理後方設為 `True`。 |

---

## 取得測試網 USDC

從 [Circle faucet](https://faucet.circle.com) 免費取得測試網 USDC — 選擇 **Base Sepolia** 並貼上你的錢包地址。

---

## 容器化部署

Nonce 快取為 SQLite 檔案（預設：`.payclaw_nonces.db`）。在 Docker 或無伺服器環境中，請**掛載持久儲存空間**：

```python
config = PayclawConfig(
    price_usdc=0.001,
    wallet_address="0x你的錢包",
    nonce_db_path="/data/payclaw_nonces.db",
)
```

未持久化時，容器重啟會清空 nonce 快取，允許在 `freshness_seconds` 視窗內進行重放攻擊。

---

## 非同步框架（FastAPI）

`verify_payment` 使用同步 HTTP。高吞吐量部署時，用 `asyncio.to_thread` 包裝：

```python
import asyncio
from payclaw import PayclawMiddleware, PayclawConfig

middleware = PayclawMiddleware(config)

@app.post("/tool")
async def my_tool(request: Request):
    headers = dict(request.headers)
    allowed, reason = await asyncio.to_thread(middleware.check, headers)
    if not allowed:
        status, body = middleware.response_for(reason)
        return JSONResponse(status_code=status, content=body)
    return {"result": "..."}
```

---

## 安全性

- **重放保護**：SQLite nonce 快取在程序重啟後仍存在。原子性 INSERT OR IGNORE 防止競態條件。
- **ERC-20 驗證**：從 `eth_getTransactionReceipt` 讀取 Transfer 事件日誌 — 而非 `tx.value`（USDC 轉帳的 `tx.value` 永遠為 0）。
- **整數運算**：USDC 金額以整數單位比較，無浮點數誤差。
- **區塊時間戳**：使用鏈上區塊時間戳進行新鮮度檢查。

---

## 法律聲明

MIT 授權。遵守制裁（OFAC）及相關法規是部署方的責任。

payclaw 僅為基礎設施軟體，並非支付處理器、貨幣傳輸業者或金融服務。本軟體不持有任何資金。IP 位址僅可能因頻率限制目的而暫時儲存。使用風險由使用者自行承擔。
