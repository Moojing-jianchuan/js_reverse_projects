"""纯协议驱动 aliVal 页：evaluateJSAsync 触发验证码 → 看 feilin / dynamicJS 是否进入 sources。"""
import sys, json, time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger, CAMOUFOX_EXE

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"
dbg = FireFoxDebugger(port=6133, exe=CAMOUFOX_EXE)
dbg.launch(URL, wait_page=8)
try:
    print("[enable]", json.dumps(dbg.enable("aliVal"), ensure_ascii=False))
    print("[urls]", [str(s.get("url"))[:60] for s in dbg.sources()])

    # 页面结构：找触发点
    r = dbg.evaluate("JSON.stringify({title:document.title, btns:[...document.querySelectorAll('button,a,input,div[onclick],[id]')].slice(0,40).map(e=>e.tagName+'#'+e.id+'.'+e.className)}, null, 0)")
    print("[dom]", json.dumps(r, ensure_ascii=False)[:1200])

    r = dbg.evaluate("typeof AliyunCaptcha + '|' + (typeof window.__FEILIN__) + '|' + Object.keys(window).filter(k=>/captcha|feilin|aliyun/i.test(k)).join(',')")
    print("[globals]", json.dumps(r, ensure_ascii=False)[:600])

    r = dbg.evaluate("document.querySelectorAll('script[src]').length + ':' + [...document.querySelectorAll('script[src]')].map(s=>s.src).join(' | ')")
    print("[scripts]", json.dumps(r, ensure_ascii=False)[:1500])
finally:
    dbg.close()
