import asyncio
import functools
import threading
import time
from collections import defaultdict

from payclaw.config import PayclawConfig
from payclaw.nonce_cache import NonceCache
from payclaw.verify import verify_payment


class _RateLimiter:
    """Per-key sliding window rate limiter."""

    def __init__(self, max_requests: int, window_seconds: int):
        self._max = max_requests
        self._window = window_seconds
        self._lock = threading.Lock()
        self._log: dict[str, list[float]] = defaultdict(list)

    def is_allowed(self, key: str) -> bool:
        now = time.monotonic()
        cutoff = now - self._window
        with self._lock:
            fresh = [t for t in self._log.get(key, []) if t > cutoff]
            if len(fresh) >= self._max:
                self._log[key] = fresh
                return False
            fresh.append(now)
            self._log[key] = fresh
            return True

    def evict(self):
        """Remove keys with no recent requests. Call periodically if needed."""
        now = time.monotonic()
        cutoff = now - self._window
        with self._lock:
            stale = [k for k, ts in self._log.items() if not any(t > cutoff for t in ts)]
            for k in stale:
                del self._log[k]


def _build_402(config: PayclawConfig, reason: str = "") -> dict:
    body = {
        "x402": True,
        "price": str(config.price_usdc),
        "currency": "USDC",
        "network": config.network,
        "recipient": config.wallet_address,
        "chain_id": config.chain_id,
    }
    if reason:
        body["reason"] = reason
    return body


class PayclawMiddleware:
    """Framework-agnostic payment gate. Use .check(headers) directly for custom integrations."""

    def __init__(self, config: PayclawConfig):
        self.config = config
        self._nonce_cache = NonceCache(config.nonce_db_path, config.nonce_cache_ttl)
        self._rate_limiter = (
            _RateLimiter(config.rate_limit_requests, config.rate_limit_window_seconds)
            if config.rate_limit_requests > 0
            else None
        )

    def check(self, headers: dict) -> tuple[bool, str]:
        """
        Returns (allowed, reason).
        headers: any dict-like with HTTP headers (case-insensitive lookup attempted).
        """
        if self._rate_limiter:
            ip = self._client_ip(headers)
            if not self._rate_limiter.is_allowed(ip):
                return False, "rate limit exceeded"

        tx_hash = headers.get("X-Payment") or headers.get("x-payment")
        if not tx_hash:
            return False, "missing X-Payment header"
        tx_hash = tx_hash.strip()
        if not tx_hash.startswith("0x") or len(tx_hash) != 66:
            return False, "invalid tx hash format (must be 0x + 64 hex chars)"
        try:
            int(tx_hash, 16)
        except ValueError:
            return False, "invalid tx hash format (non-hex characters)"
        return verify_payment(tx_hash, self.config, self._nonce_cache)

    def payment_required(self, reason: str = "") -> tuple[int, dict]:
        return 402, _build_402(self.config, reason)

    def response_for(self, reason: str) -> tuple[int, dict]:
        if reason == "rate limit exceeded":
            return 429, {"error": "Too Many Requests", "reason": reason}
        return self.payment_required(reason)

    def _client_ip(self, headers: dict) -> str:
        if self.config.trust_proxy:
            forwarded = headers.get("X-Forwarded-For") or headers.get("x-forwarded-for", "")
            if forwarded:
                return forwarded.split(",")[0].strip()
        return "unknown"


def require_payment(config: PayclawConfig):
    """
    Decorator that gates any FastAPI or Flask handler behind x402 payment.

    FastAPI: the decorated function must accept `request: Request` as a parameter.
    Flask: uses flask.request context automatically.

    For other frameworks, use PayclawMiddleware.check(headers) directly.

    Example (FastAPI):
        @app.post("/tool")
        @require_payment(config)
        async def my_tool(request: Request):
            return {"result": "..."}

    Example (Flask):
        @app.route("/tool", methods=["POST"])
        @require_payment(config)
        def my_tool():
            return jsonify({"result": "..."})
    """
    middleware = PayclawMiddleware(config)

    def decorator(func):
        if asyncio.iscoroutinefunction(func):
            @functools.wraps(func)
            async def async_wrapper(*args, **kwargs):
                headers = _extract_headers(args, kwargs)
                allowed, reason = middleware.check(headers)
                if not allowed:
                    status, body = middleware.response_for(reason)
                    return _fastapi_response(status, body)
                return await func(*args, **kwargs)
            return async_wrapper
        else:
            @functools.wraps(func)
            def sync_wrapper(*args, **kwargs):
                headers = _flask_headers()
                allowed, reason = middleware.check(headers)
                if not allowed:
                    status, body = middleware.response_for(reason)
                    return _flask_response(status, body)
                return func(*args, **kwargs)
            return sync_wrapper

    return decorator


def _extract_headers(args, kwargs) -> dict:
    """Pull headers from a FastAPI Request object in args or kwargs."""
    request = kwargs.get("request")
    if request is None:
        for a in args:
            if hasattr(a, "headers"):
                request = a
                break
    if request and hasattr(request, "headers"):
        return dict(request.headers)
    return {}


def _flask_headers() -> dict:
    try:
        from flask import request
        return dict(request.headers)
    except (ImportError, RuntimeError):
        return {}


def _fastapi_response(status: int, body: dict):
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=status, content=body)


def _flask_response(status: int, body: dict):
    try:
        from flask import jsonify, make_response
        return make_response(jsonify(body), status)
    except ImportError:
        return body, status
