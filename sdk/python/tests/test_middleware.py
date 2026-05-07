import pytest
from payclaw.config import PayclawConfig
from payclaw.middleware import PayclawMiddleware

WALLET = "0x" + "a" * 40
TX = "0x" + "f" * 64


@pytest.fixture
def mw(tmp_path):
    cfg = PayclawConfig(price_usdc=0.001, wallet_address=WALLET,
                        nonce_db_path=str(tmp_path / "n.db"), rate_limit_requests=0)
    return PayclawMiddleware(cfg)


def test_missing_header(mw):
    ok, reason = mw.check({})
    assert ok is False
    assert reason == "missing X-Payment header"


def test_short_hash(mw):
    ok, reason = mw.check({"x-payment": "0xabc"})
    assert ok is False
    assert "format" in reason


def test_non_hex_hash(mw):
    ok, reason = mw.check({"x-payment": "0x" + "z" * 64})
    assert ok is False
    assert "non-hex" in reason


def test_valid_format_hits_rpc(mw):
    from unittest.mock import patch
    def rpc_side_effect(url, method, params, retries=3):
        if method == "eth_chainId":
            return "0x14a34"  # base-sepolia
        return None
    with patch("payclaw.verify._rpc", side_effect=rpc_side_effect):
        ok, reason = mw.check({"x-payment": TX})
    assert ok is False
    assert "not found" in reason


def test_rate_limit(tmp_path):
    cfg = PayclawConfig(price_usdc=0.001, wallet_address=WALLET,
                        nonce_db_path=str(tmp_path / "n.db"),
                        rate_limit_requests=2, rate_limit_window_seconds=60)
    mw = PayclawMiddleware(cfg)
    headers = {"x-forwarded-for": "1.2.3.4"}
    mw.check(headers)
    mw.check(headers)
    ok, reason = mw.check(headers)
    assert ok is False
    assert reason == "rate limit exceeded"


def test_rate_limit_different_ips(tmp_path):
    cfg = PayclawConfig(price_usdc=0.001, wallet_address=WALLET,
                        nonce_db_path=str(tmp_path / "n.db"),
                        rate_limit_requests=1, rate_limit_window_seconds=60,
                        trust_proxy=True)
    mw = PayclawMiddleware(cfg)
    mw.check({"x-forwarded-for": "1.1.1.1"})
    ok, reason = mw.check({"x-forwarded-for": "2.2.2.2"})
    assert reason != "rate limit exceeded"


def test_payment_required_body(mw):
    status, body = mw.payment_required("test reason")
    assert status == 402
    assert body["x402"] is True
    assert body["currency"] == "USDC"
    assert body["reason"] == "test reason"


def test_response_for_rate_limit(mw):
    status, body = mw.response_for("rate limit exceeded")
    assert status == 429
    assert body["error"] == "Too Many Requests"
    assert body["reason"] == "rate limit exceeded"


def test_response_for_payment_required(mw):
    status, body = mw.response_for("tx not found")
    assert status == 402
    assert body["x402"] is True
