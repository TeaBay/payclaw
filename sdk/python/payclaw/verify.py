import time
import requests

# keccak256("Transfer(address,address,uint256)")
TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"


def _rpc(rpc_url: str, method: str, params: list, retries: int = 3):
    payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    delay = 1.0
    last_err = None
    for _ in range(retries):
        try:
            resp = requests.post(rpc_url, json=payload, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            if "error" in data:
                raise ValueError(f"RPC error: {data['error']}")
            return data.get("result")
        except Exception as e:
            last_err = e
            time.sleep(delay)
            delay *= 2
    raise ConnectionError(f"RPC failed after {retries} retries: {last_err}")


def _decode_address(padded: str) -> str:
    return "0x" + padded[-40:]


def verify_payment(tx_hash: str, config, nonce_cache) -> tuple[bool, str]:
    if nonce_cache.is_used(tx_hash):
        return False, "tx already used"

    chain_id_hex = _rpc(config.rpc_url, "eth_chainId", [])
    actual_chain_id = int(chain_id_hex, 16)
    if actual_chain_id != config.chain_id:
        return False, f"chain mismatch: expected {config.chain_id}, got {actual_chain_id}"

    tx = _rpc(config.rpc_url, "eth_getTransactionByHash", [tx_hash])
    if tx is None:
        return False, "tx not found"

    # USDC is ERC-20 — the amount is NOT in tx.value (that is always 0 for token transfers).
    # The real amount is in the Transfer event log of the receipt.
    receipt = _rpc(config.rpc_url, "eth_getTransactionReceipt", [tx_hash])
    if receipt is None:
        return False, "tx receipt not found"

    # Reject reverted transactions — logs are stripped on revert in EVM, but check anyway
    if receipt.get("status") != "0x1":
        return False, "tx reverted (status != 0x1)"

    usdc_log = None
    for log in receipt.get("logs", []):
        topics = log.get("topics", [])
        if (
            len(topics) >= 3
            and topics[0].lower() == TRANSFER_TOPIC
            and log.get("address", "").lower() == config.usdc_address.lower()
            and _decode_address(topics[2]).lower() == config.wallet_address.lower()
        ):
            usdc_log = log
            break

    if usdc_log is None:
        return False, "no USDC transfer to recipient found in tx"

    try:
        value = int(usdc_log.get("data", "0x0"), 16)
    except ValueError:
        return False, "malformed transfer amount in log data"
    if value < config.price_units:
        return False, f"insufficient USDC: got {value} units, need {config.price_units}"

    block = _rpc(config.rpc_url, "eth_getBlockByNumber", [tx.get("blockNumber"), False])
    if block is None:
        return False, "block not found"

    block_ts = int(block["timestamp"], 16)
    age = abs(int(time.time()) - block_ts)
    if age > config.freshness_seconds:
        return False, f"tx too old: {age}s (max {config.freshness_seconds}s)"

    if not nonce_cache.mark_used(tx_hash):
        return False, "tx already used (race condition)"

    return True, "ok"
