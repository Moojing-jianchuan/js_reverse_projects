"""取一个 seed，用常驻服务生成 jsdom token，输出到文件供浏览器内发送。"""

import json
import pathlib
import urllib.parse

from curl_cffi import requests
from curl_cffi.const import CurlIpResolve, CurlOpt

from s2_fast import H, BODY, URL, OPTS, TokenServer

out = pathlib.Path(r"D:\ds_work\tmp\jsdom_token.json")
j = requests.post(URL, headers=H, data=BODY, cookies={"isOHPC": "1", "__g": "-"},
                  impersonate="firefox144", timeout=30, curl_options=OPTS).json()
zp = j.get("zpData") or {}
print("seed code:", j.get("code"))
srv = TokenServer()
try:
    tok, ms = srv.token(zp["seed"], zp["ts"])
finally:
    srv.close()
print("token len:", len(tok), "gen ms:", round(ms))
out.write_text(json.dumps({"seed": zp["seed"], "ts": zp["ts"],
                           "token_encoded": urllib.parse.quote(tok, safe="")}), encoding="utf-8")
print("written", out)
