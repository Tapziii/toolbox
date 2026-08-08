"""SQLite database wrapper for item deduplication."""

import sqlite3
from datetime import datetime, timedelta


class DatabaseManager:
    """Manages an SQLite database to track previously seen eBay item IDs,
    guaranteeing zero duplicate Telegram alerts across restarts."""

    def __init__(self, db_path: str = "seen_items.db"):
        self.db_path = db_path
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        self.init_db()

    # ------------------------------------------------------------------
    # Schema initialisation
    # ------------------------------------------------------------------
    def init_db(self) -> None:
        """Create the seen_items table if it does not already exist."""
        with self.conn:
            self.conn.execute(
                """
                CREATE TABLE IF NOT EXISTS seen_items (
                    item_id    TEXT PRIMARY KEY,
                    title      TEXT,
                    price      REAL,
                    search_name TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                """
            )

    # ------------------------------------------------------------------
    # Lookup & insert helpers
    # ------------------------------------------------------------------
    def is_seen(self, item_id: str) -> bool:
        """Return True if *item_id* has already been recorded."""
        cursor = self.conn.execute(
            "SELECT 1 FROM seen_items WHERE item_id = ?", (item_id,)
        )
        return cursor.fetchone() is not None

    def add_item(
        self, item_id: str, title: str, price: float, search_name: str
    ) -> None:
        """Insert a new item record.  Silently ignores duplicates."""
        with self.conn:
            self.conn.execute(
                """
                INSERT OR IGNORE INTO seen_items (item_id, title, price, search_name)
                VALUES (?, ?, ?, ?)
                """,
                (item_id, title, price, search_name),
            )

    # ------------------------------------------------------------------
    # Maintenance
    # ------------------------------------------------------------------
    def cleanup_old_items(self, days: int = 30) -> int:
        """Delete records older than *days* days.  Returns the count of
        rows removed."""
        cutoff = datetime.utcnow() - timedelta(days=days)
        with self.conn:
            cursor = self.conn.execute(
                "DELETE FROM seen_items WHERE created_at < ?",
                (cutoff.isoformat(),),
            )
        return cursor.rowcount

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------
    def close(self) -> None:
        """Close the underlying database connection."""
        self.conn.close()
