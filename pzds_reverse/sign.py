"""
pzds.com 接口签名模块

算法来源：逆向 fb0189f.js 中的 getSignature 函数

POST 签名格式：
  base = "PZTimestamp={ts}&Random={rand}&2147483647={encodeURIComponent(JSON.stringify(body))}&accessKey=3qXyB7uf"
  然后对整串做自定义字符替换，最后 md5

GET 签名格式（遍历字段 + 字典序）：
  各字段分别 encodeURIComponent 后拼接，Array/Object 特殊处理
  此模块主要用于 POST 场景
"""

import hashlib
import json
import random
import time
import urllib.parse

ACCESS_KEY = "3qXyB7uf"


def md5(s: str) -> str:
    return hashlib.md5(s.encode()).hexdigest()


def _custom_encode(s: str) -> str:
    """
    模拟 JS encodeURIComponent + 自定义字符替换（来自 fb0189f.js）：
      encodeURIComponent(s)
      .replace(/[(]/g, '%28')
      .replace(/[)]/g, '%29')
      .replace(/[']/g, '%27')
      .replace(/[*]/g, '%2A')
      .replace(/[~]/g, '%7E')
      .replace(/[!\uff01]/g, '%21')
    """
    encoded = urllib.parse.quote(s, safe="")
    encoded = encoded.replace("(", "%28")
    encoded = encoded.replace(")", "%29")
    encoded = encoded.replace("'", "%27")
    encoded = encoded.replace("*", "%2A")
    encoded = encoded.replace("~", "%7E")
    encoded = encoded.replace("!", "%21")
    return encoded


def build_sign(body, ts=None, method: str = "post") -> dict:
    """
    生成 pzds.com 接口签名

    已通过浏览器已知 Sign 验证（game/all + waf.py 两组数据 100% 匹配）：
      POST：base = "PZTimestamp={ts}&Random={rand}&2147483647={encURI(JSON.stringify(body))}&accessKey=3qXyB7uf"
      GET ：遍历 body 字段，Array 用 JSON.stringify，其他转字符串，null 跳过

    Args:
        body   : POST 请求体（dict 或 JSON 字符串）
        ts     : 时间戳毫秒；为 None 时自动取当前时间
        method : "post"（默认）/ "get"

    Returns:
        {"PZTimestamp": str, "Random": str, "Sign": str}
    """
    if ts is None:
        ts = int(time.time() * 1000)

    rand = random.randint(100_000, 999_999)
    ts_str = str(ts)
    rand_str = str(rand)

    method = method.lower()
    if method == "post":
        # POST：整体 JSON stringify 后作为一个字段 2147483647
        if isinstance(body, str):
            body_json = body
        else:
            body_json = json.dumps(body, separators=(",", ":"), ensure_ascii=False)
        encoded_body = _custom_encode(body_json)
        base = f"PZTimestamp={ts_str}&Random={rand_str}&2147483647={encoded_body}&accessKey={ACCESS_KEY}"
        # 对整串再做一次自定义替换（accessKey 本身不含特殊字符，只影响 encoded_body 部分）
        base = base.replace("(", "%28")
        base = base.replace(")", "%29")
        base = base.replace("'", "%27")
        base = base.replace("*", "%2A")
        base = base.replace("~", "%7E")
        base = base.replace("!", "%21")
    else:
        # GET：遍历字段，Array JSON.stringify，Object→[object Object]，null 跳过
        if isinstance(body, str):
            body = json.loads(body)
        o = dict(body)
        o["PZTimestamp"] = ts_str
        o["Random"] = rand_str
        keys = sorted(o.keys())
        pairs = []
        for k in keys:
            v = o[k]
            if isinstance(v, list):
                v_str = json.dumps(v, separators=(",", ":"), ensure_ascii=False)
            elif isinstance(v, dict):
                v_str = "[object Object]"
            elif v is None:
                v_str = "null"
            elif isinstance(v, bool):
                v_str = "true" if v else "false"
            else:
                v_str = str(v)
            if v_str not in ("null", "undefined"):
                pairs.append(f"{k}={urllib.parse.quote(v_str, safe='')}")
        base = "&".join(pairs) + "&accessKey=" + ACCESS_KEY
        base = base.replace("(", "%28").replace(")", "%29").replace("'", "%27")
        base = base.replace("*", "%2A").replace("~", "%7E").replace("!", "%21")

    sign = md5(base)
    return {
        "PZTimestamp": ts_str,
        "Random": rand_str,
        "Sign": sign,
    }


