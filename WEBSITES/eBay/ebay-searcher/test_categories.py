import requests
from bs4 import BeautifulSoup

url = "https://www.ebay.com/sch/i.html?_nkw=camera"
resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"})
soup = BeautifulSoup(resp.text, "html.parser")

links = soup.select("a.srp-carousel-list__item-link, a.srp-refine__category__item")
for link in links:
    href = link.get("href", "")
    text = link.get_text(strip=True)
    if "_sacat=" in href:
        sacat = href.split("_sacat=")[1].split("&")[0]
        print(f"{text}: {sacat}")
