from ebay_client import EBayClient
from bs4 import BeautifulSoup
client = EBayClient()
client._warm_session("www.ebay.com")
url = client._build_url("www.ebay.com", "canon powershot", None, 100, 100)
resp = client.session.get(url)
soup = BeautifulSoup(resp.text, "html.parser")
print(soup.prettify()[:1500])
