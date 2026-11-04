import re
import subprocess
from pathlib import Path

import requests


headers = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Content-Type": "application/x-www-form-urlencoded",
    "Origin": "https://www.ouyeel.com",
    "Pragma": "no-cache",
    "Referer": "https://www.ouyeel.com/steel/search?pageIndex=0&pageSize=50",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    "sec-ch-ua": "\"Chromium\";v=\"140\", \"Not=A?Brand\";v=\"24\", \"Google Chrome\";v=\"140\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\""
}
url = "https://www.ouyeel.com/search-ng/commoditySearch/queryCommodityResult"
sdenv_check_url = "https://www.ouyeel.com/steel/search?pageIndex=0&pageSize=50"
sdenv_dir = Path(__file__).resolve().parents[1] / "sdenv"


def parse_cookie_string(cookie_text: str) -> dict:
    cookies = {}
    for item in cookie_text.split(";"):
        item = item.strip()
        if not item or "=" not in item:
            continue
        key, value = item.split("=", 1)
        cookies[key.strip()] = value.strip()
    return cookies


def generate_sdenv_cookie() -> dict:
    result = subprocess.run(
        ["node", "example/use-check/index.js", sdenv_check_url],
        cwd=sdenv_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="ignore",
        check=False,
    )
    output = f"{result.stdout}\n{result.stderr}"
    match = re.search(r"生成cookie[:：]\s*(.+)", output)
    if not match:
        raise RuntimeError(f"sdenv 未生成 cookie，exit={result.returncode}\n{output[:1200]}")
    cookies = parse_cookie_string(match.group(1).strip())
    # 只保留 sdenv 生成的核心 cookie 字段
    return {
        "T0k1m0u5AfREO": cookies.get("T0k1m0u5AfREO", ""),
        "cookiesession1": cookies.get("cookiesession1", ""),
        "T0k1m0u5AfREP": cookies.get("T0k1m0u5AfREP", ""),
    }


data = {
    "criteriaJson": "{\"pageSize\":50,\"industryComponent\":null,\"channel\":null,\"productType\":null,\"sort\":null,\"warehouseCode\":null,\"key_search\":null,\"is_central\":null,\"searchField\":null,\"companyCode\":null,\"inquiryCategory\":null,\"inquirySpec\":null,\"provider\":null,\"shopCode\":null,\"packCodes\":null,\"steelFactory\":null,\"resourceIds\":null,\"providerCode\":null,\"jsonParam\":{\"keywordAnalyseResult\":null},\"excludeShowSoldOut\":null,\"pageIndex\":1,\"maxPage\":50}"
}
cookies = generate_sdenv_cookie()
# params = {"K5nOZLud": "xxx"}  # 先按要求注释，不传
response = requests.post(url, headers=headers, cookies=cookies, data=data, timeout=30)

print("cookies:", cookies)
print(response.text)
print(response)