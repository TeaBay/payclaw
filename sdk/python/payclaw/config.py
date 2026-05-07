from dataclasses import dataclass
from decimal import Decimal

USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
RPC_BASE_SEPOLIA = "https://sepolia.base.org"

USDC_BASE_MAINNET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
RPC_BASE_MAINNET = "https://mainnet.base.org"


@dataclass
class PayclawConfig:
    price_usdc: float
    wallet_address: str
    network: str = "base-sepolia"
    chain_id: int = 84532
    usdc_address: str = USDC_BASE_SEPOLIA
    rpc_url: str = RPC_BASE_SEPOLIA
    freshness_seconds: int = 300
    nonce_cache_ttl: int = 600
    nonce_db_path: str = ".payclaw_nonces.db"
    rate_limit_requests: int = 10
    rate_limit_window_seconds: int = 60

    def __post_init__(self):
        if (
            not isinstance(self.wallet_address, str)
            or not self.wallet_address.startswith("0x")
            or len(self.wallet_address) != 42
        ):
            raise ValueError(f"Invalid wallet_address: {self.wallet_address!r}")
        if self.price_usdc <= 0:
            raise ValueError("price_usdc must be > 0")
        if self.nonce_cache_ttl < self.freshness_seconds:
            raise ValueError("nonce_cache_ttl must be >= freshness_seconds")

    @property
    def price_units(self) -> int:
        return int(Decimal(str(self.price_usdc)) * 1_000_000)


def mainnet_config(price_usdc: float, wallet_address: str, **kwargs) -> "PayclawConfig":
    """Convenience factory for Base mainnet."""
    return PayclawConfig(
        price_usdc=price_usdc,
        wallet_address=wallet_address,
        network="base",
        chain_id=8453,
        usdc_address=USDC_BASE_MAINNET,
        rpc_url=RPC_BASE_MAINNET,
        **kwargs,
    )
