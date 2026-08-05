"""Test sort Low to High."""
import sys
sys.stdout.reconfigure(encoding="utf-8")
from ebay_client import EBayClient
from bs4 import BeautifulSoup

client = EBayClient()

url_low = client._build_url("www.ebay.com", "usb cable", None, None, 10, sort_code="15")
print("Fetching:", url_low)
resp_low = client.session.get(url_low, headers={"Referer": "https://www.ebay.com/"})
items = client._parse_html(resp_low.text, "USD")
print(f"Total parsed items for usb cable (low to high): {len(items)}")

url_low2 = client._build_url("www.ebay.com", "laptop", None, None, 10, sort_code="15")
print("Fetching:", url_low2)
resp_low2 = client.session.get(url_low2, headers={"Referer": "https://www.ebay.com/"})
items2 = client._parse_html(resp_low2.text, "USD")
print(f"Total parsed items for laptop (low to high): {len(items2)}")
