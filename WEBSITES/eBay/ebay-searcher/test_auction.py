import sys
sys.stdout.reconfigure(encoding="utf-8")
from ebay_client import EBayClient
client = EBayClient()

url = client._build_url("www.ebay.com", "iphone", None, None, 10, buy_it_now=False, page=1)
url += "&LH_Auction=1"
print("URL:", url)
resp = client.session.get(url, headers={"Referer": "https://www.ebay.com/"})
items = client._parse_html(resp.text, "USD")
for item in items[:5]:
    print(f"{item['price']} - {item['title'][:40]}")
