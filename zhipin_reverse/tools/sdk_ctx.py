import pathlib
import re
import sys

p = pathlib.Path(r"D:\ds_work\js_reverse_projects\zhipin_reverse\config\_sdk_6d66a65a.js")
s = p.read_text(encoding="utf-8", errors="replace")

for kw in sys.argv[1:]:
    print(f"\n===== {kw} =====")
    for m in list(re.finditer(re.escape(kw), s))[:3]:
        i = m.start()
        print("...", s[max(0, i - 260): i + 260].replace("\n", " ")[:520])
        print("-")
