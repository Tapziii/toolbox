"""eBay search-page scraper — no API keys required.

Fetches eBay search result pages via plain HTTP requests and parses
item data from the HTML using BeautifulSoup.  Supports sort, condition,
price-range, and negative-keyword filters.
"""

import re
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote_plus

import requests
from bs4 import BeautifulSoup, Tag


class EBayClient:
    """Scrapes eBay search result pages and returns structured item data."""

    DOMAINS = {
        "EBAY_US": "www.ebay.com",
        "EBAY_GB": "www.ebay.co.uk",
        "EBAY_DE": "www.ebay.de",
        "EBAY_AU": "www.ebay.com.au",
        "EBAY_CA": "www.ebay.ca",
        "EBAY_FR": "www.ebay.fr",
        "EBAY_IT": "www.ebay.it",
        "EBAY_ES": "www.ebay.es",
    }

    # Map config marketplace IDs to native currencies
    MARKETPLACE_CURRENCY = {
        "EBAY_US": "USD",
        "EBAY_GB": "GBP",
        "EBAY_DE": "EUR",
        "EBAY_AU": "AUD",
        "EBAY_CA": "CAD",
        "EBAY_FR": "EUR",
        "EBAY_IT": "EUR",
        "EBAY_ES": "EUR",
    }

    # Approximate exchange rates relative to USD for server-side max price calculations
    RATES = {
        "USD": 1.0,
        "EUR": 0.92,
        "GBP": 0.79,
        "ILS": 3.65,
        "AUD": 1.55,
        "CAD": 1.37,
    }

    # Realistic browser headers to avoid 403 blocks
    HEADERS = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0.0.0 Safari/537.36"
        ),
        "Accept": (
            "text/html,application/xhtml+xml,application/xml;"
            "q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,"
            "application/signed-exchange;v=b3;q=0.7"
        ),
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Cache-Control": "max-age=0",
        "Sec-Ch-Ua": '"Chromium";v="131", "Not_A Brand";v="24"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
    }

    # eBay sort-order codes
    SORT_MAP = {
        "bestMatch": "12",
        "newlyListed": "10",
        "endingSoonest": "1",
        "priceLow": "15",
        "priceHigh": "16",
    }

    # eBay condition codes
    CONDITION_MAP = {
        "new": "1000",
        "openBox": "1500",
        "refurbished": "2500",
        "used": "3000",
        "parts": "7000",
    }

    def __init__(self, **kwargs):
        self.session = requests.Session()
        self.session.headers.update(self.HEADERS)
        self._warmed: set[str] = set()

    def _warm_session(self, domain: str) -> None:
        """Visit the eBay homepage once per domain to acquire cookies."""
        if domain in self._warmed:
            return
        try:
            self.session.get(
                f"https://{domain}/",
                timeout=15,
                headers={"Referer": "https://www.google.com/"},
            )
        except requests.exceptions.RequestException:
            pass
        self._warmed.add(domain)

    # ------------------------------------------------------------------
    # URL builder
    # ------------------------------------------------------------------
    @staticmethod
    def _build_url(
        domain: str,
        query: str,
        min_price: Optional[float],
        max_price: Optional[float],
        limit: int,
        sort_code: str = "10",
        condition_code: Optional[str] = None,
        category: str = "all",
        format_filter: str = "all",
        page: int = 1,
    ) -> str:
        """Construct an eBay search URL with filters."""
        base = f"https://{domain}/sch/i.html"
        params = [
            f"_nkw={quote_plus(query)}",
            f"_sop={sort_code}",
            f"_ipg={limit}",
            "rt=nc",
            "_from=R40",
            "LH_PrefLoc=2",  # Force Worldwide to prevent eBay from hiding international listings
        ]
        if category != "all":
            params.append(f"_sacat={category}")
        if min_price is not None:
            # Divide by 5 to prevent eBay from aggressively filtering if it assumes a weaker local currency
            params.append(f"_udlo={max(0, min_price / 5.0)}")
        if max_price is not None:
            # Multiply by 5 to prevent eBay from aggressively filtering if it assumes a weaker local currency
            params.append(f"_udhi={max_price * 5.0}")
        if condition_code:
            params.append(f"LH_ItemCondition={condition_code}")
        if format_filter == "bin":
            params.append("LH_BIN=1")
        elif format_filter == "auction":
            params.append("LH_Auction=1")
        if page > 1:
            params.append(f"_pgn={page}")
        return f"{base}?{'&'.join(params)}"

    # ------------------------------------------------------------------
    # HTML parsing helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _extract_price(price_str: str) -> float:
        """Parse a price string like 'ILS 89.99' or '$12.50' into a float."""
        cleaned = re.sub(r"[^\d.]", "", price_str.split(" to ")[0])
        try:
            return float(cleaned)
        except (ValueError, IndexError):
            return 0.0

    @staticmethod
    def _extract_item_id(url: str) -> str:
        """Pull the numeric item ID from an eBay listing URL."""
        match = re.search(r"/itm/(\d+)", url)
        return match.group(1) if match else ""

    @staticmethod
    def _parse_shipping(rows: list[Tag]) -> str:
        """Extract shipping cost text from attribute rows."""
        for row in rows:
            text = row.get_text(strip=True)
            lower = text.lower()
            if "delivery" in lower or "shipping" in lower:
                if "free" in lower:
                    return "Free"
                # Extract the cost: "+ILS 30.46 delivery" -> "ILS 30.46"
                match = re.search(r"\+?\s*(.+?)\s*(?:delivery|shipping)", text, re.I)
                if match:
                    return match.group(1).strip()
                return text
        return ""

    @staticmethod
    def _parse_location(rows: list[Tag]) -> str:
        """Extract seller location from attribute rows."""
        for row in rows:
            text = row.get_text(strip=True)
            if text.lower().startswith("located in"):
                return text.replace("Located in", "").replace("located in", "").strip()
            if text.lower().startswith("from "):
                return text.replace("From ", "").replace("from ", "").strip()
        return ""

    @staticmethod
    def _parse_seller_info(card: Tag) -> dict:
        """Extract seller name and feedback from the secondary attributes."""
        secondary = card.select_one(".su-card-container__attributes__secondary, .s-item__seller-info")
        if not secondary:
            return {"seller_name": "", "seller_feedback": ""}

        spans = secondary.select("span.su-styled-text.primary, span.s-item__seller-info-text, span.s-item__seller-info-icon")
        name = ""
        feedback = ""
        if spans:
            for span in spans:
                text = span.get_text(strip=True)
                if "positive" in text.lower() or "%" in text:
                    feedback = text
                elif text and not name:
                    name = text
        else:
            text = secondary.get_text(strip=True)
            name = text.split(" (")[0] if " (" in text else text

        return {"seller_name": name, "seller_feedback": feedback}

    def _parse_html(self, html: str, currency: str) -> Tuple[List[Dict[str, Any]], str]:
        """Parse the search-results HTML and return a list of item dicts and the total count string."""
        soup = BeautifulSoup(html, "html.parser")
        items: List[Dict[str, Any]] = []

        result_cards = soup.select("li.s-card, li.s-item")

        for card in result_cards:
            # --- Link ---
            link_tags = card.select("a.s-card__link, a.s-item__link")
            item_url = ""
            item_id = ""
            for a in link_tags:
                href = a.get("href", "")
                extracted = self._extract_item_id(href)
                if extracted:
                    item_url = href
                    item_id = extracted
                    break
            if not item_id:
                continue

            # --- Title ---
            title_tag = card.select_one(
                ".s-card__title span.su-styled-text.primary, .s-item__title span[role=heading], .s-item__title"
            )
            if not title_tag:
                title_tag = card.select_one(".s-card__title, .s-item__title")
            title = title_tag.get_text(strip=True) if title_tag else "No title"

            if title.lower().startswith("shop on ebay"):
                continue

            # --- Price ---
            price_tag = card.select_one(".s-card__price, .s-item__price")
            price_text = price_tag.get_text(strip=True) if price_tag else "0"
            price = self._extract_price(price_text)

            # Detect currency from the price text
            detected_currency = currency
            if price_text:
                pt_upper = price_text.upper()
                if "ILS" in pt_upper or "₪" in pt_upper:
                    detected_currency = "ILS"
                elif "EUR" in pt_upper or "€" in pt_upper:
                    detected_currency = "EUR"
                elif "GBP" in pt_upper or "£" in pt_upper:
                    detected_currency = "GBP"
                elif "$" in price_text:
                    detected_currency = "USD"
                elif "AUD" in pt_upper or "AU" in pt_upper:
                    detected_currency = "AUD"
                elif "CAD" in pt_upper or "C $" in pt_upper:
                    detected_currency = "CAD"

            # --- Image ---
            img_tag = card.select_one("img.s-card__image, img.s-item__image-img, .s-item__image-wrapper img")
            image_url = ""
            if img_tag:
                image_url = img_tag.get("src", "") or img_tag.get("data-src", "")

            # --- Condition ---
            cond_tag = card.select_one(".s-card__subtitle span, .s-item__subtitle span.SECONDARY_INFO")
            if not cond_tag:
                cond_tag = card.select_one(".s-card__subtitle, .s-item__subtitle")
            condition = cond_tag.get_text(strip=True) if cond_tag else "N/A"
            # Clean trailing dots/middots
            condition = re.sub(r"[·•\s]+$", "", condition).strip()

            # --- Attribute rows (shipping, location, etc.) ---
            attr_rows = card.select(
                ".su-card-container__attributes__primary .s-card__attribute-row, .s-item__shipping, .s-item__location, .s-item__detail, .s-item__logisticsCost"
            )

            shipping = self._parse_shipping(attr_rows)
            location = self._parse_location(attr_rows)
            seller = self._parse_seller_info(card)

            items.append(
                {
                    "item_id": item_id,
                    "title": title,
                    "price": price,
                    "currency": detected_currency,
                    "item_url": item_url,
                    "image_url": image_url,
                    "condition": condition,
                    "shipping": shipping,
                    "location": location,
                    "seller_name": seller["seller_name"],
                    "seller_feedback": seller["seller_feedback"],
                }
            )

        # Extract the total number of eBay results
        total_count_str = "Unknown"
        count_tag = soup.select_one("h1.srp-controls__count-heading")
        if count_tag:
            text = count_tag.get_text(strip=True)
            match = re.search(r"^([\d,]+)", text)
            if match:
                total_count_str = match.group(1)

        return items, total_count_str

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------
    def search(
        self,
        query: str,
        marketplace_id: str,
        min_price: Optional[float] = None,
        max_price: Optional[float] = None,
        currency: str = "USD",
        sort: str = "newlyListed",
        condition: str = "all",
        category: str = "all",
        exclude_keywords: Optional[str] = None,
        exclude_countries: Optional[str] = None,
        format_filter: str = "all",
        include_shipping: bool = False,
        page: int = 1,
    ) -> Dict[str, Any]:
        """Search eBay and return a dictionary containing items for the given page.

        *exclude_keywords* is a comma-separated string of words to negate
        in the query (e.g. "box,body,case" becomes "-box -body -case").
        """
        # Build the final query with negative keywords
        final_query = query
        if exclude_keywords:
            negatives = [
                f"-{kw.strip()}"
                for kw in exclude_keywords.split(",")
                if kw.strip()
            ]
            if negatives:
                final_query = f"{query} {' '.join(negatives)}"

        domain = self.DOMAINS.get(marketplace_id, "www.ebay.com")
        self._warm_session(domain)

        sort_code = self.SORT_MAP.get(sort, "12")
        condition_code = self.CONDITION_MAP.get(condition)
        
        exclude_countries_list = [
            c.strip().lower() for c in exclude_countries.split(",") if c.strip()
        ] if exclude_countries else []

        url = self._build_url(
            domain, final_query, min_price, max_price, limit=100,
            sort_code=sort_code, condition_code=condition_code,
            category=category, format_filter=format_filter, page=page,
        )

        resp = self.session.get(
            url,
            timeout=20,
            headers={"Referer": f"https://{domain}/"},
        )
        resp.raise_for_status()

        page_items, total_count_str = self._parse_html(resp.text, currency)
        valid_items = []

        for item in page_items:
            if exclude_countries_list and any(b in item.get("location", "").lower() for b in exclude_countries_list):
                continue
            
            # Strict Python-side Price Filtering
            item_curr = item.get("currency", "USD")
            market_curr = self.MARKETPLACE_CURRENCY.get(marketplace_id, "USD")
            market_rate = self.RATES.get(market_curr, 1.0)
            item_rate = self.RATES.get(item_curr, 1.0)
            
            price_to_check = item["price"]
            if include_shipping:
                price_to_check += self._extract_price(item.get("shipping", ""))
                
            if min_price is not None:
                converted_min = (min_price / market_rate) * item_rate
                if price_to_check < converted_min:
                    continue
                    
            if max_price is not None:
                converted_max = (max_price / market_rate) * item_rate
                if price_to_check > converted_max:
                    continue

            valid_items.append(item)

        # If the page returned fewer items than 20, we're likely at the end of all results
        has_more = len(page_items) >= 20

        return {
            "items": valid_items,
            "current_page": page,
            "has_more": has_more,
            "total_ebay_results": total_count_str
        }
