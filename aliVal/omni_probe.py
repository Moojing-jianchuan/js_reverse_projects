"""在 omni.ja 里定位 RDP watcher/target 的协议实现，拿到正确方法名与参数。"""
import io
import re
import sys
import zipfile

OMNI = r"C:\Users\卢\AppData\Local\camoufox\camoufox\Cache\browsers\whitenightshadow\152.0.4-beta.30-reverse.5\omni.ja"
KEYS = ["watchTargets", "getWatcher", "windowGlobalTarget", "getThread", "attachThread", "targetType"]
MAX_PER_KEY = 3


def main():
    z = zipfile.ZipFile(OMNI)
    names = [n for n in z.namelist() if ("devtools/server" in n or "devtools/shared" in n) and n.endswith((".js", ".mjs"))]
    print("devtools server/shared js files:", len(names))
    hits = {k: [] for k in KEYS}
    for n in names:
        try:
            data = z.read(n).decode("utf-8", "replace")
        except Exception:
            continue
        for k in KEYS:
            if len(hits[k]) >= MAX_PER_KEY:
                continue
            for m in re.finditer(re.escape(k), data):
                s = max(0, m.start() - 160)
                snippet = data[s:m.start() + 200].replace("\n", " ")
                hits[k].append((n, snippet))
                if len(hits[k]) >= MAX_PER_KEY:
                    break
    for k in KEYS:
        print(f"\n===== {k} ({len(hits[k])} hits)")
        for n, sn in hits[k]:
            print(f"  [{n}]")
            print("   ", sn[:340])
    z.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
