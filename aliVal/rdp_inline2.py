"""把页面内联脚本与 initAliyunCaptcha 调用参数落盘，便于精确读取（避开控制台编码）。"""
import json
import re
import sys

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"
OUT_DIR = r"D:\ds_work\js_reverse_projects\aliVal\config"


def main():
    dbg = FireFoxDebugger(port=6174)
    dbg.launch(URL, wait_page=10)
    try:
        dbg.enable("aliVal")
        srcs = dbg.sources()
        idx = 0
        found = []
        for s in srcs:
            u = str(s.get("url"))
            txt = dbg.source_text(s["actor"])
            if not txt or "initAliyunCaptcha" not in txt:
                continue
            idx += 1
            path = "%s\\inline_%d.js" % (OUT_DIR, idx)
            with open(path, "w", encoding="utf-8", newline="") as f:
                f.write(txt)
            # 提取 initAliyunCaptcha({ ... }) 整段
            i = txt.find("initAliyunCaptcha")
            if i >= 0:
                seg = txt[i:i + 3000]
                path2 = "%s\\init_call_%d.txt" % (OUT_DIR, idx)
                with open(path2, "w", encoding="utf-8", newline="") as f:
                    f.write(seg)
                found.append((u, path, path2))
        print("[inline files]", len(found))
        for u, p1, p2 in found:
            print("  ", u[:60], "->", p1)
            print("     call ->", p2)
        # 版本身份（skill: 记录版本身份）
        ids = dbg.evaluate("JSON.stringify([].slice.call(document.querySelectorAll('script[src]'))"
                           ".map(function(s){return s.src}).filter(function(u){return /feilin|dynamicJS/.test(u)}))")
        print("[bundle urls]", ids.get("result"))
        with open(OUT_DIR + r"\bundle_urls_2026-11-13.json", "w", encoding="utf-8") as f:
            f.write(ids.get("result") or "[]")
    finally:
        dbg.close()


if __name__ == "__main__":
    main()
