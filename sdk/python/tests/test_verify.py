from unittest.mock import patch, MagicMock
import pytest
from payclaw.config import PayclawConfig
from payclaw.nonce_cache import NonceCache
from payclaw.verify import verify_payment

WALLET = "0x" + "a" * 40
TX = "0x" + "f" * 64
USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

import time
RECENT_TS = hex(int(time.time()) - 10)


def make_receipt(to_addr=WALLET, value_hex="0x3e8", status="0x1"):
    padded_to = "0x" + "0" * 24 + to_addr[2:]
    return {
        "status": status,
        "logs": [{
            "address": USDC,
            "topics": [TRANSFER_TOPIC, "0x" + "0" * 64, padded_to],
            "data": value_hex,
        }],
    }


def make_tx(block_number="0x1"):
    return {"blockNumber": block_number}


def make_block(timestamp=None):
    return {"timestamp": timestamp or RECENT_TS}


@pytest.fixture
def cfg(tmp_path):
    return PayclawConfig(price_usdc=0.001, wallet_address=WALLET,
                         nonce_db_path=str(tmp_path / "n.db"), rate_limit_requests=0)


@pytest.fixture
def cache(cfg):
    return NonceCache(cfg.nonce_db_path)


CHAIN_ID_HEX = "0x14a34"  # 84532 = base-sepolia


def _rpc_side_effect(tx, receipt, block, chain_id=CHAIN_ID_HEX):
    def side_effect(url, method, params, retries=3):
        if method == "eth_chainId":
            return chain_id
        if method == "eth_getTransactionByHash":
            return tx
        if method == "eth_getTransactionReceipt":
            return receipt
        if method == "eth_getBlockByNumber":
            return block
    return side_effect


def test_valid_payment(cfg, cache):
    with patch("payclaw.verify._rpc", side_effect=_rpc_side_effect(
        make_tx(), make_receipt(value_hex="0x3e8"), make_block()
    )):
        ok, reason = verify_payment(TX, cfg, cache)
    assert ok is True
    assert reason == "ok"


def test_replay_rejected(cfg, cache):
    cache.mark_used(TX)
    ok, reason = verify_payment(TX, cfg, cache)
    assert ok is False
    assert "already used" in reason


def test_tx_not_found(cfg, cache):
    with patch("payclaw.verify._rpc", side_effect=_rpc_side_effect(None, None, None)):
        ok, reason = verify_payment(TX, cfg, cache)
    assert ok is False
    assert "not found" in reason


def test_chain_mismatch(cfg, cache):
    with patch("payclaw.verify._rpc", side_effect=_rpc_side_effect(
        make_tx(), make_receipt(), make_block(), chain_id="0x1"  # Ethereum mainnet
    )):
        ok, reason = verify_payment(TX, cfg, cache)
    assert ok is False
    assert "chain mismatch" in reason


def test_reverted_tx(cfg, cache):
    with patch("payclaw.verify._rpc", side_effect=_rpc_side_effect(
        make_tx(), make_receipt(status="0x0"), make_block()
    )):
        ok, reason = verify_payment(TX, cfg, cache)
    assert ok is False
    assert "reverted" in reason


def test_wrong_recipient(cfg, cache):
    wrong = "0x" + "b" * 40
    with patch("payclaw.verify._rpc", side_effect=_rpc_side_effect(
        make_tx(), make_receipt(to_addr=wrong), make_block()
    )):
        ok, reason = verify_payment(TX, cfg, cache)
    assert ok is False
    assert "recipient" in reason


def test_insufficient_amount(cfg, cache):
    with patch("payclaw.verify._rpc", side_effect=_rpc_side_effect(
        make_tx(), make_receipt(value_hex="0x1"), make_block()
    )):
        ok, reason = verify_payment(TX, cfg, cache)
    assert ok is False
    assert "insufficient" in reason


def test_stale_tx(cfg, cache):
    old_ts = hex(int(time.time()) - 400)
    with patch("payclaw.verify._rpc", side_effect=_rpc_side_effect(
        make_tx(), make_receipt(value_hex="0x3e8"), make_block(old_ts)
    )):
        ok, reason = verify_payment(TX, cfg, cache)
    assert ok is False
    assert "old" in reason
