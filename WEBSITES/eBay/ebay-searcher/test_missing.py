import sys
sys.stdout.reconfigure(encoding="utf-8")
from ebay_client import EBayClient

client = EBayClient()
# Emulate what app.py does
url = client._build_url(
    "www.ebay.com",
    "Canon powershot",
    None,
    100,
    100,
    "12",
    None,
    "all",
    1
)
print("URL:", url)

resp = client.session.get(url, headers={"Referer": "https://www.ebay.com/"})
with open("test_search.html", "w", encoding="utf-8") as f:
    f.write(resp.text)

from bs4 import BeautifulSoup
soup = BeautifulSoup(resp.text, "html.parser")
s_items = soup.select("ul.srp-results > li.s-item")
s_cards = soup.select("ul.srp-results > li.s-card")

print("s-items found:", len(s_items))
print("s-cards found:", len(s_cards))

parsed_items = client._parse_html(resp.text, "USD")
print("Successfully parsed:", len(parsed_items))
