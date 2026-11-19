"""端到端验证：attach → sources → breakable_lines → setBreakpoint → paused → frames → getEnvironment → evaluateJSAsync → resume/step。"""
import sys, json, time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger, CAMOUFOX_EXE

PAGE = r"D:\ds_work\js_reverse_projects\aliVal\_t4.html"
open(PAGE, "w", encoding="utf-8").write("""<!doctype html><meta charset=utf-8>
<script>
var SECRET = "hello-fei-lin";
function work(){
  var acc = 0;
  for (var i=0;i<3;i++){ acc += i * 11; }
  return acc + SECRET.length;
}
setInterval(work, 250);
</script>
<h1>probe4</h1>
""")
URL = "file:///" + PAGE.replace("\\", "/")

dbg = FireFoxDebugger(port=6131, exe=CAMOUFOX_EXE)
dbg.launch(URL, wait_page=3)
try:
    info = dbg.enable()
    print("[enable]", json.dumps(info, ensure_ascii=False))
    srcs = dbg.sources()
    print("[sources]", len(srcs), [s.get("url") for s in srcs])
    src = srcs[0]
    print("[breakable]", dbg.breakable_lines(src["actor"]))

    bp = dbg.set_breakpoint("_t4.html", 6)          # 第 6 行 = for 循环
    print("[setBP]", json.dumps(bp, ensure_ascii=False)[:200])

    p = dbg.wait_paused(15)
    if not p:
        print("[paused] NO")
        raise SystemExit(1)
    fr = p.get("frame") or {}
    fa = fr.get("actor")
    print("[paused] why=", json.dumps(p.get("why"), ensure_ascii=False),
          "frame=", fa, "where=", json.dumps(fr.get("where"), ensure_ascii=False))

    fs = dbg.frames()
    print("[frames]", [(f.get("actor"), (f.get("where") or {}).get("line")) for f in fs])

    env = dbg.scopes(fa)
    print("[getEnvironment]", json.dumps(env, ensure_ascii=False)[:900])

    ev = dbg.frame_eval(fa, "typeof acc + ':' + acc + ':' + SECRET")
    print("[eval]", json.dumps(ev, ensure_ascii=False)[:500])

    print("[resume]", dbg.resume())
    p2 = dbg.wait_paused(15)
    if p2:
        f2 = (p2.get("frame") or {}).get("actor")
        print("[2nd paused]", f2)
        print("[step over]", dbg.step("over", f2))
        p3 = dbg.wait_paused(10)
        print("[after step]", (p3.get("frame") or {}).get("where", {}).get("line") if p3 else None)
        dbg.resume()
finally:
    dbg.close()
