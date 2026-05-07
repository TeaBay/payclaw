"""
payclaw - Drop-in payment middleware for MCP servers using x402 protocol.

Usage:
    from payclaw import require_payment, PayclawConfig

    config = PayclawConfig(
        price_usdc=0.001,
        wallet_address="0xYourWalletAddress",
    )

    @require_payment(config)
    async def my_mcp_tool(params):
        return {"result": "tool output"}
"""

from payclaw.config import PayclawConfig, mainnet_config
from payclaw.middleware import PayclawMiddleware, require_payment
from payclaw.nonce_cache import NonceCache
from payclaw.verify import verify_payment

__all__ = ["require_payment", "PayclawMiddleware", "PayclawConfig", "mainnet_config", "NonceCache", "verify_payment"]
__version__ = "0.1.0"
