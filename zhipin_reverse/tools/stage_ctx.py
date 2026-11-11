"""定位某个阶段（p 值）之前发生过哪些环境 API 调用。"""

import json
import sys


def load(path):
    return json.load(open(path, encoding="utf-8"))


def main():
    target = int(sys.argv[1]) if len(sys.argv) > 1 else 2726
    paths = sys.argv[2:] or [
        r"D:\ds_work\js_reverse_projects\zhipin_reverse\tmp_browser_stages.json",
        r"D:\ds_work\js_reverse_projects\zhipin_reverse\tmp_jsdom_stages.json",
    ]
    for path in paths:
        data = load(path)
        log = data["log"]
        api = data.get("api", [])
        idx = next((i for i, e in enumerate(log) if e["p"] == target), None)
        print(f"\n=== {path} | stages={len(log)} | p={target} at index {idx}")
        if idx is None:
            continue
        before = [e for e in api if e.get("s", 0) <= idx]
        print(f"api calls with s <= {idx}: {len(before)}")
        for e in before[-12:]:
            print(f"  s={e.get('s'):<4} {e['n']:<22} a={e['a']} r={e['r']}")


if __name__ == "__main__":
    main()
