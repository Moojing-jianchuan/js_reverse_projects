"""ssxmod_gen — 调用 Node 补环境生成 ssxmod_itna / ssxmod_itna2 + M 值"""
import json
import subprocess
import os
import re


def generate_ssxmod_cookies():
    ssxmod_dir = os.path.join(os.path.dirname(__file__), "ssxmod")
    result = subprocess.run(
        ["node", "run_with_env.js"],
        cwd=ssxmod_dir,
        capture_output=True,
        text=True,
        timeout=60,
    )
    output = result.stdout

    # 优先从 [COOKIE] 行提取完整值
    cookie_line = ""
    for line in output.splitlines():
        if line.startswith("[COOKIE]"):
            cookie_line = line
            break

    def _extract(name):
        m = re.search(rf'{re.escape(name)}=([^;\s]+)', cookie_line)
        if m:
            return m.group(1)
        m = re.search(rf'\[RESULT\]\s+{name}\.preview\s*=\s*(\S+)', output)
        return m.group(1) if m else ""

    # 从 [LOCAL_STORAGE] 提取 __00b204e9800998__ 的 M 值 (格式: "M值||timestamp")
    m_value = ""
    ls_match = re.search(r'"__00b204e9800998__"\s*:\s*"([^"]+)"', output)
    if ls_match:
        raw = ls_match.group(1)
        m_value = raw.split("||")[0] if "||" in raw else raw

    return _extract("ssxmod_itna"), _extract("ssxmod_itna2"), m_value


if __name__ == "__main__":
    itna, itna2, m_val = generate_ssxmod_cookies()
    print(f"ssxmod_itna.length={len(itna)}")
    print(f"ssxmod_itna2.length={len(itna2)}")
    print(f"m_value={m_val}")
