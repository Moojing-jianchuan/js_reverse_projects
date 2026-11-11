"""测量浏览器里 CSSStyleDeclaration 的几种枚举口径，定位 SDK 那个 1866 元数组的来源。"""

from camoufox.sync_api import Camoufox

JS = """
() => {
  const cs = getComputedStyle(document.body);
  const forIn = []; for (const k in cs) forIn.push(k);
  const own = Object.getOwnPropertyNames(cs);
  const protoOwn = [];
  let p = Object.getPrototypeOf(cs); let guard = 0;
  while (p && p !== Object.prototype && guard++ < 8) {
    for (const n of Object.getOwnPropertyNames(p)) protoOwn.push(n);
    p = Object.getPrototypeOf(p);
  }
  const ctorNames = Object.getOwnPropertyNames(CSSStyleDeclaration.prototype);
  return {
    length: cs.length,
    forIn: forIn.length,
    own: own.length,
    protoOwn: protoOwn.length,
    ownPlusProto: own.length + protoOwn.length,
    ctorNames: ctorNames.length,
    forInPlusCtor: forIn.length + ctorNames.length,
    firstForIn: forIn.slice(0, 6),
    firstProto: protoOwn.slice(0, 6),
  };
}
"""

with Camoufox(headless=True) as browser:
    page = browser.new_page()
    page.goto("https://www.zhipin.com/robots.txt", wait_until="domcontentloaded", timeout=60000)
    data = page.evaluate(JS)
print(data)
