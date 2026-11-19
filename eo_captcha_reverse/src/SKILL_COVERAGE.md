# Skill 覆盖度自查（hello-js-reverse-skill v3.14.0）

对照对象：`C:\Users\卢\.dsh\skills\hello-js-reverse-skill`（SKILL.md + 26 篇 references + 14 个模板 + 8 个脚本 + 7 个案例 + evals）
自查时间：2026-11-18
结论先说：**第一轮只用了 SKILL.md 主干与一半的 references，路径 B 六步法、env-bundle、不透明令牌脚本、台账/基线脚本、源码级插桩（第四板斧）都没走**。本轮已补做其中四项并留下产物，其余记明未做的原因。

---

## 一、第一轮实际用到的（有证据）

| 项 | 用法 | 证据 |
|---|---|---|
| SKILL.md 问题路由表 | 按“带 sign/token 先重放再删减”“HTTP 200 内业务错误码”定层 | `e1/_replay`、`e18` |
| 路线阶梯 R3（补环境） | 把 `tdc.js` 放 Node `vm` 跑，读值补齐 | `scripts/env.mjs`、`e9/e15` |
| 链路 B → E | 用浏览器 collect 与本地 collect 做 A/B 对照，判定“问题在本地值” | `e7`(0) vs `e9/e15/e20`(12) |
| 结论四层 S1–S4 | 汇报只写到 S2/S3 部分 | README 第 0 节 |
| `inject_hook_preset("crypto")` / `("runtime_probe")` | 记录 btoa/JSON.stringify、canvas/webgl/事件注册 | `samples/tdc_hits.json`、`dumped_runtime.json` |
| `compare_env`（只用了摘要模式） | 采基础指纹 | evaluate 手采（未用 output_path） |
| `intercept_request` | 阻断 verify 拿完整 body（来源隔离） | `samples/capture3.json` |
| `browser-evidence-contract` 的主世界/Frame 约定 | 所有 TDC 读取都在 `frame_index=1, world="main"` | 各次 evaluate 返回的 frame 元数据 |

## 二、漏用 / 未用的（按对本任务的价值排序）

| 项 | 为什么该用 | 现状 |
|---|---|---|
| **路径 B 六步法** `path-b-env-emulation.md` | 我直接从“手写 env”开始，跳过了步骤 1（环境包基线）、步骤 3（读值差异）、步骤 5（内部验证清单） | ✅ 本轮补做步骤 1 + 环境包套用；步骤 3/5 部分补 |
| **`templates/env-bundle/apply.js` + `compare_env(output_path)`** | 官方“环境包 → jsdom/vm”通道；我手写 `env.mjs` 是重复造轮子，且值不一定等于基线 | ✅ 本轮已用，见 §三.2 |
| **`trace_property_access`（原生属性追踪）** | 唯一能给出“SDK 实读”证据级的原生面工具 | ✅ 本轮已跑，见 §三.1 |
| **源码级插桩（第四板斧）** `instrumentation(action="install")` + `tap_stage_calls` | 平坦化 VMP 用“阶段对照”找第一个分叉状态，正是我“本地/基线行为不同却不知差在哪”的解法 | ❌ 本轮装上了但被证书错误页打断，见 §四 |
| **`scripts/opaque-token-inspect.py`** | collect 就是不透明令牌，该用脚本做批次结构与稳定 run 分析，我手工切 8 字节块 | ✅ 本轮已跑，见 §三.3 |
| **`scripts/project-baseline.py`** | 版本身份（tdc.js 每次现场生成、build 绑定），没有基线就无法判断“换版了没有” | ✅ 本轮已建 `project-manifest.json` |
| **`scripts/experiment-ledger.py`**（门禁/台账/回读审计） | 我发了 10+ 次在线 verify，没走门禁、没预算、没结果分类——这是明确的方法违规 | ✅ 本轮补建 `runs/ledger.jsonl`（含 A/B/负对照），见 §三.4 |
| **`references/original-sdk-runtime.md` 的生命周期/哨兵实验** | TDC 可能首次读取后缓存；seed→init 顺序决定值 | ❌ 未做 |
| **`references/anti-debug.md`** | `tdc.js` 含 `debugger` 干扰与 `toString` 检测；我此前 hook 全 0 可能就是它 | ❌ 未做 |
| **`references/analysis-scenarios.md` 场景 9 `pre_inject_hooks`** | 首屏挑战页的正确 hook 时机（navigate 时注入），我用的是“加载后再 hook” | ❌ 未做（本轮改用 instrumentation，被打断） |
| **`references/troubleshooting.md` 签名值不一致逐步对比法** | 取代我“猜缺口”的做法 | 部分（块对齐可视为一种） |
| **`references/common-pitfalls.md` / `transform-validation.md`** | 改写后必须做行为对照 | 未做（正好撞上改写副作用） |
| **`cases/` 7 篇** | 尤其 `universal-vmp-source-instrumentation`、`vm-stream-armour-and-boolean-oracle-isolation`、`jsvmp-xhr-interceptor-env-emulation`、`jsvmp-ruishu6-cookie-412-sdenv` 与本案同型 | ❌ 一篇未读 |
| **`templates/vm-sandbox`、`node-request`、`python-request`、`param-tracking`** | 交付形态应是采集器 + 参数跟踪页，我交的是一堆 eN 实验脚本 | ❌ 未用 |
| **`scripts/sandbox-runner.js`、`verify_signer_offline`、`hook_jsvmp_interpreter`、`rdp_debugger`** | 各有明确适用面 | ❌ 未用 |
| **`references/signature-source-isolation.md` 的“新鲜度/绑定实验”** | collect↔sess↔build 的绑定关系我只做了“旧值重放 206”一条 | 部分 |
| **`references/protocol-analysis.md` 传输层诊断** | 我用 Node fetch 直连成功，等于已排除 TLS 绑定；但没按它的四步写法记录 | 部分 |
| **`evals/`** | 用于校验自己的判断是否合规（如 `single-variable-claim-audit`、`soft-reject-local-value`） | ❌ 未跑 |

## 三、本轮补做的四项（都有产物）

### 1. `trace_property_access`（原生面，证据级=“SDK 实读”）

`launch_browser(enable_trace=true)` → `navigate` → `trace_property_access(action="capture", duration=12)`：

```
total_events 20 / unique_properties 14
screen.rect(2) screen.availRect(2) screen.pixelDepth(2)
window.outerWidth outerHeight innerWidth innerHeight devicePixelRatio
navigator.hardwareConcurrency navigator.cookieEnabled
sessionStorage.setItem(3) getItem(1) document.cookie.get(2) .set(1)
by_site: dom/base/nsScreen.cpp, nsGlobalWindowInner.cpp, Navigator.cpp, SessionStorage.cpp, Document.cpp
```

判读（按 `original-sdk-runtime.md#读值差异` 的三级证据）：
* 这是**观察到的原生读取**，覆盖 reverse.5 声明的 77 个原生点；`coverage.negative_result_is_conclusive=false`，**没出现 ≠ 没读**。
* 结论：这份页面的校验链**没有**依赖 canvas/webgl/audio 这类原生重活作为“原生面”证据（它们走 JS 层，不在这 77 点里）。
* 直接否定我第一轮的一个判断依据：我曾把“缺音频指纹”当主因，那是**密文块差异**推断，不是读值证据。

### 2. 官方环境包 + `templates/env-bundle/apply.js`

`compare_env(output_path=samples/env_bundle.json)` → 150 874 B / 10 个 section → 用 `applyEnvBundle(w, bundle)` 套到我的 vm `window`：

```
applied 45 项（navigator 21 + plugins/mimeTypes + screen 11 + window 12）
skipped 16 项（包里只有类型名，如 Permissions/MediaDevices/GPU…）
notes: window 浏览器有 999 个全局名，这个窗口缺 961 个；时区要在进程里设 TZ；
       webgl 参数在 bundle.webgl.parameters；canvas 参照图 7078 长，不能直接当返回值
probe after bundle: screen=[1536,864], win=[1536,816,1522,705], dpr=1.25
```

**读值差异（实证）**：我手写 `env.mjs` 里写的是 `screen 1366×768 / inner 1281×624`，本轮浏览器基线是 `1536×864 / 1522×705` —— 手写值不等于基线，说明“按清单补”确实不可靠（`path-b` 第 575 行“按读值补，不按清单补”）。
套用环境包后 `collect=4396`（此前手写 4076），`verify` 仍 `errorCode=12`（`samples/e20_verify.json`，已入台账）。

### 3. `opaque-token-inspect.py`（collect 结构）

4 份浏览器 collect（跨 4 个 build）：

```json
{"text":{"count":4,"length_min":4888,"length_max":5080,"distinct_lengths":3,
         "all_length_multiple_of_4":true,"has_padding":true,"distinct_chars":64,
         "guess":"base64-or-custom-alphabet"},
 "bytes":{"length_min":3664,"length_max":3808,"mean_entropy_bits":7.936,"zero_byte_ratio":0.0035},
 "head_stable_runs":[], "tail_stable_runs":[], "length_field_candidates":[]}
```

判读：标准 base64、无固定头尾骨架、无长度字段 → 与“密钥 build 绑定 + 8B 块加密”一致；S1 只能做“长度区间 + base64 合法性”校验，不能做魔数校验。这比我手工切块更规范，且纠正了“靠头尾对齐找结构”的错误预期。

### 4. 版本基线 + 实验台账（治理层）

```
project-manifest.json   # tdc.js / browser_tdc.js / widget-ele.js / eo-frame.js / TEOCaptchaWidget.js 的哈希与版本身份
runs/ledger.jsonl       # batch=20261118-eo
  A          accepted  浏览器 collect + Node 发送 → errorCode 0（samples/e18_live_end_to_end.json）
  B          rejected  本地 TDC collect（env-bundle 套用）→ errorCode 12（samples/e20_verify.json）
  neg-replay rejected  复用 sess 重放 → errorCode 206（samples/replay1.result.txt）
summary: rejected 2 / accepted 1 / target_ok 0
```

## 四、本轮没做成的，以及原因（不当成目标行为）

* **源码级插桩没跑起来**：`instrumentation(action="install", url_pattern="**/tdc.js*", mode="ast")` 注册成功（`files_rewritten=0` 的 route 就绪），`reload` 后页面变成 **Firefox 证书错误页**（`title="Warning: Security Risk"`，`chrome://global/skin/aboutNetError.css`），`files_seen=0`。按 `controlled-experiments.md#结果分类` 记为 `transport_error`，**不能写成“目标有反插桩检测”**。
* 未做的原因：遵守链路 K（频控/受限时停止当批）与预算纪律，本轮不再对同一目标追加在线探测；插桩与读值差异需要在网络条件正常时重做。

## 五、补做的第五项：`pre_inject_hooks`（场景 9）+ 发现一条此前完全漏掉的通道

`analysis-scenarios.md` 场景 9 的正确做法是**在 navigate 时注入**（`pre_inject_hooks=["xhr","fetch","cookie_hook"]`），
而不是我第一轮那样“页面加载完再 hook”。按这个做法重跑一次挑战页，`hooks_injected` 生效并自动 reload：

```text
hooks_injected: ["xhr","fetch","cookie_hook"]   reloaded: true
点击后 __mcp_xhr_log：
  POST https://captcha.eo.qq.com/cap_union_new_verify
  POST https://captcha.eo.qq.com/cap_union_new_getsig     ← 第一轮从未见过的通道
__mcp_cookie_log：仅 get（空），本次没有 JS 写 cookie
```

**新增证据**：正常路径（verify 成功）看不到 `cap_union_new_getsig`；这次我用 `intercept_request(action="block")` 阻断 verify 后，
widget 走了 getsig 兜底分支。这解释了 `widget-ele.js` 里 `decodeGetsigJson` / `armor` 相关代码平时“死”着的原因，
也验证了 `cases/multi-surface-sdk-source-isolation.md` 的“多面”判断——**同一个 widget 至少两条取值通道，我只盯了一条**。

同时按 `browser-evidence-contract.md` 标注观测副作用：这次的 getsig 是**被阻断制造出来的**，不能当正常路径写。

## 六、第一轮两个方法论错误（已纠正）

| 错误 | 纠正 |
|---|---|
| 用“密文块差异”猜缺什么 | `original-sdk-runtime.md#读值差异` 要求分三级证据；`trace_property_access` 显示 TDC 的原生读取集中在 screen/window/navigator/sessionStorage，**没有** canvas/webgl/audio 原生点 → “缺音频指纹”只是观察差异，不是 SDK 实读证据 |
| 手写环境值 | `path-b` 第 575 行“按读值补，不按清单补”，且 `compare_env` 本轮基线是 1536×864/DPR 1.25，我手写的是 1366×768 → 手写值不等于基线 |

## 七、由 `cases/vm-stream-armour-and-boolean-oracle-isolation.md` 得到的新假设（未验证）

该案例与本案同型（等长流式护甲 + 粗粒度返回 + 时序/统计载荷）。它的关键结论：

> 人工臆测的高密度平滑曲线**全部被拒**；换用贴合当前目标**实测采样分布**的序列后连续通过。
> 它证明服务端校验的是**载荷统计形态**，不是浏览器原生物理事件标记。

对照我的做法：`scripts/env.mjs` 的 `fireSyntheticActivity()` 生成的是 **37 个线性等距点 + 固定 24 ms 间隔**，
正是案例里“被拒”的那一类。所以 `errorCode=12` 的主因很可能是**轨迹统计形态**，而不是我先前认为的“指纹缺失”。

验证方案（遵守门禁，单批次一个问题）：
1. 在浏览器里录一段**真实输入**在 iframe 内的 pointer 轨迹（时间戳、坐标、buttons），作为基线分布样本；
2. 冻结 collect 其余部分，只替换轨迹序列，跑 A2/B 对照；
3. 若轨迹替换能翻转 → 归因成立；不能翻转再回到指纹缺口。

### 7.1 已完成：轨迹录制装置 + 单变量消融（结论：不翻转）

**装置**：`scripts/record_trace.py`（Python + Camoufox 真实输入，Playwright `page.mouse`）

```powershell
# 真实输入的类人轨迹（Fitts 加减速 + 贝塞尔偏置 + 抖动 + 非均匀采样）
python scripts\record_trace.py --mode synthetic --profile human --seed 7
# 真人手动点一次（脚本只监听，不注入任何事件）
python scripts\record_trace.py --mode manual
```

踩到的三个坑（都已修，写进脚本注释）：

1. **widget 页面里有两个 iframe**：隐藏模板 iframe 的 `getBoundingClientRect().y ≈ -999924`。必须遍历 `iframe` 元素，用 `bounding_box()` 过滤掉视口外的那个，否则点击坐标落到屏幕外，`events=0`。
2. **`page.route(abort verify)` 会让 Firefox 返回 `NS_ERROR_ABORT`**，连主文档导航一起失败（`frames: ['about:blank']`）。录制时用 `--no-block`，点击后立刻读轨迹，抢在跳转前。
3. **本机 Python 版 Camoufox 的网络全挂**（连 `https://example.com` 都超时，而 MCP 的同一浏览器正常）。根因是 **DoH(TRR) + IPv6**：`firefox_user_prefs={"network.trr.mode": 5, "network.dns.disableIPv6": True}` 后恢复正常（实测 example.com → 200）。

**录到的基线**（`samples/traces/synthetic-human-20261118-135950.json`）：

```text
events 1283（isTrusted 1283/1283，全真）
pointermove/mousemove 各 639，pointerdown/mousedown/pointerup/mouseup/click 各 1
相邻事件间隔 dt: p25=11ms median=11ms p75=12ms p95=13ms max=1165ms
总时长 12.0s，末点 target=verifyCheckbox
```

对比第一轮的合成轨迹：**37 个点、固定 24ms、dispatchEvent（isTrusted=false）**。差异是数量级级别。

**消融结果**：`scripts/e21_trace_replay.mjs` 把 1283 个真实事件按原顺序、原时间戳回放进本地 TDC：
`replayed handlers=641 / collect=4012 / errorCode=12` —— **轨迹单变量替换不翻转**。

判读（按 `controlled-experiments.md#单变量没有翻转时`）：轨迹形态不是唯一门 ⇒ 至少两道并联门（轨迹 + 指纹/字段完整性），
不能写“轨迹修好了”，也不能写“轨迹无关”（并联闸门下单项仍可能要修）。

### 7.2 移植既有项目 `slider_captcha/manmanbuy_slider/solve.py` 的轨迹模型（仍不翻转）

那份过阿里滑块的项目用的不是纯贝塞尔，而是**分段速度映射**。逐项对照：

| 维度 | `slider_captcha` 的 `TrajectoryGen` | 我第一轮的 `human_path` | 移植后 `slider_path` |
|---|---|---|---|
| 起点 | 滑块起点 0 | 屏幕角落横跨半屏 | 距目标 18–80px 就近出发 |
| 犹豫段 | 200–500ms，x∈[0,0.3]、y=gauss(0,1.5) | 无 | 150–400ms 同构 |
| 速度模型 | 5 段：0–3% 极慢 → 3–25% ^1.6 → 25–60% 匀速+6 周期正弦 → 60–85% 1-(1-t)^2.8 → 85–100% ^0.6 | 余弦 ease-in-out + 贝塞尔横向偏置 | 原样移植 5 段 |
| 采样间隔 | 6–12ms | 12–67ms（正弦分布） | 6–12ms |
| Y 抖动 | gauss(0, 3.5(1-0.7p)/3) + 0.6·sin(p50) | gauss(0,0.6) 恒定 | 原样移植 |
| 过冲回调 | 30% 概率：冲过 2–5px 再回位 | 无 | 原样移植 |
| 落点/按压 | down 后 20ms 起滑；up 前停 80–180ms | 100–350ms / 60–140ms | 80–180ms / 20–140ms |

录制结果：`samples/traces/synthetic-slider-20261118-142939.json`
`events=1185（isTrusted 1185/1185）`，pointermove/mousemove 各 590，down/up/click 各 1。
回放（`e21_trace_replay.mjs`）：`replayed handlers=592 / collect=4140 / errorCode=12`。

**两次不同轨迹模型（长途贝塞尔 1283 事件、短距分段 1185 事件）都返回 12**
⇒ 轨迹形态在当前证据下**不是决定门**（结论强度：排除“轨迹是唯一门”，不能排除“并联门之一”）。
下一步按 `controlled-experiments.md` 转交叉矩阵：冻结这份带犹豫/过冲的轨迹，只换环境（env-bundle ↔ 手写 env）再跑一格。

---

## 9. 环境对齐（按 `jsdom-env-patches.md` 与“读值差异”做的系统性修复）

### 9.1 先拿到“SDK 实读”清单（不再靠猜）

用 `instrumentation(action="rewrite_source")` 给 `tdc.js` 做 AST 插桩（397 处成员访问），
再给 tap 日志加白名单过滤（否则 20000 条上限会被 VM 的数字索引吃满，实测 dropped 722 万条）。
得到 TDC 真正读过的 86 个环境键，例如：

```
toString(1431) style(256) createElement(157) appendChild(146) offsetWidth(124) width(123)
offsetHeight(103) addEventListener(19) canPlayType(17) matchMedia(15) userAgent(9)
getContext(6) getParameter(4) getExtension(4) gpu(2) URL(2) userAgentData(2)
timing(2) responseStart/responseEnd/loadEventEnd(2) getComputedStyle(2) insertBefore(2) …
```

其中 **`undefined` 的项就是缺口**：`gpu / URL / userAgentData / storage / getComputedStyle / insertBefore / removeAttribute / innerHTML / performance.timing.*`。

### 9.2 用 iframe 的真实基线做对照（之前用错了 frame）

`compare_env` 采的是**主 frame**（1536×864），而 TDC 跑在 **330×70 的 widget iframe** 里。
iframe 内实测基线：`screen 2048×1152`、`inner 330×70`、`outer 2048×1104`、`dpr 1.25`、
`[object Navigator] / [object HTMLDocument] / [object Screen]`、
`Function.prototype.toString → "function userAgent() {\n    [native code]\n}"`（**Firefox 是两行格式，不是单行**）、
`navigator.userAgent` 是**原型上的 getter**、`document.hasFocus() === false`、`readyState complete`、`characterSet UTF-8`。

### 9.3 本轮实际改掉的（`scripts/env.mjs` 的 `harden()`）

| 类别 | 修法 |
|---|---|
| 原生函数源码泄漏 | 覆盖 `Function.prototype.toString`，对自建函数返回 **Firefox 两行** `[native code]`（WeakSet 标记 + 递归 walk 对象/原型；canvas ctx 每次新建都要重新 walk） |
| 对象标签 | `Symbol.toStringTag` → Navigator / HTMLDocument / Screen / Window |
| 几何 | 按 iframe 真实值：inner 330×70、outer 2048×1104、screen 2048×1152 |
| 文档状态 | readyState=complete、characterSet=UTF-8、compatMode、contentType、domain、`hasFocus()=false` |
| 缺失 API | `fetch / matchMedia / requestAnimationFrame / indexedDB / Notification / Worker / RTCPeerConnection / caches / visualViewport` |
| 原型/接口 | `document.URL/documentURI/defaultView/parentWindow`、`getComputedStyle`、body 的 `insertBefore/removeChild/replaceChild`、元素 `innerHTML/outerHTML/removeAttribute` |
| 性能接口 | `performance.timing` 用 getter 提供 navigationStart…loadEventEnd、`navigation`、`timeOrigin`、`getEntriesByType` |
| **音频指纹** | 先在浏览器 hook `OfflineAudioContext.prototype.startRendering` 录下真实 buffer（4500 样本、44100Hz、sum=308.958），再在 env 里原样返回；`OfflineAudioContext` 构造改成兼容**对象参数**（原来只认三参数，导致构造后立刻抛错，采集一直是 `_state:-2`） |
| 字体/文本度量 | `measureText('mmmmmmmmmmlli')` 返回 Firefox 实测 90.02083587646484（原来 96.56） |

### 9.4 效果与仍未到 0

```
collect 长度：4012 → 4076 → 4184 → 4236      （同 build 浏览器真实值 4888）
音频采集：    _state:-2（异常） → _state:0（结构 500B）
storage 采集：_state:0
verify：      仍是 errorCode=12（样本 e21，台账 batch=20261118-envfix）
```

剩余缺口 **约 652 个 base64 字符（≈489 字节明文）**。按当前证据最能解释的是**事件编码长度**：
真实点击时 TDC 收到 639 条 mousemove，回放只有 592 次 handler 命中（差 47 条 × ~10B ≈ 480B），
其次是 `getImageData(120×60)` 的像素摘要与字体“检测结果集”（我们只给了宽度表）。
下一步就是逐项对齐这两个，再测。

### 9.5 第二轮：同一份字节的块对齐 + 变异归因（本轮实做）

**(a) 先解决“同一 build”问题**：服务端每次请求都现场生成 `tdc.js`（同 URL 两次下载字节不同，密钥也不同，
所以跨请求的 collect 逐块对比 0% 相同）。正确做法是取**浏览器实际执行的那份响应体**：
`export_network_capture` → `capture7.json` → `response_body` → 本地 `vm` 里跑同一份字节。
这样密钥才一致：**440 块中 151 块（34.3%）完全相同**，最长连续 37 块。

**(b) 变异归因（`scripts/e30_mutation_map.mjs`）**：本地环境里一次只改一个字段，看哪些 8 字节块跟着变，
并与“两次基线之间自己会变的块”（时间/随机）分离：

```
self-varying blocks: 2,149,158,276-321,378,380,381      ← 时间/事件序列段
userAgent 改 → 149 块变（稳定 99 块）    platform → 315 块    hc → 139 块
screen    改 → 105 块变                  windowSize → 53     storage → 54     webgl → 53
canvas / fonts / audio / timezone → 各 10-11 块
```

说明明文里 **UA/platform/核数/屏幕占了大半篇幅**，而 canvas/audio/字体是“小段”。

**(c) 本轮继续补的**（`scripts/env.mjs`）：

| 项 | 来源 |
|---|---|
| `getImageData(120×60)` 真实像素 | 浏览器 hook `getImageData`，把 28800 字节 buffer 落盘 `samples/canvas_pixels.bin`，env 原样返回 |
| 事件对象补全 | target 换成 `#verifyCheckbox` 元素、`composedPath`、`offsetX/Y`、`movementX/Y`、`pressure/tilt/twist`、`which`、修饰键、`getModifierState` |
| `measureText` 真值表 | Firefox 实测 `mmmmmmmmmmlli` = 90.02083587646484 等 |

**(d) 现状**：`collect` 在 4300～4588 之间波动（同 build 浏览器 4696～4984），`errorCode` 仍是 12。
波动来自时间/事件段（self-varying 那 50 多块），要精确定位剩余差异必须**先固定随机源**
（把 `Date.now` / `performance.now` / `Math.random` 在两侧钉成同一序列），再跑块对齐 —— 这是下一轮的第一步。

### 9.6 第三轮（钉死随机 + 两项类型修复）

**(a) 随机源钉死实验（`scripts/e31_pin_random.mjs`）**：本地两次 `getData` 的差异块

```
pinned all        → 0 块自变（完全确定）
放开 Date.now     → 5 块（158,378,379,380,381）
放开 Math.random  → 2 块（277,278）
performance.now / crypto.getRandomValues → 影响被 Date 掩盖，单独放开仍 0
```

结论：**做块对齐必须先钉死 `Date` 与 `Math.random`**，否则 400 字节噪声会淹没真实差异。

**(b) 事件数量不是长度来源**：把回放事件数从 1185 提到 4740（4 倍），`collect` 长度不变（4236）。
⇒ TDC **不把事件逐条写入明文**，只写摘要/统计，所以“少 47 条事件”那条推断作废。

**(c) 两项类型修复**：

| 项 | 修法 | 依据 |
|---|---|---|
| 字体宽度查表 | TDC 传的 `fontFamily` 与我们探测串的空格/引号不一致，原来全部回落到 515 ⇒ 字体检测“一个都没测到”；改成归一化匹配（去空格、小写、剥引号） | `offsetWidth` 读数一直是 515/648/620 三个值 |
| WebGL 返回类型 | `ALIASED_LINE_WIDTH_RANGE` / `ALIASED_POINT_SIZE_RANGE` 真实是 `Float32Array`，原返回普通数组；`MAX_VIEWPORT_DIMS` 改 `Int32Array` | 浏览器 `webgl_getParameter` 记录 `[object Float32Array]` |

修完后 `collect` 到 4588（历史最高），仍 12。

## 五·补、正确的录制姿势（给下一次用）

| 目标 | 做法 |
|---|---|
| 要真人轨迹 | `python scripts\record_trace.py --mode manual`，然后在弹出的窗口里手动点复选框 |
| 要多样本 | 换 `--seed` 跑 synthetic，或 manual 多点几次（每次新 prehandle） |
| 要对照 | 同一份 trace 冻结，只换 collect 其它字段 / 只换 env，跑 A2/B 两格；一次只动一格 |
| 不要做 | 用 `dispatchEvent` 造事件（isTrusted=false，TDC 能区分）；用固定间隔线性轨迹（本案例已被判为“非人”） |

## 八、下一步（按 Skill 的正确顺序，而不是按我的猜测）

1. 修好网络/证书后先做 `instrumentation(action="status")` 归零检查 → `install(url_pattern="**/tdc.js*", tap_stage_calls=true)` → `reload` → 读 `tap_stage` 日志，用**阶段对照**找本地/基线第一个分叉的 VM 状态（`jsvmp-source-instrumentation.md#45`）。
2. 同时用 `inject_hook_preset("cookie_hook")` + `pre_inject_hooks=["xhr","fetch","cookie_hook"]`（`analysis-scenarios.md` 场景 9/场景 2）重做一次首屏，补齐 cookie 归因（`EO_Bot_Ssid`/`__tst_status` 谁写的）。
3. 补 `anti-debug.md` 的 `debugger` 与 `toString` 处理，再复核“本地 hook 全 0”是否由此导致。
4. 用 `templates/vm-sandbox` + `templates/param-tracking` 重写交付形态（采集器 + 版本页 + 实验单），而不是一堆 eN 脚本。
5. 每轮在线前先 `experiment-ledger.py gate`，遇 `rejected` 立即停批（本轮没做到，已补记）。
