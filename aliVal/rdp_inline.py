"""读页面自己的内联脚本，找出 initAliyunCaptcha 的真实调用参数。"""
import json
import re
import sys

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"


def main():
    dbg = FireFoxDebugger(port=6173)
    dbg.launch(URL, wait_page=10)
    try:
        dbg.enable("aliVal")
        srcs = dbg.sources()
        print("[sources]", len(srcs))
        for s in srcs:
            u = str(s.get("url"))
            print("   ", u[:90], "| inline:", s.get("isInlineSource"), "| startLine:", s.get("sourceStartLine"))

        hits = 0
        for s in srcs:
            u = str(s.get("url"))
            if "aliVal.aspx" not in u and u != "None":
                continue
            txt = dbg.source_text(s["actor"])
            if not txt:
                continue
            for m in re.finditer(r"initAliyunCaptcha", txt):
                line_no = txt[:m.start()].count("\n") + 1
                seg = txt[max(0, m.start() - 300): m.start() + 500]
                print("\n=== %s L%d ===" % (u[:50], line_no))
                print(seg.replace("\n", "\\n")[:800])
                hits += 1
                if hits >= 4:
                    break
            if hits:
                break
        if not hits:
            print("[no inline initAliyunCaptcha]")
    finally:
        dbg.close()


if __name__ == "__main__":
    main()
