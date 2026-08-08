"""eBay Searcher Bot — main daemon loop.

Continuously polls the eBay Browse API for every search defined in
``config.json``, deduplicates results via SQLite, and pushes new-listing
alerts to Telegram.
"""

import json
import os
import sys
import time
from datetime import datetime
from typing import Any, Dict, List

# Force UTF-8 output on Windows to support emoji/Unicode in logs
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import requests
from dotenv import load_dotenv

from database import DatabaseManager
from ebay_client import EBayClient
from notifier import TelegramNotifier


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------
def timestamp() -> str:
    """Return a bracketed ISO-8601 timestamp for log lines."""
    return f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}]"


def load_config(path: str = "config.json") -> Dict[str, Any]:
    """Load and return the JSON configuration file."""
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def validate_env() -> Dict[str, str]:
    """Validate environment variables.

    All credentials are optional now — eBay scraping needs no keys.
    Telegram keys are only required if you want push notifications.
    Returns a dict of all set credential values.
    """
    optional_keys = [
        "EBAY_CLIENT_ID",
        "EBAY_CLIENT_SECRET",
        "TELEGRAM_BOT_TOKEN",
        "TELEGRAM_CHAT_ID",
    ]

    env: Dict[str, str] = {}
    for key in optional_keys:
        value = os.getenv(key, "").strip()
        if value and not value.startswith("your_"):
            env[key] = value

    return env


# ------------------------------------------------------------------
# Core loop
# ------------------------------------------------------------------
def _print_item(item: Dict[str, Any], search_name: str) -> None:
    """Print a rich console summary for a newly discovered item."""
    print(f"  🔔 NEW — [{search_name}]")
    print(f"     📌 {item['title']}")
    print(f"     💰 ${item['price']} {item['currency']}")
    print(f"     🏷️  {item.get('condition', 'N/A')}")
    print(f"     🔗 {item.get('item_url', '')}")


def run_search_cycle(
    searches: List[Dict[str, Any]],
    marketplace_id: str,
    ebay: EBayClient,
    db: DatabaseManager,
    notifier: TelegramNotifier | None,
) -> None:
    """Execute one full cycle over every configured search."""
    for search_def in searches:
        name: str = search_def["name"]
        query: str = search_def["query"]
        max_price = search_def.get("max_price")
        min_price = search_def.get("min_price")
        currency: str = search_def.get("currency", "USD")

        try:
            items = ebay.search(
                query=query,
                marketplace_id=marketplace_id,
                min_price=min_price,
                max_price=max_price,
                currency=currency,
            )
        except requests.exceptions.RequestException as exc:
            print(f"{timestamp()} ⚠️  eBay API error for '{name}': {exc}")
            continue

        new_count = 0
        for item in items:
            item_id = item["item_id"]
            if not item_id or db.is_seen(item_id):
                continue

            # New item — send alert (Telegram or console), then persist
            if notifier is not None:
                success = notifier.send_item_alert(item, search_name=name)
                if success:
                    print(
                        f"{timestamp()} 📬 Alert sent: {item['title'][:60]} "
                        f"(${item['price']} {item['currency']})"
                    )
                else:
                    print(
                        f"{timestamp()} ⚠️  Telegram delivery failed for "
                        f"{item_id}, will retry next cycle."
                    )
                    # Skip persisting so the item is retried next cycle
                    continue
            else:
                _print_item(item, name)

            db.add_item(
                item_id=item_id,
                title=item["title"],
                price=item["price"],
                search_name=name,
            )
            new_count += 1

            # Brief pause between notifications to avoid Telegram rate limits
            time.sleep(1)

        print(
            f"{timestamp()} Checked '{name}': "
            f"{new_count} new item{'s' if new_count != 1 else ''} found."
        )


def main() -> None:
    """Entry-point: validate config, start the infinite monitoring loop."""
    # 1. Load environment & configuration
    load_dotenv()
    env = validate_env()
    config = load_config()

    check_interval: int = config.get("check_interval_seconds", 300)
    marketplace_id: str = config.get("marketplace_id", "EBAY_US")
    searches: List[Dict[str, Any]] = config.get("searches", [])

    if not searches:
        print(f"{timestamp()} ❌ No searches defined in config.json. Exiting.")
        sys.exit(1)

    # 2. Initialise components
    db = DatabaseManager()
    ebay = EBayClient()

    # Telegram is optional
    notifier: TelegramNotifier | None = None
    if "TELEGRAM_BOT_TOKEN" in env and "TELEGRAM_CHAT_ID" in env:
        notifier = TelegramNotifier(
            bot_token=env["TELEGRAM_BOT_TOKEN"],
            chat_id=env["TELEGRAM_CHAT_ID"],
        )

    # 3. Startup notification
    if notifier is not None:
        if notifier.send_startup_message():
            print(f"{timestamp()} 🚀 Bot started — Telegram startup message sent.")
        else:
            print(f"{timestamp()} ⚠️  Could not send Telegram startup message.")
    else:
        print(f"{timestamp()} 🚀 Bot started in console-only mode (no Telegram).")

    print(
        f"{timestamp()} 🔎 Monitoring {len(searches)} search(es) every "
        f"{check_interval}s on {marketplace_id}."
    )

    # 4. Infinite daemon loop
    while True:
        try:
            run_search_cycle(searches, marketplace_id, ebay, db, notifier)

            # Periodic database maintenance (once per cycle is cheap)
            removed = db.cleanup_old_items(days=30)
            if removed:
                print(
                    f"{timestamp()} 🧹 Cleaned {removed} stale DB record(s)."
                )
        except requests.exceptions.RequestException as exc:
            print(f"{timestamp()} ⚠️  Network error during cycle: {exc}")
        except Exception as exc:  # noqa: BLE001
            print(f"{timestamp()} ❌ Unexpected error: {exc}")

        print(
            f"{timestamp()} 💤 Sleeping {check_interval}s until next cycle…"
        )
        time.sleep(check_interval)


if __name__ == "__main__":
    main()
