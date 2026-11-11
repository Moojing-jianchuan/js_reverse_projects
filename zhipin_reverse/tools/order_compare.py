"""对比两侧「加载/执行顺序」是否一致：阶段序列、API 调用序列、首段初始化顺序。"""

import json
from pathlib import Path

ROOT = Path(r"D:\ds_work\js_reverse_projects\zhipin_reverse")
b = json.loads((ROOT / "tmp_browser_stages.json").read_text(encoding="utf-8"))
j = json.loads((ROOT / "tmp_jsdom_stages.json").read_text(encoding="utf-8"))

bp = [e["p"] for e in b["log"]]
jp = [e["p"] for e in j["log"]]
print(f"阶段数: browser={len(bp)} jsdom={len(jp)}")
print("阶段序列完全一致:", bp == jp)
if bp != jp:
    for i, (x, y) in enumerate(zip(bp, jp)):
        if x != y:
            print(f"  首个位置差异 index={i}: browser p={x} / jsdom p={y}")
            break

ba = [(e.get("s"), e.get("n") or e.get("api") or "") for e in b.get("api", [])]
ja = [(e.get("s"), e.get("n") or e.get("api") or "") for e in j.get("api", [])]
print(f"API 调用数: browser={len(ba)} jsdom={len(ja)}")
print("API 序列完全一致:", ba == ja)
if ba != ja:
    for i, (x, y) in enumerate(zip(ba, ja)):
        if x != y:
            print(f"  首个 API 差异 index={i}: {x} vs {y}")
            break

print("\n前 12 个阶段（顺序对照）:")
for i in range(min(12, len(bp), len(jp))):
    print(f"  #{i:<2} browser={bp[i]:<6} jsdom={jp[i]:<6} 一致={bp[i]==jp[i]}")

# 顺序对齐的另一个视角：每个 p 首次出现的相对次序
bfirst = {}
for idx, p in enumerate(bp):
    bfirst.setdefault(p, idx)
jfirst = {}
for idx, p in enumerate(jp):
    jfirst.setdefault(p, idx)
same_first_order = (sorted(bfirst, key=lambda p: bfirst[p]) == sorted(jfirst, key=lambda p: jfirst[p]))
print("\n各阶段首次出现次序一致:", same_first_order, f"(共 {len(bfirst)} 个不同 p)")
