"""把 SDK 里的 169 处 `return fn.apply(this,[p].concat(Array.prototype.slice.call(arguments)))`
改写成带阶段日志的版本，语义保持不变。

用法：python tools/instrument_sdk.py <sdk.js> <out.js>
"""

import re
import subprocess
import sys
from pathlib import Path

CALL_RE = re.compile(
    r"return ([A-Za-z_$][\w$]*)\.apply\(this,\s*\[(\d+)\]\.concat\("
    r"Array\.prototype\.slice\.call\(arguments\)\)\)"
)


def rewrite(src: str) -> tuple[str, int]:
    def repl(m: re.Match) -> str:
        fn, p = m.group(1), m.group(2)
        return (
            "var __st_args=Array.prototype.slice.call(arguments);"
            f"var __st_ret={fn}.apply(this,[{p}].concat(__st_args));"
            f"__trace({p},__st_args,__st_ret);"
            "return __st_ret;"
        )

    out, n = CALL_RE.subn(repl, src)
    return out, n


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 1
    src_path, out_path = Path(sys.argv[1]), Path(sys.argv[2])
    src = src_path.read_text(encoding="utf-8", errors="replace")
    out, n = rewrite(src)
    if n == 0:
        print("no call sites matched")
        return 2
    # 语法自检：纯正则改写一旦落进字符串字面量/标识符中间，产出的就是坏脚本，
    # 必须在这里拦住（上游 PR 复审正是抓到这一类问题）。
    check = subprocess.run(["node", "--check", "-"], input=out, text=True,
                           capture_output=True)
    if check.returncode != 0:
        print("语法自检失败，未写出文件：")
        print((check.stderr or "").strip()[:600])
        return 3
    out_path.write_text(out, encoding="utf-8")
    print(f"instrumented {n} call sites -> {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
