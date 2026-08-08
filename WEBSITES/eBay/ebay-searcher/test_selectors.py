import requests
from bs4 import BeautifulSoup

url = "https://www.ebay.com/sch/i.html?_nkw=canon+powershot&_sacat=31388&_ipg=100"
resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
soup = BeautifulSoup(resp.text, "html.parser")

strict = soup.select("ul.srp-results > li.s-card, ul.srp-results > li.s-item")
loose = soup.select("li.s-card, li.s-item")

print(f"Strict count: {len(strict)}")
print(f"Loose count: {len(loose)}")

# Also look for any headers that explain extra results
for h2 in soup.select("h2"):
    print("H2:", h2.get_text(strip=True))

