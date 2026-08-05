"""Test eBay sorting parameters."""
import sys
sys.stdout.reconfigure(encoding="utf-8")
from ebay_client import EBayClient
from bs4 import BeautifulSoup

client = EBayClient()

# Test 1: Price Low -> High (_sop=15)
url_low = client._build_url("www.ebay.com", "ThinkPad T480", None, None, 10, sort_code="15")
print("Fetching:", url_low)
resp_low = client.session.get(url_low, headers={"Referer": "https://www.ebay.com/"})
items_low = client._parse_html(resp_low.text, "USD")
print("\nPrice Low -> High (First 5):")
for item in items_low[:5]:
    print(f"  {item['price']} {item['currency']} - {item['title'][:40]}")

# Test 2: Price High -> Low (_sop=16)
url_high = client._build_url("www.ebay.com", "ThinkPad T480", None, None, 10, sort_code="16")
print("\nFetching:", url_high)
resp_high = client.session.get(url_high, headers={"Referer": "https://www.ebay.com/"})
items_high = client._parse_html(resp_high.text, "USD")
print("\nPrice High -> Low (First 5):")
for item in items_high[:5]:
    print(f"  {item['price']} {item['currency']} - {item['title'][:40]}")

# Test 3: Newly Listed (_sop=10)
url_new = client._build_url("www.ebay.com", "ThinkPad T480", None, None, 10, sort_code="10")
print("\nFetching:", url_new)
resp_new = client.session.get(url_new, headers={"Referer": "https://www.ebay.com/"})
items_new = client._parse_html(resp_new.text, "USD")
print("\nNewly Listed (First 5):")
for item in items_new[:5]:
    print(f"  {item['price']} {item['currency']} - {item['title'][:40]}")
