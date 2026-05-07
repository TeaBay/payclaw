from dataclasses import dataclass

USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
RPC_BASE_SEPOLIA = "https://sepolia.base.org"


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

    def __post_init__(self):
        if (
            not isinstance(self.wallet_address, str)
            or not self.wallet_address.startswith("0x")
            or len(self.wallet_address) != 42
        ):
            raise ValueError(f"Invalid wallet_address: {self.wallet_address!r}")
        if self.price_usdc <= 0:
            raise ValueError("price_usdc must be > 0")

    @property
    def price_units(self) -> int:
        # USDC has 6 decimals — integer math only, no floats in comparisons
        return int(round(self.price_usdc * 1_000_000))
