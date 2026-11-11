"""采集 Firefox 的 getComputedStyle 枚举结果，写入 config/browser_env.json。

采集内容：
  cssProps       —— cs[0..length-1]（kebab 属性名，按索引顺序）
  cssValues      —— 每个属性名对应的计算值
  cssForIn       —— for...in 的完整顺序（SDK 若用 for-in 会拿到这个）
  cssOwnNames    —— Object.getOwnPropertyNames(cs)
  cssProtoEntries—— 原型链上每个属性的 {n, e}（e=是否可枚举）

用法：python tools/capture_css.py
"""

import json
import pathlib

from camoufox.sync_api import Camoufox

ROOT = pathlib.Path(__file__).resolve().parent.parent
ENV = ROOT / "config" / "browser_env.json"

CAPTURE = """
() => {
  const cs = getComputedStyle(document.body);
  const names = [];
  for (let i = 0; i < cs.length; i++) names.push(cs[i]);
  const values = {};
  for (const n of names) {
    try { values[n] = cs.getPropertyValue(n); } catch (e) { values[n] = ''; }
  }
  const forIn = [];
  for (const k in cs) forIn.push(k);

  const protoEntries = [];
  const seen = new Set();
  let p = cs;
  while (p && p !== Object.prototype) {
    for (const n of Object.getOwnPropertyNames(p)) {
      if (seen.has(n)) continue;
      seen.add(n);
      const d = Object.getOwnPropertyDescriptor(p, n);
      protoEntries.push({ n: n, e: !!(d && d.enumerable) });
    }
    p = Object.getPrototypeOf(p);
  }

  return {
    length: cs.length,
    keys: Object.keys(cs).length,
    names,
    values,
    forIn,
    ownNames: Object.getOwnPropertyNames(cs),
    protoEntries,
    sample: names.slice(0, 8),
  };
}
"""


def main():
    with Camoufox(headless=True) as browser:
        page = browser.new_page()
        page.goto("https://www.zhipin.com/robots.txt", wait_until="domcontentloaded", timeout=60000)
        data = page.evaluate(CAPTURE)

    env = json.loads(ENV.read_text(encoding="utf-8")) if ENV.exists() else {}
    env["cssProps"] = data["names"]
    env["cssValues"] = data["values"]
    env["cssForIn"] = data["forIn"]
    env["cssOwnNames"] = data["ownNames"]
    env["cssProtoEntries"] = data["protoEntries"]
    ENV.write_text(json.dumps(env), encoding="utf-8")

    print("length:", data["length"], "keys:", data["keys"],
          "forIn:", len(data["forIn"]), "ownNames:", len(data["ownNames"]),
          "proto:", len(data["protoEntries"]),
          "protoEnumerable:", sum(1 for e in data["protoEntries"] if e["e"]))
    print("saved into", ENV)


if __name__ == "__main__":
    main()
