import json
import os
import subprocess
import sys
from pathlib import Path

import requests

SCRIPT_DIR = Path(__file__).resolve().parent


def fetch_blackbox_from_node(timeout=120):
    """调用 scripts/td/run_td_blackbox.js，从 stdout JSON 取 blackBox。"""
    loc = SCRIPT_DIR / "config" / "location.juneyaoair.json"
    cmd = [
        "node",
        str(SCRIPT_DIR / "scripts" / "td" / "run_td_blackbox.js"),
        "--location",
        str(loc),
    ]
    r = subprocess.run(
        cmd,
        cwd=str(SCRIPT_DIR),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
    )
    if r.returncode != 0:
        sys.stderr.write(r.stderr or "")
        sys.stderr.write(r.stdout or "")
        raise RuntimeError(f"run_td_blackbox 退出码 {r.returncode}")
    out = json.loads(r.stdout.strip())
    bb = out.get("blackBox")
    if not bb:
        raise RuntimeError(f"未得到 blackBox: {json.dumps(out, ensure_ascii=False)}")
    return bb


def print_response_body(response):
    """
    接口为 UTF-8 JSON。Windows 控制台多为 GBK：不要强行把 stdout 改成 UTF-8，
    否则会把 UTF-8 字节流交给仍按 GBK 解析的终端，出现乱码。

    正文一律从 content 按 UTF-8 解码，避免 requests 用错 encoding 先把字节解坏。
    """
    try:
        raw = response.content.decode("utf-8")
        data = json.loads(raw)
        text = json.dumps(data, ensure_ascii=False, indent=2)
    except (json.JSONDecodeError, UnicodeDecodeError):
        text = response.content.decode("utf-8", errors="replace")
    try:
        print(text)
    except UnicodeEncodeError:
        # 当前控制台编码无法输出部分汉字时，退化为 ASCII 转义（保证可读、可复制）
        try:
            data = json.loads(response.content.decode("utf-8"))
            print(json.dumps(data, ensure_ascii=True, indent=2))
        except (json.JSONDecodeError, UnicodeDecodeError, TypeError):
            print(text.encode("unicode_escape").decode("ascii"))


def main():
    try:
        blackbox = fetch_blackbox_from_node()
    except Exception as e:
        blackbox = os.environ.get("BLACKBOX") or os.environ.get("TD_BLACKBOX")
        if not blackbox:
            print("获取 blackBox 失败，且未设置环境变量 BLACKBOX / TD_BLACKBOX:", e, file=sys.stderr)
            sys.exit(1)
        print("警告: 使用环境变量中的 blackBox，原因:", e, file=sys.stderr)

    headers = {
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Cache-Control": "max-age=0",
        "Connection": "keep-alive",
        "Origin": "https://www.juneyaoair.com",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
        "accept": "application/json, text/plain, */*",
        "blackbox": blackbox,
        "channelno": "B2C",
        "clientversion": "1.0.0",
        "content-type": "application/json",
        'sec-ch-ua': '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
        "sec-ch-ua-mobile": "?0",
        'sec-ch-ua-platform': '"Windows"',
        "versioncode": "10000",
    }

    url = "https://www.juneyaoair.com/api/flightFares/queryFlightSimple"
    payload = {
        "channelNo": "B2C",
        "data": {
            "RouteType": "OW",
            "FlightDirection": "G",
            "PassengerType": [],
            "FlightNos": "",
            "CabinClassGo": "",
            "BrandCodeGo": "",
            "SegCondList": [
                {
                    "SegNO": 0,
                    "FlightDirection": "G",
                    "DepCity": "SHA",
                    "ArrCity": "BJS",
                    "FlightDate": "2026-05-30",
                    "DepAirport": None,
                    "ArrAirport": None,
                }
            ],
            "ArrDateTimeGo": "",
            "IsTransferGo": "N",
            "AirlinesFlagGo": "",
        },
        "blackBox": blackbox,
    }

    body = json.dumps(payload, separators=(",", ":"))
    response = requests.post(url, headers=headers, data=body, timeout=30)
    print(response)
    print(response.text)
    print_response_body(response)


if __name__ == "__main__":
    main()
