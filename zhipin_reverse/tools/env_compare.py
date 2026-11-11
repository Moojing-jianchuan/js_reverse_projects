"""对比两路的环境快照，列出差异项。"""

import json
import sys


def main():
    a = json.load(open(sys.argv[1], encoding="utf-8"))
    b = json.load(open(sys.argv[2], encoding="utf-8"))
    sa, sb = a.get("env", {}), b.get("env", {})
    keys = sorted(set(sa) | set(sb))
    same = 0
    for k in keys:
        va, vb = sa.get(k, "<missing>"), sb.get(k, "<missing>")
        if va == vb:
            same += 1
            continue
        print(f"{k:<24} browser={str(va)[:60]!r}  jsdom={str(vb)[:60]!r}")
    print(f"\nsame: {same}/{len(keys)}")


if __name__ == "__main__":
    main()
