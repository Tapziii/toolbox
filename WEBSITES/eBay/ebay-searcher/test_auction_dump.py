import sys
sys.stdout.reconfigure(encoding="utf-8")
from ebay_client import EBayClient
client = EBayClient()
url = client._build_url("www.ebay.com", "iphone", None, None, 10, buy_it_now=False, page=1) + "&LH_Auction=1"
resp = client.session.get(url, headers={"Referer": "https://www.ebay.com/"})
with open("dump_auction.html", "w", encoding="utf-8") as f:
    f.write(resp.text)
print(len(resp.text))
