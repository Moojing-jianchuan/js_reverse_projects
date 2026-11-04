import os
import re
import subprocess
from pathlib import Path
from urllib.parse import urlencode

import requests

from sign import make_sign


TARGET_PAGE_URL = "https://www.nmpa.gov.cn/datasearch/search-result.html"
SEARCH_API_URL = "https://www.nmpa.gov.cn/datasearch/data/nmpadata/search"

SIGN_INPUT = {
    "item_id": "ff80808183cad75001840881f848179f",
    "search_value": "糖",
    "page_num": 3,
    "page_size": 10,
    "is_senior": "N",
}


def parse_cookie_string(cookie_string):
    cookies = {}
    for item in cookie_string.split(";"):
        item = item.strip()
        if not item or "=" not in item:
            continue
        key, value = item.split("=", 1)
        cookies[key] = value
    return cookies


def get_cookies_via_sdenv(target_url):
    project_root = Path(__file__).resolve().parents[1]
    sdenv_check_script = project_root / "sdenv" / "example" / "use-check" / "index.js"
    if not sdenv_check_script.exists():
        raise FileNotFoundError(f"未找到 sdenv 检测脚本: {sdenv_check_script}")

    command = ["node", str(sdenv_check_script), target_url]
    result = subprocess.run(
        command,
        cwd=str(project_root),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="ignore",
        env={**os.environ, "NODE_TLS_REJECT_UNAUTHORIZED": "0"},
        check=False,
    )
    output = f"{result.stdout}\n{result.stderr}"

    cookie_patterns = [
        r"生成cookie[：:]\s*(.+)",
        r"Cookie[：:]\s*(.+)",
    ]
    cookie_text = None
    for pattern in cookie_patterns:
        match = re.search(pattern, output)
        if match:
            cookie_text = match.group(1).strip()
            break

    if not cookie_text:
        raise RuntimeError(
            "sdenv 未提取到 cookie，请先手动执行检查命令确认环境："
            f"\nnode {sdenv_check_script} {target_url}\n\n输出摘要：\n{output[-1000:]}"
        )
    return parse_cookie_string(cookie_text)


def build_headers(sign, timestamp):
    return {
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Pragma": "no-cache",
        "Referer": TARGET_PAGE_URL,
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/140.0.0.0 Safari/537.36"
        ),
        "sec-ch-ua": '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sign": sign,
        "timestamp": str(timestamp),
        "token": "false",
    }


def main():
    timestamp, encoded, sign = make_sign(
        item_id=SIGN_INPUT["item_id"],
        search_value=SIGN_INPUT["search_value"],
        page_num=SIGN_INPUT["page_num"],
        page_size=SIGN_INPUT["page_size"],
        is_senior=SIGN_INPUT["is_senior"],
    )
    headers = build_headers(sign, timestamp)
    cookies = get_cookies_via_sdenv(TARGET_PAGE_URL)

    print(f"sign encoded: {encoded}")
    print(f"sign: {sign}")
    print(f"timestamp: {timestamp}")
    print(f"cookies keys: {sorted(cookies.keys())}")

    query_params = {
        "isSenior": SIGN_INPUT["is_senior"],
        "itemId": SIGN_INPUT["item_id"],
        "pageNum": SIGN_INPUT["page_num"],
        "pageSize": SIGN_INPUT["page_size"],
        "searchValue": SIGN_INPUT["search_value"],
    }
    request_url = f"{SEARCH_API_URL}?{urlencode(query_params)}"
    print(f"request url: {request_url}")

    response = requests.get(
        request_url,
        headers=headers,
        cookies=cookies,
        timeout=30,
    )
    print(response.status_code)
    print(response.text)


if __name__ == "__main__":
    main()