"""Telegram Bot API wrapper for rich HTML notifications with photo previews."""

from typing import Any, Dict

import requests


class TelegramNotifier:
    """Sends formatted item alerts to a Telegram chat via the Bot API.

    Uses ``sendPhoto`` when an image URL is available; automatically falls
    back to ``sendMessage`` if the photo delivery fails or no image exists.
    """

    BASE_URL = "https://api.telegram.org/bot{token}"

    def __init__(self, bot_token: str, chat_id: str):
        self.bot_token = bot_token
        self.chat_id = chat_id
        self.api_base = self.BASE_URL.format(token=self.bot_token)

    # ------------------------------------------------------------------
    # Caption / message formatting
    # ------------------------------------------------------------------
    @staticmethod
    def _format_caption(item: Dict[str, Any], search_name: str) -> str:
        """Build an HTML-formatted caption string for a single item."""
        title = item.get("title", "Unknown")
        price = item.get("price", "?")
        currency = item.get("currency", "")
        condition = item.get("condition", "N/A")
        item_url = item.get("item_url", "")

        return (
            f'🔔 <b>New Item Found!</b> [<i>{search_name}</i>]\n'
            f'\n'
            f'📌 <b>{title}</b>\n'
            f'💰 <b>Price:</b> ${price} {currency}\n'
            f'🏷️ <b>Condition:</b> {condition}\n'
            f'\n'
            f'🔗 <a href="{item_url}">View Listing on eBay</a>'
        )

    # ------------------------------------------------------------------
    # Sending helpers
    # ------------------------------------------------------------------
    def _send_photo(self, photo_url: str, caption: str) -> bool:
        """Attempt to send a photo message.  Returns True on success."""
        url = f"{self.api_base}/sendPhoto"
        payload = {
            "chat_id": self.chat_id,
            "photo": photo_url,
            "caption": caption,
            "parse_mode": "HTML",
        }

        try:
            resp = requests.post(url, data=payload, timeout=15)
            resp.raise_for_status()
            result = resp.json()
            return result.get("ok", False)
        except requests.exceptions.RequestException:
            return False

    def _send_message(self, text: str) -> bool:
        """Send a plain text (HTML-formatted) message.  Returns True on success."""
        url = f"{self.api_base}/sendMessage"
        payload = {
            "chat_id": self.chat_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": False,
        }

        try:
            resp = requests.post(url, data=payload, timeout=15)
            resp.raise_for_status()
            result = resp.json()
            return result.get("ok", False)
        except requests.exceptions.RequestException:
            return False

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------
    def send_item_alert(self, item: Dict[str, Any], search_name: str) -> bool:
        """Send a rich Telegram alert for *item*.

        Tries ``sendPhoto`` first; falls back to ``sendMessage`` if the
        image delivery fails or no image URL is present.

        Returns True if the notification was delivered successfully.
        """
        caption = self._format_caption(item, search_name)
        image_url = item.get("image_url", "")

        if image_url:
            if self._send_photo(image_url, caption):
                return True
            # Fallback to text-only if photo send failed
            return self._send_message(caption)

        return self._send_message(caption)

    def send_startup_message(self) -> bool:
        """Send a one-time startup notification."""
        text = "🚀 <b>eBay Searcher Bot</b> initialized and actively running."
        return self._send_message(text)
