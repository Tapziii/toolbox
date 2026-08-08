import requests
from bs4 import BeautifulSoup

url = "https://www.ebay.com/sch/i.html?_nkw=canon+powershot&_sacat=0"
resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
soup = BeautifulSoup(resp.text, "html.parser")

h1 = soup.select_one("h1.srp-controls__count-heading")
if h1:
    print("Found H1:", h1.get_text(strip=True))
else:
    print("No H1 found")
