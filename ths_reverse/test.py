import subprocess
from pathlib import Path

import requests


def get_hexin_v() -> str:
    base_dir = Path(__file__).resolve().parent
    js_file = base_dir / "run_chameleon_env.js"
    node_code = (
        "console.log = () => {};"
        "console.error = () => {};"
        "const { getHexinV } = require(process.argv[1]);"
        "const v = getHexinV();"
        "if (!v) process.exit(2);"
        "process.stdout.write(v);"
    )
    result = subprocess.run(
        ["node", "-e", node_code, str(js_file)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="ignore",
        check=True,
    )
    value = result.stdout.strip()
    if not value:
        raise RuntimeError("未获取到 hexin-v")
    return value


hexin_v = get_hexin_v()


headers = {
    "Accept": "text/html, */*; q=0.01",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Connection": "keep-alive",
    "Referer": "https://q.10jqka.com.cn/",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    "X-Requested-With": "XMLHttpRequest",
    "hexin-v": hexin_v,
    "sec-ch-ua": "\"Chromium\";v=\"140\", \"Not=A?Brand\";v=\"24\", \"Google Chrome\";v=\"140\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\""
}
cookies = {
    "v": hexin_v
}
url = "https://q.10jqka.com.cn/index/index/board/all/field/zdf/order/desc/page/1/ajax/1/"
response = requests.get(url, headers=headers, cookies=cookies)

print(response.text)
print(response)