"""解出 hifreq 结果的自检 + 提交 slideAuth。

自检项对齐真人基线：mm 点数、dt 中位、mp 点数、flag、VerifyTime-TrackStartTime。
只有当"轨迹密度接近真人"时才提交（省配额）。
"""
from __future__ import annotations

import json
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, r"D:\ds_work\js_reverse_projects\aliVal")
RESULT = r"D:\ds_work\js_reverse_projects\aliVal\config\hifreq_result.json"
SUBMIT_URL = "https://tool.manmanbuy.com/m/aliVal.aspx?method=slideAuth"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0"


def stats(track):
    pts = [p.split(",") for p in (track or "").split("|") if p]
    ts = [int(p[2]) for p in pts if len(p) > 2 and p[2].lstrip("-").isdigit()]
    flags = [p[3] for p in pts if len(p) > 3]
    if len(ts) < 2:
        return {"n": len(pts), "dts": [], "flags": flags, "span": 0}
    dts = [ts[i] - ts[i - 1] for i in range(1, len(ts))]
    dts_s = sorted(dts)
    med = dts_s[len(dts_s) // 2]
    return {"n": len(pts), "dts": dts, "med": med, "min": dts_s[0], "max": dts_s[-1],
            "distinct": len(set(dts)), "span": ts[-1] - ts[0], "flags": flags}


def main():
    submit = "--submit" in sys.argv
    rec = json.load(open(RESULT, encoding="utf-8"))
    env = json.loads(rec["captchaVerifyParam"])
    data = env["data"]

    # 解 data -> payload（复用 Node 的 unarmour，避免在 Python 里重写）
    import subprocess
    js = r"""
    const fs=require('fs'), zlib=require('zlib');
    const {unarmour}=require('./feilin_data');
    const d=JSON.parse(fs.readFileSync('config/hifreq_result.json','utf8'));
    const env=JSON.parse(d.captchaVerifyParam);
    const raw=Buffer.from(env.data,'base64');
    const T=unarmour(raw).toString('latin1');
    const plain=zlib.inflateSync(Buffer.from(T,'base64')).toString('utf8');
    process.stdout.write(JSON.stringify({T:T.length, inflated:plain.length,
        nonce:plain.slice(0,32), payload:JSON.parse(plain.slice(32))}));
    """
    out = subprocess.run(["node", "-e", js], capture_output=True, text=True,
                         cwd=r"D:\ds_work\js_reverse_projects\aliVal", timeout=120)
    if out.returncode != 0:
        print("[decode fail]", out.stderr[:300])
        return
    p = json.loads(out.stdout)
    tl = p["payload"]["TrackList"]
    mm = stats(tl.get("mm"))
    mp = stats(tl.get("mp"))
    vts = p["payload"]["VerifyTime"] - p["payload"]["TrackStartTime"]
    flag_ok = bool(mm["flags"]) and all(f == "1" for f in mm["flags"])

    print("=== 自检（对照真人基线）===")
    print("  data len      = %d   (真人 9052)" % len(data))
    print("  解压 payload   = %d B  (真人 23208)" % p["inflated"])
    print("  mm 点数        = %d   (真人 540)" % mm["n"])
    print("  mm 跨度        = %d ms (真人 4515)" % mm["span"])
    print("  mm dt 中位     = %s ms (真人 6)  不同值 %s" % (mm.get("med"), mm.get("distinct")))
    print("  mp 点数        = %d   (真人 906)" % mp["n"])
    print("  mp 跨度        = %d ms (真人 12872)" % mp["span"])
    print("  VerifyTime-TrackStartTime = %d ms (真人 14588)" % vts)
    print("  mm flag 全 1   = %s" % flag_ok)
    print("  xPos/slidePos  = %s / %s" % (p["payload"].get("xPos"), p["payload"].get("slidePos")))
    print("  arg            = %s" % json.dumps(p["payload"].get("arg")))
    print("  块误差          = %.2f CSS px" % (rec.get("err_css") or 0))

    dense = mm["n"] >= 400 and (mm.get("med") or 999) <= 12 and flag_ok
    print("\n密度达标 =", dense)
    if not submit:
        print("（未提交；加 --submit 才发）")
        return
    if not dense:
        print("密度不达标，拒绝提交以省配额")
        return

    body = urllib.parse.urlencode({"captchaVerifyParam": rec["captchaVerifyParam"]}).encode()
    req = urllib.request.Request(SUBMIT_URL, data=body, method="POST", headers={
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent": UA,
        "Origin": "https://tool.manmanbuy.com",
        "Referer": "https://tool.manmanbuy.com/m/aliVal.aspx",
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "zh-CN,zh;q=0.9",
    })
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=30) as r:
        txt = r.read().decode("utf-8", "replace")
        print("\n[submit] HTTP", r.status, "in %.2fs" % (time.time() - t0))
    print("[submit] body:", txt[:400])
    ok = '"captchaVerifyResult":true' in txt
    print("\n>>> 结果:", "★ TRUE —— 纯协议过了 S3" if ok else "false")


if __name__ == "__main__":
    main()
