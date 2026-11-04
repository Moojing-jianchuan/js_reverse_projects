import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from manmanbuy.client import ManManBuyClient

if __name__ == "__main__":
    client = ManManBuyClient("15711365012", "Moojing15711365012")
    client.login()

    data = client.get_jd_history(
        "https://item.taobao.com/item.htm?id=680960709696"
    )
    print(data)