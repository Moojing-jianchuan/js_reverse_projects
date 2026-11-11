"""从浏览器网络里自动抓当前 security-js 并保存 —— 不需要调 joblist 接口。

用法：
  python tools/find_sdk.py                 # 默认 jobs 页
  python tools/find_sdk.py --url <page>

原理：打开页面 → SPA 收到 37 → 跳 security.html → 加载
`/web/passport/zp/security-js/<name>.js`，监听 response 直接拿 body。
"""

import argparse
import hashlib
import pathlib

from camoufox.sync_api import Camoufox

ROOT = pathlib.Path(__file__).resolve().parent.parent
JOBS = "https://www.zhipin.com/web/geek/jobs?city=101040100&position=100101"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=JOBS)
    ap.add_argument("--wait", type=int, default=12)
    args = ap.parse_args()

    hit = {}

    with Camoufox(headless=True) as browser:
        page = browser.new_page()

        def on_response(resp):
            url = resp.url
            if "security-js/" in url and url.endswith(".js") and "url" not in hit:
                try:
                    body = resp.body()
                except Exception:
                    return
                if body and len(body) > 10000:
                    hit["url"] = url
                    hit["body"] = body

        page.on("response", on_response)
        page.goto(args.url, wait_until="domcontentloaded", timeout=60000)
        try:
            page.wait_for_load_state("networkidle", timeout=args.wait * 1000)
        except Exception:
            pass
        page.wait_for_timeout(3000)

    if "url" not in hit:
        print("没抓到 security-js：可能没触发 37 挑战，或页面结构变了")
        return

    name = hit["url"].rsplit("/", 1)[-1].replace(".js", "")
    digest = hashlib.sha256(hit["body"]).hexdigest()
    dest = ROOT / "config" / f"_sdk_{name}.js"
    old = dest.read_bytes() if dest.exists() else None
    dest.write_bytes(hit["body"])
    print("url  :", hit["url"])
    print("name :", name, "| bytes:", len(hit["body"]), "| sha256:", digest[:16])
    print("saved:", dest.name, "| 与本地已存一致:", old == hit["body"] if old is not None else "新文件")


if __name__ == "__main__":
    main()
