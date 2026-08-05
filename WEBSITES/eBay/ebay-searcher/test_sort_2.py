"""Test eBay sorting parameters - debug empty results."""
import sys
sys.stdout.reconfigure(encoding="utf-8")
from ebay_client import EBayClient
from bs4 import BeautifulSoup

client = EBayClient()

url_low = client._build_url("www.ebay.com", "ThinkPad T480", None, None, 10, sort_code="15")
print("Fetching:", url_low)
resp_low = client.session.get(url_low, headers={"Referer": "https://www.ebay.com/"})

soup = BeautifulSoup(resp_low.text, "html.parser")
cards = soup.select("ul.srp-results > li.s-card")
print(f"Total cards found in HTML: {len(cards)}")

items_low = client._parse_html(resp_low.text, "USD")
print(f"Total parsed items: {len(items_low)}")

for i, card in enumerate(cards[:5]):
    print(f"\n--- Card {i} HTML Snippet ---")
    title_tag = card.select_one(".s-card__title span.su-styled-text.primary") or card.select_one(".s-card__title")
    title = title_tag.get_text(strip=True) if title_tag else "No title"
    print(f"Title: {title}")
    
    price_tag = card.select_one(".s-card__price")
    price_text = price_tag.get_text(strip=True) if price_tag else "No price"
    print(f"Price: {price_text}")

    link_tags = card.select("a.s-card__link")
    item_id = ""
    for a in link_tags:
        item_id = client._extract_item_id(a.get("href", ""))
        if item_id:
            break
    print(f"Item ID: {item_id}")
