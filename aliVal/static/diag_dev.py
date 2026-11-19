"""诊断 13：config.DeviceConfig 到底是什么结构（要给 cvp_capture.json 存原串）。"""
import json
import os
import sys
import tempfile
import time

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"
PROFILE = r"D:\ds_work\js_reverse_projects\aliVal\static\profile_noproxy"
USERJS = 'user_pref("network.proxy.type", 0);\n'

PROBE = r"""
(function(){
  var A = window.AliyunCaptcha, pc = A && A.prototype && A.prototype.config;
  var o = {has_pc: !!pc};
  if (pc) {
    var d = pc.DeviceConfig;
    o.dc_type = typeof d;
    o.dc_keys = (d && typeof d === 'object') ? Object.keys(d) : null;
    try { o.dc_json = JSON.stringify(d).slice(0, 600); } catch(e){ o.dc_json = 'err'; }
    o.deviceToken_len = pc.DeviceToken ? String(pc.DeviceToken).length : 0;
    o.deviceToken_head = pc.DeviceToken ? String(pc.DeviceToken).slice(0, 20) : null;
    o.verifyType = pc.verifyType;
  }
  o.proto_dev = (function(){
    try { var v = A.prototype.deviceConfig;
      return v && typeof v === 'object' ? JSON.stringify(v).slice(0, 400) : String(v).slice(0, 200); }
    catch(e){ return 'err'; }
  })();
  return JSON.stringify(o);
})()
"""


def ev(dbg, expr, timeout=40):
    r = dbg.evaluate(expr, timeout)
    if r.get("hasException"):
        return {"__exception": str(r.get("result"))[:300]}
    return r.get("result")


def main():
    os.makedirs(PROFILE, exist_ok=True)
    with open(os.path.join(PROFILE, "user.js"), "w", encoding="utf-8") as f:
        f.write(USERJS)
    tempfile.mkdtemp = lambda *a, **k: PROFILE
    dbg = FireFoxDebugger(port=6224)
    dbg.launch(URL, wait_page=12)
    try:
        for i in range(6):
            try:
                dbg.enable("aliVal")
                break
            except Exception:
                time.sleep(3)
        print("[probe]", str(ev(dbg, PROBE))[:1800])
    finally:
        dbg.close()


if __name__ == "__main__":
    main()
