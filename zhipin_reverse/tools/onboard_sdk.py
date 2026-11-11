"""新 SDK 上线时的一键接入：下载 → 插桩 → 双路对照 → 报告首个差异。

用法：
  python tools/onboard_sdk.py --name 6d66a65a              # 按 name 从站点下载
  python tools/onboard_sdk.py --file config/_sdk_x.js      # 已有本地文件
  python tools/onboard_sdk.py --name 6d66a65a --seed <seed> --ts <ts>

不做任何服务端请求之外的写操作；seed 缺省用固定假值，仅用于双路对照。
"""

import argparse
import pathlib
import subprocess
import sys

from curl_cffi import requests

ROOT = pathlib.Path(__file__).resolve().parent.parent
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0"
FAKE_SEED = ("YQAP74fSyX0Vv2BbyKpqlOha4SoxsROVXQmXYTPgTlZ3qMkFpkh1zCEJbfbRifV0Tyd8AhJv869B"
             "peO3xNZ7ug==")
FAKE_TS = "1794329300000"


def run(cmd, **kw):
    return subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True, **kw)


def download(name):
    url = f"https://www.zhipin.com/web/passport/zp/security-js/{name}.js"
    r = requests.get(url, headers={"User-Agent": UA}, impersonate="firefox144", timeout=30)
    if r.status_code != 200 or len(r.content) < 10000:
        raise SystemExit(f"下载失败: {r.status_code} len={len(r.content)}")
    dest = ROOT / "config" / f"_sdk_{name}.js"
    dest.write_bytes(r.content)
    print(f"下载: {dest.name} ({len(r.content)} 字节)")
    return dest


def instrument(src):
    out = src.with_name(src.stem.replace("_sdk_", "_sdk_") + ".inst.js")
    r = run([sys.executable, "tools/instrument_sdk.py", str(src.relative_to(ROOT)), str(out.relative_to(ROOT))])
    print("插桩:", (r.stdout or r.stderr).strip())
    if r.returncode != 0:
        raise SystemExit("插桩失败")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name")
    ap.add_argument("--file")
    ap.add_argument("--seed", default=FAKE_SEED)
    ap.add_argument("--ts", default=FAKE_TS)
    args = ap.parse_args()

    if args.name:
        src = download(args.name)
    elif args.file:
        src = (ROOT / args.file).resolve()
        print("本地样本:", src.name, src.stat().st_size, "字节")
    else:
        raise SystemExit("需要 --name 或 --file")

    inst = instrument(src)

    print("\n[1/3] 浏览器侧（同时回写指纹到 config/browser_env.json）")
    r = run([sys.executable, "tools/stage_run_browser.py", args.seed, args.ts, "tmp_browser_stages.json",
             str(inst.relative_to(ROOT))])
    print("  ", (r.stdout or r.stderr).strip().splitlines()[-1][:160] if (r.stdout or r.stderr) else r.returncode)

    print("[2/3] jsdom 侧")
    r = run(["node", "tools/stage_run_jsdom.js", args.seed, args.ts, "tmp_jsdom_stages.json",
             str(inst.relative_to(ROOT))])
    print("  ", (r.stdout or r.stderr).strip().splitlines()[-1][:160] if (r.stdout or r.stderr) else r.returncode)

    print("[3/3] 对照")
    for tool in ("tools/first_diff.py", "tools/env_compare.py"):
        r = run([sys.executable, tool, "tmp_browser_stages.json", "tmp_jsdom_stages.json"])
        print(f"\n--- {tool} ---")
        print((r.stdout or r.stderr).strip()[:1600])


if __name__ == "__main__":
    main()
