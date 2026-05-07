import pytest
from payclaw.config import PayclawConfig, mainnet_config

WALLET = "0x" + "a" * 40


def test_valid_config():
    cfg = PayclawConfig(price_usdc=0.001, wallet_address=WALLET)
    assert cfg.price_units == 1000


def test_decimal_precision():
    assert PayclawConfig(price_usdc=0.1, wallet_address=WALLET).price_units == 100000
    assert PayclawConfig(price_usdc=1.0, wallet_address=WALLET).price_units == 1_000_000
    assert PayclawConfig(price_usdc=0.000001, wallet_address=WALLET).price_units == 1


def test_invalid_wallet_short():
    with pytest.raises(ValueError, match="Invalid wallet_address"):
        PayclawConfig(price_usdc=0.001, wallet_address="0xabc")


def test_invalid_wallet_no_prefix():
    with pytest.raises(ValueError, match="Invalid wallet_address"):
        PayclawConfig(price_usdc=0.001, wallet_address="a" * 42)


def test_invalid_price_zero():
    with pytest.raises(ValueError, match="price_usdc must be > 0"):
        PayclawConfig(price_usdc=0, wallet_address=WALLET)


def test_invalid_price_negative():
    with pytest.raises(ValueError, match="price_usdc must be > 0"):
        PayclawConfig(price_usdc=-1, wallet_address=WALLET)


def test_nonce_ttl_validation():
    with pytest.raises(ValueError, match="nonce_cache_ttl"):
        PayclawConfig(price_usdc=0.001, wallet_address=WALLET, nonce_cache_ttl=100, freshness_seconds=300)


def test_mainnet_config():
    cfg = mainnet_config(0.001, WALLET)
    assert cfg.chain_id == 8453
    assert cfg.network == "base"
    assert "mainnet" in cfg.rpc_url
    assert cfg.price_units == 1000


def test_mainnet_config_kwargs():
    cfg = mainnet_config(0.001, WALLET, rate_limit_requests=5)
    assert cfg.rate_limit_requests == 5
