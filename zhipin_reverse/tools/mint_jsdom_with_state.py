"""用页面 dump 的真实状态（localStorage / performance.timing）在 jsdom 里生成 token。

用法：python tools/mint_jsdom_with_state.py <seed> <ts>
"""

import glob
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def main():
    seed = sys.argv[1]
    ts = sys.argv[2]
    state = json.loads((ROOT / "config" / "page_state.json").read_text(encoding="utf-8"))

    timing = {k: v for k, v in state["timing"].items() if isinstance(v, (int, float))}
    preeval = (
        "(() => { try {"
        f" const t = {json.dumps(timing)};"
        " Object.keys(t).forEach((k) => Object.defineProperty(performance.timing, k, {value: t[k], configurable: true}));"
        " } catch (e) { console.log('timing patch failed', e && e.message); } })()"
    )

    sdk = sorted(p for p in glob.glob(str(ROOT / "config" / "_sdk_*.js")) if ".inst." not in p)[-1]
    code = f"""
const fs = require('fs');
const {{ buildSandbox }} = require({json.dumps(str(ROOT / 'env_jsdom.js'))});
const win = buildSandbox(fs.readFileSync({json.dumps(sdk)}, 'utf8'), {{
  url: {json.dumps(state['href'])},
  localStorage: {json.dumps(state['localStorage'])},
  preEval: {json.dumps(preeval)},
}});
const tz = new Date().getTimezoneOffset();
console.log(new win.ABC().z({json.dumps(seed)}, parseInt({json.dumps(str(ts))}, 10) + (480 + tz) * 60000));
"""
    path = ROOT / "tmp_mint.js"
    path.write_text(code, encoding="utf-8")
    import subprocess
    r = subprocess.run(["node", str(path)], cwd=str(ROOT), capture_output=True, text=True)
    path.unlink(missing_ok=True)
    tok = (r.stdout or "").strip().splitlines()[-1] if r.stdout.strip() else ""
    print(f"len={len(tok)}")
    print(tok)


if __name__ == "__main__":
    main()
