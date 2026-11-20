# -*- coding: utf-8 -*-
"""
得物图集验证码 · 自动化过码器 v3

架构（确认）：
    ① 自动化过验证码：浏览器渲染 → 读 DOM → 三通道融合识别 → 真实鼠标拖拽   ← 本文件
    ② 协议取数据：sign / 请求信封 / Fun99 解密（全 Node，已跑通）            ← src/*.js

设计要点：
  · 默认 headless 运行（--headed 可开窗口）
  · 阈值闸门：融合置信度 < threshold 时**不提交**，只换题（不消耗拖拽次数）
  · 真正提交的拖拽最多 retries 次，全部失败 → 抛 RuntimeError
  · 每次重试给轨迹加扰动（±1.8px 抖动 + 时长 ±8%），避免重复同一条轨迹
  · 过码成功后一次性跑完：解密页面那次 200 响应 + 测额度模型（scripts/post_solve_probe.js）

用法:
    python scripts/auto_captcha.py                  # headless 求解，最多 3 次拖拽
    python scripts/auto_captcha.py --headed         # 需要肉眼看时
    python scripts/auto_captcha.py --dry            # 只读 DOM/识别/算轨迹，不拖
    python scripts/auto_captcha.py --retries 3 --threshold 0.55 --timeout 40
"""
import argparse
import json
import random
import subprocess
import sys
import time
from pathlib import Path

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
TRACK_FILE = ROOT / "artifacts" / "verify_d_plaintext.json"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0"

READ_DOM_JS = r"""
() => {
  const imgs = [...document.querySelectorAll('img.moveImg')].map(img => {
    const r = img.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, src: img.src || '' };
  });
  const frameImg = [...document.querySelectorAll('img')].find(i => (i.src || '').includes('captcha/blank.png'));
  let frame = null;
  if (frameImg) { const r = frameImg.getBoundingClientRect(); frame = { x: r.x, y: r.y, w: r.width, h: r.height }; }
  let target = null;
  const span = [...document.querySelectorAll('span')].find(s => (s.textContent || '').includes('拖动包含'));
  if (span) {
    let n = span.nextElementSibling;
    for (let i = 0; i < 3 && n; i++) {
      const img = n.tagName === 'IMG' ? n : (n.querySelector && n.querySelector('img'));
      if (img && img.src) { target = { src: img.src }; break; }
      n = n.nextElementSibling;
    }
  }
  const btn = document.querySelector('#captchaSubmit');
  return { candidates: imgs, frame, target, stillOpen: !!btn,
           no: (document.body.innerText.match(/No\.\d+/) || [''])[0] };
}
"""

SUBMIT_JS = r"""
() => { const b = document.querySelector('#captchaSubmit'); if (b) { b.click(); return 'clicked'; } return 'no-btn'; }
"""

REFRESH_JS = r"""
() => {
  const els = [...document.querySelectorAll('div,span,a,button')];
  const t = els.find(e => e.childElementCount === 0 && (e.textContent || '').trim() === '刷新');
  if (!t) return 'not-found';
  try { (t.closest('[class]') || t).click(); } catch (e) { }
  try { t.click(); } catch (e) { }
  return 'clicked';
}
"""


def load_track_template():
    """真人轨迹模板：跳过首点（混合基准），只用后续点的相对位移归一化"""
    if not TRACK_FILE.exists():
        return None
    j = json.loads(TRACK_FILE.read_text(encoding="utf-8"))
    seg = [list(map(float, s.split(","))) for s in j["xys"].split("|")]
    if len(seg) < 5:
        return None
    body = seg[1:]
    x0, y0 = body[0][0], body[0][1]
    xN, yN = body[-1][0], body[-1][1]
    shape = [((0.0 if xN == x0 else (p[0] - x0) / (xN - x0)),
              (0.0 if yN == y0 else (p[1] - y0) / (yN - y0))) for p in body]
    dt = [max(3.0, body[i][2] - body[i - 1][2]) for i in range(1, len(body))]
    return {"shape": shape, "dt": dt, "n": len(seg)}


def build_drag_path(sx, sy, ex, ey, tpl, jitter=0.0):
    if not tpl:
        return [(sx + (ex - sx) * i / 40, sy + (ey - sy) * i / 40, 1000.0 / 40 * i) for i in range(41)], 1000
    dx, dy = ex - sx, ey - sy
    new_len = max(1.0, (dx * dx + dy * dy) ** 0.5)
    scale = min(1.6, max(0.45, new_len / 397.0)) * (1.0 + random.uniform(-0.08, 0.08))
    pts, t = [(sx, sy, 0.0)], 0.0
    for i, (fx, fy) in enumerate(tpl["shape"]):
        t += max(3.0, (tpl["dt"][i] if i < len(tpl["dt"]) else 8.0) * scale)
        jx = random.uniform(-jitter, jitter) if jitter else 0.0
        jy = random.uniform(-jitter, jitter) if jitter else 0.0
        pts.append((sx + dx * fx + jx, sy + dy * fy + jy, t))
    return pts, t


def call_node(script, args, timeout=120):
    try:
        p = subprocess.run(["node", script] + [str(a) for a in args], cwd=str(ROOT),
                           capture_output=True, text=True, timeout=timeout)
        txt = (p.stdout or "").strip().splitlines()
        return json.loads(txt[-1]) if txt else {"ok": False, "error": "no output"}
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}


def recognize_fused(call_resp, threshold):
    """三通道融合识别（oracle 主导，crop/label 兜底）+ 阈值闸门"""
    if not call_resp:
        return {"ok": False, "error": "no call resp"}
    tmp = ROOT / "artifacts" / "_call_tmp.json"
    tmp.write_text(json.dumps(call_resp, ensure_ascii=False), encoding="utf-8")
    return call_node("scripts/recognize_fused.js", [tmp, "--threshold", threshold])


def wait_challenge(page, ctx, timeout):
    deadline = time.time() + timeout
    dom = None
    t0 = time.time()
    last_log = 0
    while time.time() < deadline:
        try:
            dom = page.evaluate(READ_DOM_JS)
        except Exception:
            dom = None
        el = time.time() - t0
        if el - last_log >= 5:
            last_log = el
            n = len((dom or {}).get("candidates") or [])
            has_call = bool(ctx["call"].get("json"))
            print(f"      · 等待中 {el:.0f}s | DOM候选={n} | call响应={'有' if has_call else '无'} | "
                  f"info序列={ctx['info'].get('all')}")
        if dom and dom.get("candidates") and ctx["call"].get("json"):
            return dom
        time.sleep(1.0)
    return dom if (dom and dom.get("candidates")) else None


def try_drag(page, dom, call_resp, tpl, threshold, ctx, jitter):
    cands, frame = dom["candidates"], dom.get("frame")
    rec = recognize_fused(call_resp, threshold)
    if not rec.get("ok"):
        return False, f"识别失败: {rec.get('error')}", rec
    print(f"   [recog] index={rec['index']} conf={rec['confidence']} decision={rec['decision']} "
          f"primary={rec.get('primary')} agree={rec.get('agree')}")
    if rec["decision"] != "auto":
        return False, f"闸门拒提交（conf {rec['confidence']} < {threshold}）", rec

    d = (call_resp.get("data") or call_resp)
    bg = d.get("bgList") or []
    tgt = bg[rec["index"]] if rec["index"] < len(bg) else None
    dom_idx = None
    if tgt:
        dom_idx = next((i for i, c in enumerate(cands) if c["src"] == tgt), None)
        if dom_idx is None:
            dom_idx = next((i for i, c in enumerate(cands) if len(c["src"]) == len(tgt)), None)
    if dom_idx is None:
        return False, "bgList→DOM 映射失败", rec

    c = cands[dom_idx]
    sx, sy = c["x"] + c["w"] / 2, c["y"] + c["h"] / 2
    ex, ey = (frame["x"] + frame["w"] / 2, frame["y"] + frame["h"] / 2) if frame else (sx, sy)
    pts, dur = build_drag_path(sx, sy, ex, ey, tpl, jitter=jitter)
    print(f"   [plan] DOM#{dom_idx} ({sx:.0f},{sy:.0f}) → ({ex:.0f},{ey:.0f}) | {len(pts)} 点 / {dur:.0f}ms")

    page.mouse.move(sx, sy)
    time.sleep(0.08)
    page.mouse.down()
    last = 0.0
    for (x, y, t) in pts[1:]:
        w = (t - last) / 1000.0
        if w > 0:
            time.sleep(min(0.05, w))
        page.mouse.move(x, y)
        last = t
    time.sleep(0.06)
    page.mouse.up()
    time.sleep(0.15)
    page.evaluate(SUBMIT_JS)
    print("   [drag] 已拖动并提交，等待 info 判定…")

    before = len(ctx["info"].get("all") or [])
    for _ in range(20):
        time.sleep(0.5)
        seq = ctx["info"].get("all") or []
        if len(seq) > before:
            return (seq[-1] == 200), f"info 状态 {seq[-1]}", rec
    return False, "等不到新的 info 响应", rec


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true", help="只读 DOM/识别/算轨迹，不拖不提交")
    ap.add_argument("--headed", action="store_true", help="显示浏览器窗口（默认 headless）")
    ap.add_argument("--retries", type=int, default=3, help="真正提交的拖拽次数上限")
    ap.add_argument("--threshold", type=float, default=0.55, help="融合置信度闸门")
    ap.add_argument("--timeout", type=int, default=40, help="每次等待验证码出现的秒数")
    ap.add_argument("--log", default="", help="日志文件路径（Python 侧写，避开 PowerShell 重定向丢 stdout）")
    args = ap.parse_args()

    if args.log:
        _f = open(args.log, "w", encoding="utf-8")

        class _Tee:
            def write(self, s):
                _f.write(s)
                _f.flush()
                try:
                    sys.__stdout__.write(s)
                    sys.__stdout__.flush()
                except Exception:
                    pass

            def flush(self):
                _f.flush()

        sys.stdout = _Tee()

    from camoufox.sync_api import Camoufox

    tpl = load_track_template()
    print(f"[init] 模板 {'OK ' + str(tpl['n']) + ' 点' if tpl else '缺失'} | 阈值 {args.threshold} | "
          f"最多 {args.retries} 次拖拽 | {'headed' if args.headed else 'headless'}")

    with Camoufox(headless=not args.headed, locale="zh-CN") as browser:
        page = browser.new_page()
        ctx = {"call": {}, "info": {}, "req": {}}

        def on_response(resp):
            try:
                if "/captcha/call" in resp.url:
                    ctx["call"]["json"] = resp.json()
                elif "/feeds/info" in resp.url:
                    ctx["info"].setdefault("all", []).append(resp.status)
                    if resp.status == 200:
                        ctx["info"]["body"] = resp.text()
                        ctx["info"]["sksLength"] = resp.headers.get("sks-length")
            except Exception:
                pass

        def on_request(req):
            try:
                if "/feeds/info" in req.url:
                    ctx["req"]["headers"] = req.headers
            except Exception:
                pass

        page.on("response", on_response)
        page.on("request", on_request)

        print("[nav] 打开 dewu.com …")
        page.goto("https://www.dewu.com/", wait_until="domcontentloaded", timeout=60000)

        last_reason = ""
        drag_tries = 0
        title_tries = 0
        max_titles = args.retries * 4
        conf_log = []

        while drag_tries < args.retries and title_tries < max_titles:
            print(f"\n══ 拖拽 {drag_tries}/{args.retries} | 换题 {title_tries}/{max_titles} ══")
            dom = wait_challenge(page, ctx, args.timeout)
            if not dom:
                last_reason = "验证码未出现 / 未抓到 call 响应"
                print(f"   [!] {last_reason}")
                page.reload(wait_until="domcontentloaded")
                time.sleep(2)
                title_tries += 1
                continue

            rec = recognize_fused(ctx["call"]["json"], args.threshold)
            if rec.get("ok"):
                conf_log.append(rec["confidence"])

            if args.dry:
                print(f"   [dry] recog={json.dumps(rec, ensure_ascii=False)[:280]}")
                print(f"   [dry] 置信度样本: {conf_log}")
                return

            if not rec.get("ok") or rec["decision"] != "auto":
                title_tries += 1
                print(f"   [闸门] conf={rec.get('confidence')} < {args.threshold} → 换题（不计拖拽次数）")
                page.evaluate(REFRESH_JS)
                time.sleep(2.0)
                continue

            ok, why, rec2 = try_drag(page, dom, ctx["call"]["json"], tpl, args.threshold, ctx, jitter=1.8)
            drag_tries += 1
            if ok:
                print(f"\n[✓] 第 {drag_tries} 次拖拽通过（conf={rec2.get('confidence')}，info 序列={ctx['info'].get('all')}）")
                hdr = ctx["req"].get("headers") or {}
                sk = hdr.get("sk") or hdr.get("SK") or ""
                if sk:
                    c = {"sk": sk, "shumeiid": hdr.get("shumeiid") or "", "ua": UA,
                         "headers": dict(hdr), "infoBody200": ctx["info"].get("body"),
                         "sksLength": ctx["info"].get("sksLength")}
                    cf = ROOT / "artifacts" / "post_solve_ctx.json"
                    cf.write_text(json.dumps(c, ensure_ascii=False), encoding="utf-8")
                    out = call_node("scripts/post_solve_probe.js", [cf], timeout=180)
                    print(f"[post] {json.dumps(out, ensure_ascii=False)[:400]}")
                print(f"[conf 样本] {conf_log}")
                return

            last_reason = why
            print(f"   [✗] {why}")
            if drag_tries < args.retries:
                r = page.evaluate(REFRESH_JS)
                print(f"   [refresh] {r}")
                time.sleep(2.5)

        raise RuntimeError(f"拖拽 {drag_tries} 次 / 换题 {title_tries} 次均未通过：{last_reason} | conf 样本={conf_log}")


if __name__ == "__main__":
    main()
