"""检查当前浏览器实例的 WebGL 可用性（FeiLin 初始化依赖它）。"""
import json
import sys

sys.path.insert(0, r"D:\mcp-servers\camoufox-reverse-mcp\src")
from camoufox_reverse_mcp.debugger_rdp_tools import FireFoxDebugger

URL = "https://tool.manmanbuy.com/m/aliVal.aspx"

PROBE = r"""
(function(){
  var o = {};
  function probe(kind){
    try {
      var c = document.createElement('canvas');
      c.width = 32; c.height = 32;
      var gl = c.getContext(kind, {failIfMajorPerformanceCaveat: false});
      if (!gl) return {ok:false, why:'null-context'};
      var dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return {ok:true,
              vendor: gl.getParameter(gl.VENDOR),
              renderer: gl.getParameter(gl.RENDERER),
              unmasked: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null,
              version: gl.getParameter(gl.VERSION),
              lost: gl.isContextLost ? gl.isContextLost() : null};
    } catch(e) { return {ok:false, why:String(e && e.message)}; }
  }
  o.webgl = probe('webgl');
  o.webgl2 = probe('webgl2');
  try {
    var c2 = document.createElement('canvas');
    var gl2 = c2.getContext('webgl');
    if (gl2) {
      c2.addEventListener('webglcontextlost', function(){ window.__glLost = (window.__glLost||0)+1; });
      window.__glCanvas = c2; window.__gl2 = gl2;
    }
  } catch(e){}
  o.hardwareConcurrency = navigator.hardwareConcurrency;
  return JSON.stringify(o);
})()
"""


def main():
    dbg = FireFoxDebugger(port=6178)
    dbg.launch(URL, wait_page=5)
    try:
        dbg.enable("aliVal")
        print("[webgl]", json.dumps(json.loads(dbg.evaluate(PROBE).get("result") or "{}"),
                                    ensure_ascii=False, indent=1)[:1200])
    finally:
        dbg.close()


if __name__ == "__main__":
    main()
