import sys
sys.stdout.reconfigure(encoding="utf-8")
import requests
from bs4 import BeautifulSoup

url = "https://www.ebay.com/sch/i.html?_nkw=iphone&_curr=USD"
resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"})
soup = BeautifulSoup(resp.text, "html.parser")
prices = soup.select(".s-card__price")
for p in prices[:3]:
    print(p.get_text(strip=True))
