# REPORT_A3 — mount 卡点定位 / 能否绕过 UI / `ny` 归属修正

- 日期：2026-11-13（第三轮）
- 前置：`static/REPORT_A.md`（不改）、`static/REPORT_A2.md`（不改，本报告含一条对其的**更正**）
- 纯静态/离线；只新增 `static/` 下文件
- 结论速览：**mount 只有一道硬门禁 —— `a()` 里的 `new window.AliyunCaptcha`，它要求 `window.AliyunCaptcha` 是 function；该全局只由 pe.081 的最后一条语句赋值。这道门禁失败时是「完全静默」的（promise 链里没有 `.catch`），与现场症状完全一致。**

---

## A. mount 卡在哪

### A.0 先把页面的真实配置钉死（**已证明**，来自 `config/inline_1.js`）

```js
window.AliyunCaptchaConfig = { region: "cn", prefix: "1sfr0c" };   // 没有 verifyType

window.initAliyunCaptcha({
  SceneId: 'vollz84f',
  mode: 'embed',
  element: '#captcha-element',
  button:  '#button',
  slideStyle: { width: 360, height: 40 },
  language: 'cn',
  immediate: true,
  rem: 2.5,
  captchaVerifyCallback, onBizResultCallback, getInstance
});
function getInstance(instance) { captcha = instance }        // 只保存，不调用 init()
```

⇒ 关键推论（**已证明**，见 A.2）：`init()` 是**构造函数内部自动调用**的，页面不调用它并不影响 mount；`immediate: true` 也不是问题。

### A.1 唯一的门禁链（AliyunCaptcha.js，**已证明**）

```js
// AliyunCaptcha.js [219000,219360)
function a(){
  var r = window.AliyunCaptcha.prototype;      // ← 若全局未定义，这里直接 TypeError
  r.config = e; r.deviceConfig = rr;
  n && "function"==typeof n && n(u), t(u);
  var i = new window.AliyunCaptcha;            // ← 构造函数内部自动 init() → mount
  e.getInstance && e.getInstance(i)            // ← getInstance 回调
}
```

调用 `a()` 的两处，条件是**并联**的：

```js
// [219532,219876)  —— 图片预载分支（l = CaptchaType 属于 PUZZLE/INPAINTING）
var f = u.CaptchaType,
    l = !("TRACELESS"===f || "SLIDING"===f || "CHECK_BOX"===f);     // PUZZLE ⇒ true
l && Promise.all([Lr(u.PuzzleImage), Lr(u.Image)]).then(function(t){
    var n=t[0], i=t[1];
    n && e._extend({PuzzleImage:n});
    i && e._extend({Image:i});
    e._extend({imgPreLoaded:!0});
    "function"==typeof window.AliyunCaptcha && !0===e.dynamicJSLoaded && a()   // ★ 门禁 1
});                                                                 // ★ 没有 .catch

// [219876,220300)  —— dynamicJS 加载回调
Or("js", i, o, u.CaptchaJsPath, null, function(t){
    t ? ( ...DYNAMICJS_FAIL... )
      : ( e._extend({dynamicJSLoaded:!0}), ..., l && !e.imgPreLoaded || a() )   // ★ 门禁 2：短路
}, 5e3);
```

**门禁 1（决定性）**：`typeof window.AliyunCaptcha === "function" && e.dynamicJSLoaded === true`。
**门禁 2（短路陷阱）**：`l && !e.imgPreLoaded || a()` —— 当 `l===true`（PUZZLE）且图片**尚未**预载完成时，这个表达式为 `true`，**`a()` 被跳过**。

#### ★ 静默死锁（**最可能的元凶**，强度：有支持）

把两处按执行顺序排一遍（PUZZLE，`l===true`）：

| 时序 | 门禁 2（dynamicJS 回调） | 门禁 1（图片 promise） | 结果 |
|---|---|---|---|
| 图片先完成，JS 后完成 | `imgPreLoaded=true` → `true && !true`=`false` → **调用 `a()`** | 已先跑：`imgPreLoaded=true`，若 `window.AliyunCaptcha` 缺失则不调 `a()` | ✅ 正常 |
| **JS 先完成，图片后完成** | `imgPreLoaded=false` → `true && true`=`true` → **跳过 `a()`** | 之后跑：`typeof window.AliyunCaptcha==="function"` 若为 **false** → 跳过 `a()` | ❌ **死锁，且没有任何回调/报错** |
| 图片 promise **reject**（`Lr` 失败） | `imgPreLoaded` 永远 false → 跳过 | `.then` 永不执行 | ❌ **死锁**（`Promise.all` 无 `.catch`，只会产生 unhandled rejection） |

⇒ **现场症状（InitCaptcha 成功、PNG 请求发出、`getInstance` 从不触发、`window.AliyunCaptcha` 为 undefined、无 console 报错）与上表第 2/3 行完全吻合。**

`window.AliyunCaptcha` 的唯一赋值点（**已证明**）：
```
pe.081 [443061]  t = window, NodeList.prototype.forEach = Array.prototype.forEach, t.AliyunCaptcha = rS
```
它是 pe.081 这个 IIFE 的**最后一条语句** —— 只要该文件没被加载、被 CSP 拦、或中途抛错，这个全局就不存在。

> ⚠️ 先排除工具误差：FINDINGS 里已经踩过「隔离世界读不到页面全局」（`window.__ALIYUN_CRYPT.MD5` 读不到）。请在 **main world** 里断言：
> `typeof window.AliyunCaptcha`、`typeof window.FEILIN`、`window.__CloseAliyunCaptcha`。

### A.2 mount 入口与调用者（**已证明**）

```
getInstance ← a() ← 门禁 1/2
   └─ new window.AliyunCaptcha()              // rS 构造函数正是挂载入口
        ├─ 读 config：this.$button = nq(n.button)   [436000]
        │            this.$element = nq(n.element)  [436172]
        │            CaptchaType=Puzzle ⇒ this.CaptchaConstructor = ru   [436344]
        ├─ var o = function(t){ …装 20+ 个方法到 t.prototype…; return e }(rS)   // [436466 … 4429xx]
        │        ⇒ o === rS.prototype
        └─ o.init.call(this, rS, n)            // [442975] ★ 构造函数末尾直接调 init()
```

**`init()` 本体（pe.081 `[438796,440144)`，可直接读）：**

```js
e.init = function(){
  window.__CloseAliyunCaptcha || (window.__CloseAliyunCaptcha = u.bind(this));
  nH(document.body,"mousedown",window.__CloseAliyunCaptcha);
  nH(document.body,"touchstart",window.__CloseAliyunCaptcha);
  s(!0);                                        // ★ loading(true)：隐藏 img/puzzle，显示 .aliyunCaptcha-loading
  this.refreshTime = Date.now();
  var t = this.config.mode;
  this.captcha = new this.CaptchaConstructor({AliyunCaptcha:this, mode:t, initialData:this.config});  // ← 滑块 UI 在这里构建
  this.bindEvents();
  (function(t){ /* Android 字号修正 */ })(o.mode);
}
```

- `s` = `e.loading`（`[436849,437433)` 定义在本轮 dump 中，`if(t){隐藏 img/puzzle}` / `else{显示}`）。
- `new ru(...)`（`ru` = Puzzle 构造器，`[419606,419864)`，258 字符的 CFF 薄壳：`eX[…](this,22)[…](this,arguments)`）⇒ **滑块 UI 的真实构建代码在 `eX` 状态机（pe.081 `[389393,419203)`）里**，这也是为什么在 CFF 外层搜不到 DOM 明文。
- 挂载 HTML 模板（模块级常量，**已证明**）：
  `eq`（拼图盒 `#aliyunCaptcha-img-box` + `#aliyunCaptcha-img` + `#aliyunCaptcha-puzzle` + 滑动条）@ `[387472,~388768)`；
  `eW`（`#aliyunCaptcha-window-embed`，含 `eq`）@ `[388768…]`；
  `eH`（`#aliyunCaptcha-window-float`）@ `[388878…]`；`eF`（mask + popup）。

### A.3 三个挂载器等价物（谁往 DOM 里插东西）

| 方法 | 偏移 | 插入位置 | 前置条件 |
|---|---|---|---|
| `e.initEmbed(t,n)` | `[441069,441224)` | `this.$element`（**你的 `#captcha-element`**） | `config.element` 必须能 `nq()` 到；`immediate` 为真时不再绑 `$button.onclick` |
| `e.initFloat(t)` | `[441237,441609)` | `#aliyunCaptcha-float-wrapper`（由 `ep()` 先插进 `this.element`） | `ep()` 里对 `3.0`+`float` 且 **非** `CHECK_BOX/SLIDING` 才建 wrapper |
| `e.initPopup(t)` | `[440996,441056)` | `document.body` | — |

> 注意 `ep()`（`[369968,371727)`）第 1 行就把 `"3.0"===verifyType && "embed"===mode` **静默改写成 `mode:"float"`**（`[438474]` 还有一处同样的改写）。本页 `verifyType` 未设置 ⇒ 取默认 **`"2.0"`**（`AliyunCaptcha.js [221044]`：`On = In ? "1.0" : Mn.verifyType || "2.0"`），**不会触发这条改写**，`mode` 保持 `embed`。

### A.4 前置条件总清单（mount 之前被判定的东西）

| # | 判定项 | 位置 | 失败后果 |
|---|---|---|---|
| 1 | `window.AliyunCaptcha` 是 function | AliyunCaptcha.js `[219832]` | `a()` 不执行 → **完全静默**，无实例、无 mount |
| 2 | `e.dynamicJSLoaded === true` | 同上 | 同上 |
| 3 | `Promise.all([Lr(PuzzleImage), Lr(Image)])` 必须 **resolve** | `[219532]` | `.then` 不跑 → `imgPreLoaded` 永假 → 门禁 2 短路 → 静默 |
| 4 | `l === true`（CaptchaType ∈ PUZZLE/INPAINTING） | `[219532]` | 若 SLIDING/TRACELESS/CHECK_BOX 则走另一条（`a()` 由门禁 2 直接调） |
| 5 | `AliyunCaptchaConfig.region/prefix` | `[221044]` | `appKey/endpoints` 取不到 → InitCaptcha 失败（现场已成功，排除） |
| 6 | `config.element` 能被 `nq()` 找到 | pe.081 `[436172]` | `this.$element === null` → `initEmbed` 里 `this.$element.innerHTML` 抛错 |
| 7 | `init()` 内 `new (config.CaptchaConstructor)` 不抛错 | pe.081 `[438944]` | 抛错则 mount 中断（会被调用栈上层吞掉） |

**没有**看到 `visibilityState` / `IntersectionObserver` / `devicePixelRatio` / `document.readyState` 参与 mount 判定（`dom_scan.js` 全库扫描：`IntersectionObserver` 0 命中、`visibilityState` 0 命中、`readyState` 只在 URL 解析器里）。`MutationObserver` 2 处都在 ES5 shim 模块（`[119181,119862)`），与本流程无关。**`requestAnimationFrame` 也不参与 mount。**

### A.5 ★ 运行时可验证的预测（拿去一次实验定案）

| # | 断言（在 **main world** 执行） | 若成立 ⇒ 结论 |
|---|---|---|
| P1 | `typeof window.AliyunCaptcha === "function"` | **false ⇒ 就是它**：dynamicJS 未执行完，mount 必死。修法见 A.6 |
| P2 | `typeof window.FEILIN`（应为 object） 且 `typeof window.um` | 若 FEILIN 有而 AliyunCaptcha 无 ⇒ 两个 bundle 分别加载，**只有 dynamicJS 这条挂了** |
| P3 | `window.__CloseAliyunCaptcha === undefined` | 说明 `init()` 从未执行 ⇒ 反证 `a()` 从未执行（而不是 mount 内部出错） |
| P4 | `document.querySelector("#aliyunCaptcha-window-embed") === null` | 说明 `initEmbed` 从未执行（而不是执行了但被 CSS 隐藏） |
| P5 | 在 `initAliyunCaptcha` 调用后 3s，手工 `new window.AliyunCaptcha()` 前先做 P1 | P1 为真时，直接执行 A.6 的两行即可看到 `#captcha-element` 被填充 ⇒ 证明**只剩门禁 1 未过** |

> 另外一个高性价比对照实验：**把 `mode` 从 `embed` 改成 `popup` 再跑一次**。若 popup 下界面出现（挂在 `<body>` 末尾的 `#aliyunCaptcha-window-popup`），则说明流水线本身是通的，问题只在你给的 `element` 那条分支。

### A.6 旁路（绕过门禁，直接触发 mount）

```js
// 前提：先让 P1 为真。若为假，先补 load 一次 dynamicJS：
if (typeof window.AliyunCaptcha !== "function") {
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://g.alicdn.com/captcha-frontend/dynamicJS/3.29.0/pe.081.a2ede546e341a1b9.js";
    s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
}
// 然后复刻 a() 的最后两行（AliyunCaptcha.js [219262,219300]）：
window.AliyunCaptcha.prototype.config = CFG;      // CFG = loader 的 e（见 B.3 的截获法）
const inst = new window.AliyunCaptcha();          // ← 构造函数内部会自动 init() → initEmbed → mount
CFG.getInstance && CFG.getInstance(inst);
```

⚠️ `new window.AliyunCaptcha()` 需要 `prototype.config` 已经是"被 `_extend` 过的 config"（含 `CertifyId / Image / PuzzleImage / DeviceToken / SceneId / endpoints / appKey / deviceConfig` 等），**否则 `init()` 里的 `new ru(...)` 会因为缺字段走不到渲染**。所以必须先拿到 loader 内部的 `e`。

---

## B. 能否绕过 UI 直接生成 `data`

### B.1 先更正 REPORT_A2 的一条判断（**已证明**）

REPORT_A2 说 `ny`（feilin076 `[333749,336232)`，内含 `i=rV(tY)` @333864）是暗层"最强宿主"。本轮用作用域解析（`node/scope.js`）复核：

```
refs to 'ny': 2
  off=141185  →  解析到 FunctionExpression@140659   （另一个同名局部）
  off=520315  →  解析到 FunctionDeclaration@479310  （另一处声明，函数提升覆盖）
```

⇒ **`[333749,336232)` 这个 `ny` 没有任何引用点**（同名 `ny` 被另外两处遮蔽）。它要么是死代码，要么通过池名/`apply` 间接调用，但**按名字检索不到**。
**因此 REPORT_A2 里"`ny` 是最强宿主"应降级为"未定"**；`rV(tY)` 这一处不能当成 `data` 的出口。

### B.2 `data` 的产生位置（现状）

- `data` 字段最终是 `base64(25 13 27 ‖ enc)`，`|enc| = |T| − 3`（REPORT_A §6.1，已证明）。
- pe.081 里唯一的"字节→latin1→base64"出口是 `tt`（`[265778,266010)`），而 `tt` 的字节源只有 pako ⇒ **`data` 的 852 字节缓冲不在 pe.081 生成**（REPORT_A2 §2，已证明）。
- feilin076 里 3 个 `rV(...)`（btoa）调用点：`333864`/`335477`（在无引用的 `ny` 内）、`520311`（`l=rV(ny)`，其中 `ny` 是该函数内的**局部字符串变量**，不是那个函数）。⇒ 三个点都不能直接认定。
- 结论：**`data` 的生成函数尚未定位**（强度：未定）。它必然在 feilin076 里，但入口名是池化+拼接，需要按 §B.3 的运行时手段拿。

### B.3 可行路径（推荐按顺序试）

1. **先修 mount（A.6），让 SDK 自己产 `data`** —— 这是当前唯一"确定能拿到同轮 `(T, enc)`"的路线（R5：页面出值、你本地发送）。拿到 `captchaVerifyParam` 后按 REPORT_A §8 的判定法（先 `enc & 0x7F`）一次定案 A/B。
2. **若要纯协议**：必须在 `initAliyunCaptcha` 之前用 `addInitScript` / 注入脚本包裹它，截获 loader 的 config：

```js
// 页面脚本执行前注入（Playwright: addInitScript / Camoufox: evaluateOnNewDocument）
(function(){
  const orig = window.initAliyunCaptcha;
  Object.defineProperty(window, 'initAliyunCaptcha', {
    configurable: true,
    get(){ return function(cfg){ window.__CFG__ = cfg; return orig.apply(this, arguments); }; },
    set(v){ orig = v; }
  });
  // 同时监控全局赋值，一旦 pe.081 把类挂上就立刻补跑 a() 的尾巴
  let _ac;
  Object.defineProperty(window, 'AliyunCaptcha', {
    configurable: true,
    get(){ return _ac; },
    set(v){ _ac = v;
      try {
        if (window.__CFG__ && v) {
          v.prototype.config = window.__CFG__;
          const inst = new v();
          window.__CFG__.getInstance && window.__CFG__.getInstance(inst);
        }
      } catch (e) { console.error('[mount-bypass]', e); }
    }
  });
})();
```
   这样即使门禁 1/2 因时序或图片 reject 而短路，也会在 `AliyunCaptcha` 被赋值的瞬间补跑 `new + getInstance`。
3. **缺什么**：缺 `prototype.deviceConfig`（loader 里的 `rr`）。若 `new ru(...)` 需要它，可从 `window.FEILIN` 侧取（`initFeiLin(De, e)` 会把 `De` 传进去）。这一点**未验证**。

---

## C. `F` 反汇编器（本轮未展开，给已完成的脚手架）

**已完成的可复用件**：
- 已抽出 `D`（解释器，`[210303,214281)`，3978 字符）、`F`（字节码，16838 字）、`W`（常量池，291 项），并**在 Node 里跑通**（`node/vmrun.js`、`node/nonce_vm_evidence.js`）。
- 解释器 opcode 语义已读出 11 条（REPORT_A2 §3.1 表），足以开始写反汇编器：`pc` 游标 + `A=r[n++]` 取 opcode，`19` 带跳转目标、`56` push scope、`12` concat-n、`26` mod、`25` jmp-if-false、`29` shr、`55` new-array、`41` break。
- `W` 中 `"fromCharCode"` 的索引是 **16**（0-based 15），紧邻的常量簇是 `[0,236]`、`[131,142,134,137,143,152]`、`"map"`、`"join"`、`[59,93,78,…]`（一大段 0–255 数）—— 这段确实长得像"每字节取 7 位 + 条件置高位"的常数表，但**尚无证据**证明它是暗层（强度：观察到）。

**建议下一步（按性价比）**：先在 A.6 修通 mount 拿到同轮 `(T, enc)`（1 次实验即可定 A/B），再决定是否值得写反汇编器。若那时判定为 B（依赖 nonce/会话密钥），反汇编器才有必要。

---

## D. 本轮新增脚本

| 路径 | 作用 |
|---|---|
| `static/node/dom_scan.js` | 把 DOM/可见性/尺寸 token 归到"所属函数区间"，输出 mount 候选区间表 |
| `static/node/resolve_methods.js` | 尝试解析 `<pool>+"e"` 形式的混淆方法名（**0 命中**，记录为负结果） |
| `static/node/feilin_find.js` | 在 feilin076 的 905 池项里搜 `init*`/`Element`/`FLOAT` 等 |
| `static/dump_verifytype.py`、`static/concat_scan.py`、`static/alias_scan.py` | 定位 `verifyType/mode` 改写、`+"e"` 拼接、`window.AliyunCaptcha` 赋值点 |

## E. 强度汇总

| 结论 | 强度 |
|---|---|
| 页面配置为 `mode:embed, immediate:true, verifyType=默认"2.0"` | 已证明（inline_1.js + `[221044]`） |
| 构造函数内部自动 `init()`（`o.init.call(this,rS,n)`，`o===rS.prototype`） | 已证明 |
| `getInstance` 只在 `a()` 内触发，`a()` 被两处门禁控制 | 已证明 |
| 门禁 1 是 `typeof window.AliyunCaptcha==="function" && dynamicJSLoaded` | 已证明 |
| 门禁 2 `l && !imgPreLoaded \|\| a()` 存在"JS 先到 → 跳过"的短路 | 已证明（源码字面） |
| 图片 promise 无 `.catch`，reject ⇒ 静默死锁 | 已证明（源码字面） |
| 现场症状 = 门禁 1 失败 / 图片 reject / 世界选错 三者之一 | 有支持（三条都能产生同一症状，需 P1–P5 定案） |
| `verifyType="3.0"` 会把 `embed` 静默改成 `float`（本页不触发） | 已证明 |
| `ny`(333749) 无引用，不是 `data` 出口 | 已证明（作用域解析），**更正 REPORT_A2** |
| `data` 生成函数位置 | 未定 |
| mount 之外没有 `visibilityState`/`IntersectionObserver` 门禁 | 已排除（全库 0 命中） |
