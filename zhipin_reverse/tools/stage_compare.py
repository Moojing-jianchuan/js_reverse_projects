"""对照浏览器 / jsdom 两路阶段日志，定位第一个分歧点。

用法：python tools/stage_compare.py tmp_browser_stages.json tmp_jsdom_stages.json
"""

import json
import sys


def load(path):
    return json.load(open(path, encoding="utf-8"))


def main():
    a_path, b_path = sys.argv[1], sys.argv[2]
    a, b = load(a_path), load(b_path)
    la, lb = a["log"], b["log"]
    print(f"browser: {len(la)} stages, token len {a['len']}, head {a['head'][:24]}")
    print(f"jsdom  : {len(lb)} stages, token len {b['len']}, head {b['head'][:24]}")

    n = min(len(la), len(lb))
    first = None
    for i in range(n):
        if la[i]["p"] != lb[i]["p"]:
            first = ("p-order", i, la[i], lb[i])
            break
        if la[i]["r"] != lb[i]["r"] or la[i]["a"] != lb[i]["a"]:
            if first is None:
                first = ("value", i, la[i], lb[i])
    if first:
        kind, i, x, y = first
        print(f"\nFIRST DIVERGENCE ({kind}) at #{i}")
        print("  browser:", json.dumps({k: x[k] for k in ("p", "a", "r")}, ensure_ascii=False)[:400])
        print("  jsdom  :", json.dumps({k: y[k] for k in ("p", "a", "r")}, ensure_ascii=False)[:400])
    else:
        print(f"\nno divergence in first {n} stages")

    # 按 p 聚合：比较出现次数与首次返回值摘要
    def agg(log):
        out = {}
        for e in log:
            k = e["p"]
            d = out.setdefault(k, {"n": 0, "r": e["r"], "a": e["a"]})
            d["n"] += 1
        return out

    ga, gb = agg(la), agg(lb)
    only_a = sorted(set(ga) - set(gb))
    only_b = sorted(set(gb) - set(ga))
    print(f"\nstages only in browser: {len(only_a)} -> {only_a[:15]}")
    print(f"stages only in jsdom  : {len(only_b)} -> {only_b[:15]}")

    diffs = []
    for p in sorted(set(ga) & set(gb)):
        if ga[p]["r"] != gb[p]["r"]:
            diffs.append((p, ga[p]["n"], gb[p]["n"], ga[p]["r"], gb[p]["r"]))
    print(f"\ncommon stages with different return digest: {len(diffs)}")
    for p, na, nb, ra, rb in diffs[:12]:
        print(f"  p={p} n={na}/{nb}\n    browser: {ra[:120]}\n    jsdom  : {rb[:120]}")


if __name__ == "__main__":
    main()
