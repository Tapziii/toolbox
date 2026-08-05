"""Test sorting via eBay search function exactly as app.py uses it."""
import sys
sys.stdout.reconfigure(encoding="utf-8")
from ebay_client import EBayClient

client = EBayClient()

print("TEST 1: bestMatch")
items = client.search("iphone", "EBAY_US", sort="bestMatch", limit=10)
for i in items[:3]:
    print(f"  {i['price']} {i['currency']} - {i['title'][:30]}")

print("\nTEST 2: priceHigh")
items = client.search("iphone", "EBAY_US", sort="priceHigh", limit=10)
for i in items[:3]:
    print(f"  {i['price']} {i['currency']} - {i['title'][:30]}")

print("\nTEST 3: priceLow")
items = client.search("iphone", "EBAY_US", sort="priceLow", limit=10)
for i in items[:3]:
    print(f"  {i['price']} {i['currency']} - {i['title'][:30]}")

print("\nTEST 4: newlyListed")
items = client.search("iphone", "EBAY_US", sort="newlyListed", limit=10)
for i in items[:3]:
    print(f"  {i['price']} {i['currency']} - {i['title'][:30]}")
