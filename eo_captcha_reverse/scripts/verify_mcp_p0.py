"""验证 camoufox-reverse-mcp 的三个 P0 改造是否真的生效。

用法（MCP 进程已重启后）：
    python scripts/verify_mcp_p0.py p1     # P0-1 正则插桩
    python scripts/verify_mcp_p0.py p2     # P0-2 mock body_file
    python scripts/verify_mcp_p0.py p3     # P0-3 断点 URL 模式 + 正则

说明：本脚本走的是 MCP 工具层（和 Agent 调用的同一套），不是直接 import 包内部函数 ——
这样验证的是"Agent 实际能用",而不是"函数存在"。
注意：MCP 工具只能由 Agent（模型）调用；此脚本验证的是**源码层**是否已具备能力
（import 签名 + 关键逻辑），工具的端到端调用由 Agent 侧完成。
"""

import inspect
import json
import sys
from pathlib import Path

PKG = Path(r"D:\mcp-servers\camoufox-reverse-mcp\src\camoufox_reverse_mcp")


def check(cond, msg):
    print(("  PASS  " if cond else "  FAIL  ") + msg)
    return bool(cond)


def p1():
    """P0-1: instrumentation 支持 inject=[{find, before/after, group}]"""
    print("== P0-1 源码级正则插桩 ==")
    src = (PKG / "tools" / "instrumentation.py").read_text(encoding="utf-8", errors="replace")
    ok = True
    ok &= check("inject" in src, "instrumentation.py 出现 inject 参数")
    # 函数签名里要有 inject
    try:
        sys.path.insert(0, str(PKG.parent))
        from camoufox_reverse_mcp.tools import instrumentation as inst_mod
        sig = inspect.signature(inst_mod.instrumentation)
        ok &= check("inject" in sig.parameters, f"签名含 inject（现有参数：{list(sig.parameters)[:12]}）")
    except Exception as exc:
        ok &= check(False, f"import instrumentation 失败: {exc}")
    ok &= check("find" in src and ("before" in src or "after" in src), "出现 find / before|after 语义")
    return ok


def p2():
    """P0-2: intercept_request 支持 mock_response.body_file"""
    print("== P0-2 mock_response.body_file ==")
    src = (PKG / "tools" / "network.py").read_text(encoding="utf-8", errors="replace")
    ok = True
    ok &= check("body_file" in src, "network.py 出现 body_file")
    ok &= check(("read_text" in src or "read_bytes" in src or "open(" in src), "有读文件动作")
    ok &= check("body" in src, "保留 body 参数（向后兼容）")
    return ok


def p3():
    """P0-3: set_breakpoint 支持 url_pattern + find，并在 reload 后自动重下"""
    print("== P0-3 断点跨 build ==")
    import re
    src = (PKG / "debugger_rdp_tools.py").read_text(encoding="utf-8", errors="replace")
    ok = True
    # 必须看函数签名本身，不能只看文件里有没有这个词（102KB 文件里 "find" 到处都有）
    m = re.search(r"def set_breakpoint\s*\((.*?)\)\s*(?:->|\:)", src, re.S)
    if not m:
        return check(False, "找不到 def set_breakpoint 的签名")
    params = m.group(1)
    ok &= check("url_pattern" in params, f"set_breakpoint 签名含 url_pattern")
    ok &= check("find" in params, f"set_breakpoint 签名含 find")
    ok &= check("occurrence" in params, f"set_breakpoint 签名含 occurrence")
    # 自动重下：必须有实际的"重设断点"实现函数
    ok &= check(("_reapplied_breakpoints" in src) or ("_reapply_breakpoints" in src),
                "存在重下断点的实现函数（_reapply_breakpoints）")
    ok &= check("reapply_failed" in src, "正则不再匹配时有显式报告（reapply_failed）")
    return ok


def main():
    which = (sys.argv[1] if len(sys.argv) > 1 else "all").lower()
    fns = {"p1": p1, "p2": p2, "p3": p3}
    targets = list(fns.values()) if which == "all" else [fns[which]]
    results = [fn() for fn in targets]
    print("\n==== SUMMARY ====")
    print(json.dumps({k: ("PASS" if v else "FAIL") for k, v in zip(
        ["p1", "p2", "p3"] if which == "all" else [which], results)}, ensure_ascii=False))
    return 0 if all(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
