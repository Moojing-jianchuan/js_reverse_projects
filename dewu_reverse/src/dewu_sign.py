"""得物 (www.dewu.com) PC 端接口签名算法 —— 已线上验证

与 src/dewu_sign.js 等价，纯标准库实现，无需 execjs。
算法：md5( 键名排序拼接 key+value + SALT )
"""
import hashlib
import json

SALT = "048a9c4943398714b356a696503d2d36"


def sign_concat(params: dict) -> str:
    parts = []
    for key in sorted(params.keys()):
        v = params[key]
        if v is None:                      # JS 里 undefined 才跳过，None 对应 null → 拼 "null"
            parts.append(key + "null")
            continue
        if isinstance(v, list):
            if not v:
                parts.append(key)
                continue
            items = []
            for x in v:
                items.append(json.dumps(x, ensure_ascii=False, separators=(",", ":")) if isinstance(x, (dict, list)) else str(x))
            items.sort()
            parts.append(key + ",".join(items))
        elif isinstance(v, dict):
            parts.append(key + json.dumps(v, ensure_ascii=False, separators=(",", ":")))
        elif isinstance(v, bool):
            parts.append(key + ("true" if v else "false"))
        else:
            parts.append(key + str(v))
    return "".join(parts)


def sign(params: dict) -> str:
    return hashlib.md5((sign_concat(params) + SALT).encode()).hexdigest()


def build_body(params: dict) -> str:
    body = {"sign": sign(params)}
    body.update(params)
    return json.dumps(body, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    cases = [
        ({"pageNum": 1, "pageSize": 20}, "a44fa02883cc1342f22c7dfefea1d9e9"),
        ({"pickRuleId": 644443, "pageNum": 1, "pageSize": 24, "filterUnbid": True, "showCspu": True},
         "0e5d10fb111f2afef6ac0a1776187e23"),
        ({"pickRuleId": 644479, "pageNum": 1, "pageSize": 24, "filterUnbid": True, "showCspu": True},
         "f2b6b4c666227d52fdadf251f307445d"),
    ]
    ok = 0
    for p, expect in cases:
        got = sign(p)
        good = got == expect
        ok += good
        print(("PASS" if good else "FAIL"), got, "" if good else "expect " + expect)
    print(f"\n{ok}/{len(cases)} 通过")
