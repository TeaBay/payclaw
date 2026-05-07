import sqlite3
import threading
import time


class NonceCache:
    def __init__(self, db_path: str, ttl: int = 600):
        self._ttl = ttl
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("""
            CREATE TABLE IF NOT EXISTS used_nonces (
                tx_hash TEXT PRIMARY KEY,
                used_at INTEGER NOT NULL
            )
        """)
        self._conn.commit()

    def is_used(self, tx_hash: str) -> bool:
        row = self._conn.execute(
            "SELECT 1 FROM used_nonces WHERE tx_hash = ?", (tx_hash.lower(),)
        ).fetchone()
        return row is not None

    def mark_used(self, tx_hash: str) -> bool:
        """Atomically mark a tx hash as used. Returns True only on first use."""
        tx_hash = tx_hash.lower()
        now = int(time.time())
        with self._lock:
            self._cleanup(now)
            cursor = self._conn.execute(
                "INSERT OR IGNORE INTO used_nonces (tx_hash, used_at) VALUES (?, ?)",
                (tx_hash, now),
            )
            self._conn.commit()
            return cursor.rowcount == 1

    def _cleanup(self, now: int):
        self._conn.execute(
            "DELETE FROM used_nonces WHERE used_at < ?",
            (now - self._ttl,),
        )
