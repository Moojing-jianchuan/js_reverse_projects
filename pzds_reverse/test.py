import json
import os
import random
import re
import string
import subprocess
import time
import requests

from acw import get_page_cookies
from sign import build_sign
from ssxmod_gen import generate_ssxmod_cookies
from waf import _generate_decode_1174


def generate_wbkfro() -> str:
    """Generate _c_WBKFRo — 40-char alphanumeric random string via Math.random() equivalent.

    deviceToken.min.js ai(40):
      chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
      for (r=0; r<40; r++) t += chars.charAt(Math.floor(62 * Math.random()))
    """
    chars = string.ascii_letters + string.digits  # 62 chars
    return "".join(random.choice(chars) for _ in range(40))

_DECODE_MODULE = os.path.join(os.path.dirname(__file__), "decode_1174", "generate_decode_1174_full.js")


def main():
    # 1) 生成 ssxmod_itna / ssxmod_itna2
    ssxmod_itna, ssxmod_itna2, m_value = generate_ssxmod_cookies()
    print(f"[1] ssxmod_itna={len(ssxmod_itna)} ssxmod_itna2={len(ssxmod_itna2)}")

    # 2) 访问页面获取 HTTP Set-Cookie（acw_tc + 追踪 cookie 等）
    #    _c_WBKFRo 是 JS document.cookie 写入的，HTTP 拿不到，由本地生成
    page_cookies = get_page_cookies(ssxmod_itna, ssxmod_itna2)
    acw_tc = page_cookies.get("acw_tc", "")
    if not acw_tc:
        print("[ERROR] 未获取到 acw_tc")
        return
    wbkfro = generate_wbkfro()
    print(f"[2] acw_tc={acw_tc[:40]}... _c_WBKFRo={wbkfro}")

    # 3) 生成 sign
    payload = {
        "order": "ASC",
        "sort": None,
        "page": 1,
        "pageSize": 10,
        "action": {
            "gameId": "7",
            "merchantMark": None,
            "keywords": [],
            "searchWords": [],
            "searchPropertyIds": [],
            "recommendSearchConfigIds": [],
            "unionGameIds": [],
            "goodsSearchActions": [],
            "metas": {"single1": []},
            "goodsCatalogueId": 6,
            "goodsSubCatalogueIds": [],
            "countFlag": False,
            "conditionSearch": False,
        },
    }
    sign_data = build_sign(payload, method="post")
    print(f"[3] sign generated")

    # 4) 构造 headers / cookies
    headers = {
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Content-Type": "application/json",
        "Origin": "https://www.pzds.com",
        "PZOs": "windows",
        "PZPlatform": "pc",
        "PZTimestamp": sign_data["PZTimestamp"],
        "PZVersion": "26.528.0831",
        "PZVersionCode": "1",
        "Pragma": "no-cache",
        "Random": sign_data["Random"],
        "Referer": "https://www.pzds.com/",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-site",
        "Sign": sign_data["Sign"],
        "Skey": "CLIENT",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
        "channelInfo": '{"channelCode":null,"tag":null,"channelType":null,"searchWord":"null","adExtras":"","urlParam":""}',
        "deviceId": "1b7e60b0101c4a4ca0df13d6290d379b",
        "globalId": "03c1b87023c24e7c907132fc22bfaad4",
        "sec-ch-ua": '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
    }
    cookies = {
        **page_cookies,
        "_c_WBKFRo": wbkfro,
        "ssxmod_itna": ssxmod_itna,
        "ssxmod_itna2": ssxmod_itna2,
    }

    # 5) 首次请求（无 decode__1174），获取 waf 凭证
    url = "https://api.pzds.com/api/web-client/v2/public/goodsPublic/page"
    data = json.dumps(payload, separators=(",", ":"))
    resp = requests.post(url, headers=headers, cookies=cookies, data=data, timeout=30)
    # 使用服务器 Ali-Swift-Global-Savetime (秒) × 1000 = 毫秒时间戳
    # 浏览器 SDK 从响应头提取此值作为 waf_ts (ag[5])
    server_savetime = resp.headers.get("Ali-Swift-Global-Savetime", "")
    if server_savetime:
        waf_time = int(server_savetime) * 1000
    else:
        waf_time = int(time.time() * 1000)
    print(f"[4] first request: status={resp.status_code}")

    # 6) 提取 waf 凭证
    waf_value = None
    m = re.search(r'<textarea[^>]*id="renderData"[^>]*>(.*?)</textarea>', resp.text, re.DOTALL)
    if m:
        try:
            render = json.loads(m.group(1).strip())
            waf_value = render.get("_waf_bd8ce2ce37")
        except json.JSONDecodeError:
            print("[WARN] renderData 不是合法 JSON")
    if waf_value:
        print(f"[5] waf_value={waf_value}")
        print(f"    waf_time={waf_time}")
    else:
        print("[WARN] 未获取到 waf_value，首次响应如下:")
        print(resp.text[:500])
        return

    # 7) 用 waf_value + waf_time 生成 decode__1174 并二次请求
    # case '1' 用当前 ao（无 ag_prev），case '12' 追加 body → ao≠aI
    decode_1174, ao_val = _generate_decode_1174(waf_value, waf_time, payload, m_value)
    print(f"[6] m_value={m_value}")
    print(f"[7] decode__1174={decode_1174}")

    params = {"decode__1174": decode_1174}
    resp2 = requests.post(url, headers=headers, cookies=cookies, params=params, data=data, timeout=30)
    print(f"[8] second request: status={resp2.status_code}")
    print(resp2.text)


if __name__ == "__main__":
    main()
