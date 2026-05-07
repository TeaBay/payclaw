# payclaw

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
    status, body = middleware.payment_required(reason)
    # return 402 response with body
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
| `price_usdc` | required | Price per call in USDC |
| `wallet_address` | required | Your wallet (0x...) |
| `network` | `base-sepolia` | Network name |
| `chain_id` | `84532` | Chain ID |
| `usdc_address` | Base Sepolia USDC | USDC contract address |
| `rpc_url` | `https://sepolia.base.org` | JSON-RPC endpoint |
| `freshness_seconds` | `300` | Max tx age in seconds |
| `nonce_cache_ttl` | `600` | Nonce cache TTL in seconds |
| `nonce_db_path` | `.payclaw_nonces.db` | SQLite file for replay protection |

---

## Security

- **Replay protection**: SQLite nonce cache survives process restarts. Atomic INSERT OR IGNORE prevents race conditions.
- **ERC-20 verification**: Reads Transfer event logs from `eth_getTransactionReceipt` — not `tx.value` (which is always 0 for USDC).
- **Integer math**: USDC amounts compared as integer units (1 USDC = 1,000,000 units). No floating point.
- **Block timestamp**: Uses on-chain block timestamp for freshness check, not local clock.
- **Address matching**: Case-insensitive comparison (EIP-55 safe).

---

## Legal

MIT License. payclaw is infrastructure software. Compliance with sanctions (OFAC) and applicable regulations is the responsibility of the deploying party.
