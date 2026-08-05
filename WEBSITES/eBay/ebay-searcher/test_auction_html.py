import sys
sys.stdout.reconfigure(encoding="utf-8")
from ebay_client import EBayClient
from bs4 import BeautifulSoup
client = EBayClient()
url = client._build_url("www.ebay.com", "iphone", None, None, 10, buy_it_now=False, page=1) + "&LH_Auction=1"
resp = client.session.get(url, headers={"Referer": "https://www.ebay.com/"})
soup = BeautifulSoup(resp.text, "html.parser")
cards = soup.select("ul.srp-results > li.s-card")
print("Cards found:", len(cards))
for card in cards[:3]:
    price = card.select_one(".s-card__price")
    print("Price text:", price.get_text(strip=True) if price else "No price")
