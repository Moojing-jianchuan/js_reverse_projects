import json
import os
import re
import subprocess
import sys
import time
from typing import Any
import requests

from acw import get_acw_tc
from sign import build_sign
from ssxmod_gen import generate_ssxmod_cookies

# decode_1174 模块（Node.js）
_DECODE_MODULE = os.path.join(os.path.dirname(__file__), "decode_1174", "generate_decode_1174_full.js")


def _generate_decode_1174(waf_token: str, waf_ts: str, payload: dict | None = None, m_value: str = "") -> tuple[str, str]:
    """调用 Node 生成 decode__1174, 返回 (decode__1174, ao)"""
    body_str = json.dumps(payload, separators=(",", ":")) if payload else ""
    script = f"""
var mod = require({json.dumps(_DECODE_MODULE)});
var waf_token = {json.dumps(waf_token)};
var method = "post";
var url_path = "api.pzds.com/api/web-client/v2/public/goodsPublic/page";
var body_str = {json.dumps(body_str)};

// 构造 ao / aI
var ao = mod.buildAo(waf_token, method, url_path, body_str);
var aI = mod.buildAI(waf_token, method, url_path);

var ctx = {{
  ao: ao,
  aI: aI,
  waf_token: waf_token,
  waf_ts: {json.dumps(str(waf_ts))},
  m_value: {json.dumps(m_value)},
  timestamp: Date.now(),
  seed: 0,
}};
var result = mod.generate_decode_1174(ctx);
console.log(JSON.stringify({{decode__1174: result.decode__1174, ao: ao}}));
"""
    proc = subprocess.run(
        ["node", "-e", script],
        capture_output=True, text=True, timeout=30,
    )
    result = json.loads(proc.stdout.strip())
    return result.get("decode__1174", ""), result.get("ao", "")


def get_waf_data(
    payload: dict[str, Any] | None = None,
    *,
    ssxmod_itna: str | None = None,
    ssxmod_itna2: str | None = None,
    m_value: str | None = None,
    acw_tc: str | None = None,
    sign_data: dict[str, str] | None = None,
    decode_1174_ctx: dict[str, str] | None = None,
) -> tuple[str | None, int | None, str | None, str | None]:
    """返回 (waf_value, waf_time, decode__1174, m_value)"""
    url = "https://api.pzds.com/api/web-client/v2/public/goodsPublic/page"
    # 拼接 decode__1174 参数（首次请求可传空或上一次的值）
    if decode_1174_ctx:
        prev_token = decode_1174_ctx.get("waf_token", "")
        prev_ts = decode_1174_ctx.get("waf_ts", "")
        prev_payload = decode_1174_ctx.get("payload", None)
        prev_m = decode_1174_ctx.get("m_value", "")
        decode_1174, _ = _generate_decode_1174(prev_token, prev_ts, prev_payload, prev_m)
        url += "?decode__1174=" + decode_1174
    if payload is None:
        payload = {
            "order": "ASC",
            "sort": None,
            "page": 2,
            "pageSize": 10,
            "action": {
                "gameId": "7",
                "merchantMark": None,
                "keywords": [],
                "searchWords": [],
                "searchPropertyIds": [],
                "unionGameIds": [],
                "goodsSearchActions": [],
                "goodsCatalogueId": 6,
                "countFlag": False,
                "conditionSearch": False,
            },
        }

    # 1) 生成 ssxmod_itna / ssxmod_itna2 / m_value
    if not ssxmod_itna or not ssxmod_itna2:
        ssxmod_itna, ssxmod_itna2, m_value = generate_ssxmod_cookies()
        print(f"[WAF] generated cookies: itna={len(ssxmod_itna)} itna2={len(ssxmod_itna2)} m_value={m_value}")

    # 2) 由 acw.py 逻辑获取 acw_tc
    if not acw_tc:
        acw_tc = get_acw_tc(ssxmod_itna, ssxmod_itna2)
    if not acw_tc:
        print("[ERROR] 未获取到 acw_tc，无法继续请求。")
        return None, None

    # 3) 由 sign.py 生成 PZTimestamp / Random / Sign
    if sign_data is None:
        sign_data = build_sign(payload, method="post")

    headers = {
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Content-Type": "application/json",
        "Origin": "https://www.pzds.com",
        "PZOs": "windows",
        "PZPlatform": "pc",
        "PZTimestamp": sign_data["PZTimestamp"],
        "PZVersion": "1.0.2",
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
        "channelInfo": "{\"channelCode\":null,\"tag\":null,\"channelType\":null,\"searchWord\":\"null\",\"adExtras\":\"\",\"urlParam\":\"\"}",
        "deviceId": "d193629a0bfd4b0c9f0f9f06c3fb9a2b",
        "globalId": "d571e70a8541482b92867dd2d561c277",
        "sec-ch-ua": "\"Chromium\";v=\"140\", \"Not=A?Brand\";v=\"24\", \"Google Chrome\";v=\"140\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
        "x-oss-forbid-overwrite": "true",
    }
    cookies = {
        "acw_tc": acw_tc,
        "ssxmod_itna": ssxmod_itna,
        "ssxmod_itna2": ssxmod_itna2,
    }

    data = json.dumps(payload, separators=(",", ":"))
    response = requests.post(url, headers=headers, cookies=cookies, data=data, timeout=30)
    # 使用服务器 Ali-Swift-Global-Savetime (秒) × 1000 = 毫秒时间戳
    server_savetime = response.headers.get("Ali-Swift-Global-Savetime", "")
    if server_savetime:
        waf_time = int(server_savetime) * 1000
    else:
        waf_time = int(time.time() * 1000)

    waf_value = None
    textarea_match = re.search(
        r'<textarea[^>]*id="renderData"[^>]*>(.*?)</textarea>',
        response.text,
        re.DOTALL,
    )
    if textarea_match:
        render_data_raw = textarea_match.group(1).strip()
        try:
            render_data_obj = json.loads(render_data_raw)
            waf_value = render_data_obj.get("_waf_bd8ce2ce37")
        except json.JSONDecodeError:
            print("[WARN] renderData 不是合法 JSON，无法提取 _waf_bd8ce2ce37")
    else:
        print('[WARN] 未找到 id="renderData" 的 textarea')

    # 用本次响应生成下一次可用的 decode__1174
    decode_1174 = None
    if waf_value:
        decode_1174, _ = _generate_decode_1174(waf_value, waf_time, payload, m_value or "")
        print(f"[WAF] decode__1174 generated with m_value={m_value} decode_len={len(decode_1174) if decode_1174 else 0}")

    return waf_value, waf_time, decode_1174, m_value


def main() -> None:
    waf_value, waf_time, decode_1174, m_value = get_waf_data()
    print("waf.value:", waf_value)
    print("waf.time:", waf_time)
    print("decode__1174:", decode_1174 or "(无)")
    print("m_value:", m_value)

if __name__ == "__main__":
    main()