import os
import tempfile
import threading
import pytest
from payclaw.nonce_cache import NonceCache

TX = "0x" + "b" * 64


@pytest.fixture
def cache(tmp_path):
    return NonceCache(str(tmp_path / "nonces.db"), ttl=600)


def test_mark_used_first_time(cache):
    assert cache.mark_used(TX) is True


def test_mark_used_second_time(cache):
    cache.mark_used(TX)
    assert cache.mark_used(TX) is False


def test_is_used_after_mark(cache):
    cache.mark_used(TX)
    assert cache.is_used(TX) is True


def test_is_used_before_mark(cache):
    assert cache.is_used(TX) is False


def test_case_insensitive(cache):
    cache.mark_used(TX.upper())
    assert cache.is_used(TX.lower()) is True


def test_survives_restart(tmp_path):
    db = str(tmp_path / "nonces.db")
    cache1 = NonceCache(db, ttl=600)
    cache1.mark_used(TX)
    cache2 = NonceCache(db, ttl=600)
    assert cache2.is_used(TX) is True


def test_concurrent_mark_only_one_succeeds(cache):
    results = []
    def worker():
        results.append(cache.mark_used(TX))
    threads = [threading.Thread(target=worker) for _ in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert results.count(True) == 1
    assert results.count(False) == 9


def test_ttl_cleanup(tmp_path):
    cache = NonceCache(str(tmp_path / "nonces.db"), ttl=1)
    cache.mark_used(TX)
    import time; time.sleep(2)
    tx2 = "0x" + "c" * 64
    cache.mark_used(tx2)
    assert cache.is_used(TX) is False
