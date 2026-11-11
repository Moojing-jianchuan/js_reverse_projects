"""消融：逐个覆盖环境项，观察 p=2726 的 7 元数组哪一位变化。

用法：python tools/ablate.py
"""

import json
import os
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
SEED = "YQAP74fSyX0Vv2BbyKpqlOha4SoxsROVXQmXYTPgTlZ3qMkFpkh1zCEJbfbRifV0Tyd8AhJv869BpeO3xNZ7ug=="
TS = "1794329300000"
TARGET = 2726

CASES = {
    "baseline": "",
    "proto_plugins5": """
      var P = Object.getPrototypeOf(navigator);
      var arr = [{name:'PDF Viewer'},{name:'Chrome PDF Viewer'},{name:'Chromium PDF Viewer'},{name:'Microsoft Edge PDF Viewer'},{name:'WebKit built-in PDF'}];
      arr.item=function(i){return arr[i]||null;}; arr.namedItem=function(n){return arr.find(function(p){return p.name===n;})||null;};
      Object.defineProperty(P,'plugins',{get:function(){return arr;},configurable:true});
    """,
    "proto_mime2": """
      var P = Object.getPrototypeOf(navigator);
      var arr = [{type:'application/pdf'},{type:'text/pdf'}];
      arr.item=function(i){return arr[i]||null;}; arr.namedItem=function(t){return arr.find(function(m){return m.type===t;})||null;};
      Object.defineProperty(P,'mimeTypes',{get:function(){return arr;},configurable:true});
    """,
    "proto_touch5": """
      var P = Object.getPrototypeOf(navigator);
      Object.defineProperty(P,'maxTouchPoints',{get:function(){return 5;},configurable:true});
    """,
    "proto_ua": """
      var P = Object.getPrototypeOf(navigator);
      Object.defineProperty(P,'userAgent',{get:function(){return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0';},configurable:true});
    """,
    "proto_all_plugins": """
      var P = Object.getPrototypeOf(navigator);
      var mk = function(n){var a=[];for(var i=0;i<n;i++)a.push({name:'p'+i});a.item=function(i){return a[i]||null;};a.namedItem=function(x){return null;};return a;};
      Object.defineProperty(P,'plugins',{get:function(){return mk(5);},configurable:true});
      Object.defineProperty(P,'mimeTypes',{get:function(){return mk(2);},configurable:true});
      Object.defineProperty(P,'maxTouchPoints',{get:function(){return 0;},configurable:true});
    """,
    "cores=8": "Object.defineProperty(navigator,'hardwareConcurrency',{value:8,configurable:true});",
}


def run(label, code):
    out = ROOT / "tmp_ablate.json"
    env = dict(os.environ)
    env["ZP_PRE_EVAL"] = code
    subprocess.run(
        ["node", "tools/stage_run_jsdom.js", SEED, TS, str(out)],
        cwd=str(ROOT), env=env, capture_output=True, text=True,
    )
    data = json.loads(out.read_text(encoding="utf-8"))
    stage = next((e for e in data["log"] if e["p"] == TARGET), None)
    ret = stage["r"] if stage else "missing"
    print(f"{label:<22} p={TARGET} -> {ret}")
    return ret


def main():
    for label, code in CASES.items():
        run(label, code)


if __name__ == "__main__":
    main()
