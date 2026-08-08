"""Dump HTML of eBay page when sorted low to high."""
import sys
sys.stdout.reconfigure(encoding="utf-8")
from ebay_client import EBayClient

client = EBayClient()
url = client._build_url("www.ebay.com", "ThinkPad T480", None, None, 10, sort_code="15")
resp = client.session.get(url, headers={"Referer": "https://www.ebay.com/"})
html = resp.text
with open("dump.html", "w", encoding="utf-8") as f:
    f.write(html)
print(f"Dumped {len(html)} chars. Searching for 'srp-results' or 's-item'...")

import re
print("s-item count:", len(re.findall(r"s-item", html)))
print("srp-results count:", len(re.findall(r"srp-results", html)))
print("s-card count:", len(re.findall(r"s-card", html)))
