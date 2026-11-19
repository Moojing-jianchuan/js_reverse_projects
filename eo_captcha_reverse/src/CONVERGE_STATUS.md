# 离线收敛状态（2026-11-18，零网络请求）

本批严格离线：`experiment-ledger.py gate --budget 0` 实际拦截（`allowed:false, budget_exhausted`），
未发任何 prehandle / verify。

## 1. 子任务产出

| 子任务 | 产物 | 关键结论 |
|---|---|---|
| C：六项环境修复 | `scripts/env_candidate.mjs`、`scripts/env_selftest.mjs`、`scripts/env_regress.mjs`、`src/ENV_FIX_REPORT.md` | 51/51 自测绿；`collect` 4204 与基线**完全一致**；该 build 实测**未调用** `measureText` / `getContext('webgl2')` |
| D：收敛度量工具 | `scripts/converge_metric.mjs`、`src/CONVERGE_METRIC.md` | 见该报告（钉源 + 块对齐 + 变异归因） |
| 主会话：口径复核 | `src/ENV_GAP_REVIEW.md` | `screen` 2048×1152、`canvas` 300×150、`audio` 44100 三条**不是缺陷**（子会话用了另一实例/另一 frame 的基线） |

## 2. 块级定位（`scripts/e34_offset_profile.mjs`）

```
浏览器 440 块（3520 B）  本地 385 块（3080 B）  delta 55 块（440 B）
B[  0.. 15] offset=  0      ← 头部一致（128 B）
B[ 62.. 94] offset= 14      ← 浏览器在此前插入了 14 块
B[281..323] offset= 48  42 块连续一致
B[327..368] offset= 48  42 块连续一致   ← 尾部两大段完全相同（336 B ×2）
本地缺口（未匹配）：B[133..154] 22 块、B[216..233] 18 块、B[248..280] 33 块
```

判读：**不是整体错乱，而是浏览器在若干位置多写了块**；尾部两个 42 块大段完全一致，
说明 webgl/media 这类大字段的值是对齐的。

## 3. 字段消融（`scripts/e37_ablate_real.mjs`，真实能力替换而非假开关）

```
baseline 385 块（3080 B）
no-webgl   → 359 块（-26 块 / -208 B）
no-media   → 370 块（-15 块 / -120 B）
no-audio   → 379 块（- 6 块 / - 48 B）
no-fonts / no-storage / no-canvas-paint → 长度不变，仅 6~7 块内容变
```

合计 47 块，与浏览器多出的 55 块同量级 ⇒ 差异集中在 **webgl / media / audio 三段的“深度”**，
其余是内容级差异（字体列表、storage 值、canvas 绘制）。

## 4. WebGL 能力已验证补齐（`scripts/e38_gl_calls.mjs`）

TDC 在这份 build 上跑完了完整流水线，**48 次调用**：

```
getShaderPrecisionFormat×12  getParameter×4  getExtension×3  getSupportedExtensions×2
createShader×2 shaderSource×2 compileShader×2 attachShader×2 deleteShader×2
isContextLost  createProgram linkProgram useProgram createBuffer bindBuffer bufferData
getAttribLocation enableVertexAttribArray vertexAttribPointer viewport clearColor clear
drawArrays readPixels deleteBuffer deleteProgram
```

即 round4 补的方法栈**被真实调用**，SDK 不再静默降级。

## 5. 仍不同构的“值”（离线无法猜中，需要一次浏览器侧取证）

| 项 | 现状 | 为什么离线解决不了 |
|---|---|---|
| `readPixels` | stub 不写像素 | GPU 渲染结果每台机器不同；只能录一次真实 buffer 回放 |
| 事件 `{"count":0,"items":[]}` | 本地恒 0 | 浏览器那份 collect 本身就带真实 mousemove；条数与内容需同时对齐 |
| 字体“检测结果集” | 只给宽度表 | TDC 的 span 文本/字号未确知，检测出的字体名单可能不同 |
| `storage` 值 | `TDC_itoken` 单键 | 浏览器侧同一时刻的键名/长度需实采 |

## 6. 度量工具给出的更硬结论（`src/CONVERGE_METRIC.md`）

子任务 D 把指标从"按索引比块"改成"按内容比块"，并纠正了我上面的索引统计：

```
--pin=all: 本地 3144 B / 393 块，selfVarying=0（只钉 Date 就够，Math.random/crypto 对本 build 无贡献）
index 口径: identicalBlocks 16/440 (3.64%)   ← 长度错位假象（本地少 47 块）
content 口径: bagMatched 213/440 (48.4%)，neverInLocal 216 块 ≈1728 B
时间维度: timeOwned 仅 7 块，命中内容残差 3 块 → 时间已排除
事件维度: 回放 1283 事件 → 块 393→402，但 bagMatched 213→210、残差 238→240 → 事件无关
调值维度: 10 个指纹字段单点变异，bagMatched 最多 +1（hardwareConcurrency）→ 调值无用
```

**三条残差区间**（按字节）：

| 区间 | 大小 | 形态判读 |
|---|---|---|
| `[291-353]` | 504 B | 连续一条，像完整清单型记录（插件/字体/媒体设备） |
| `[223-258]` | 288 B | 中等结构 |
| `[16-38]` | 184 B | 紧接 16 块一致区，疑为"前置记录/字段计数"，会影响后续所有块 |

**主指标从此改为**：`content.bagMatched`（上升为改进）+ `neverInLocal`（下降为改进）。
索引版 `identicalBlocks/residual` 只作对照 —— 否则任何长度变化都会把改进读成退化。

## 7. 已否定的候选（都是离线实测，不是推测）

| 假设 | 做法 | 结果 |
|---|---|---|
| 缺口是事件轨迹 | 回放 1283/4740 条真实事件 | `collect` 长度几乎不动，`bagMatched` 213→210（更差） |
| 缺口是"调值"（UA/platform/屏幕/核数…） | 10 个字段单点变异 | `bagMatched` 最多 +1（`hardwareConcurrency`）⇒ 值本来就对 |
| 缺口是时间/随机 | 钉死 `Date`/`Math.random`/`crypto` | `selfVarying` 0，`timeOwned` 仅 7 块 ⇒ 已排除 |
| 缺口是 C 的 6 项修复 | `env_candidate` vs `env.mjs` | `--pin=all` 下 **collect 字节完全相同** ⇒ 零影响 |
| 缺口是 WebGL 方法栈 | 补 30+ 方法 + `readPixels` | TDC 真的跑完 48 次调用（`e38`），但 `collect` 长度不变 ⇒ 能力已够，缺的是"内容" |
| **缺口是 WebRTC ICE candidates**（`e33` 写入键里出现过 `urls: stun:…` / `iceServers`） | 给 `RTCPeerConnection` 实现 `_gather()`，按真实格式发 4 条 host/srflx/tcp candidate + `candidate:null` 结束事件 | `collect` **仍 4204，一点没变** ⇒ 否掉（TDC 只探测 `iceServers` 配置，不收集 candidate） |

## 9. 授权的一次浏览器取证：技术结果与停止理由

按授权做了**一次**取证尝试（`scripts/browser_probe.py`，只加载挑战页 + 注入只读 hook，**不碰 verify**）。
三次技术重试后仍拿不到数据，按纪律**停止当批**，不再重试。

| 尝试 | 改动 | 结果 |
|---|---|---|
| 1 | `new_context()` + `add_init_script`（含 storage/cookie hook） | `hasTDC: undefined`，`readPixels 0`，`fonts 0` |
| 2 | 去掉 storage/cookie hook（怀疑它们破坏了 widget 初始化） | 同上 |
| 3 | 改用 Camoufox 原生 `browser.new_page()`（`new_context` 会丢指纹配置） | 同上 |

诊断证据（`samples/browser_probe.json`，97 B）：

```
frame0 blog.51cto.com     title=Security Verification  hasTDC=undefined  __probe=object
frame1 widget_ele_eo.html title=验证码                  hasTDC=undefined  __probe=object  body="Verify you are human"
```

- hook 注入成功（`__probe` 在**两个** frame 里都是 object），说明 `add_init_script` 没问题；
- widget 正常渲染（`Verify you are human`），但 **`window.TDC` 始终没有被定义** ⇒ `tdc.js` 根本没被加载；
- `tdc.js` 由 widget 在 `prehandle` 成功后动态插入 ⇒ 推断 **prehandle 被拒/降级**。

**判断**：这条出口/会话很可能已进入频控（本会话前期发了数十次 `prehandle` + `verify`，属链路 K 的“验证/受限”信号）。
按 `problem-routing.md` 链路 K：**停止当批、保留证据、不做本地预判**，恢复后用原目标复验；继续重试只会让状态更差。

## 11. "采集不到"的定位（2026-11-23 深夜，MCP 实例实测）

### 结论先说

**不是采集不到，是 Python 那个 Camoufox 实例的 `tdc.js` 没加载**；MCP 这个实例一切正常，能直接抓到。
站点没有降级、hook 也没有失效（`__probe` 在两个 frame 都是 object）。

### 证据

```
MCP 实例（network_capture）：
  cap_union_prehandle  200 (2087 B)
  tdc.js               200 (249052 B)
  frame1 window.TDC    object

同一次加载里 hook 到的采集：
  readPixels  2 次：64x64 (16384 B) sum=0 nz=0 ；16x16 (1024 B) sum=0 nz=0
  getImageData 1 次：120x60 (28800 B)，base64 头是 "AAAA…"（全 0）
```

**重要**：真实浏览器（Camoufox + resistFingerprinting）里 `readPixels` / `getImageData` **本来就是全 0**。
我们 `env.mjs` 的 stub 不写像素、`canvas_pixels.bin` 也是全 0 —— 这一项其实是**一致**的，不是缺口。

### 50 项环境探针逐项 diff（`scripts/e41_env_diff.mjs`）

浏览器基线 `samples/browser_env_snapshot.json`（iframe 内实测）vs 本地，初始 **12 项不同**：

| 项 | 浏览器 | 本地（修复前） | 处置 |
|---|---|---|---|
| `locale` | `en` | `zh-CN` | ✅ 已修（覆盖 `w.Intl`） |
| `measureText('mmmmmmmmmmlli')` @11pt / @18pt | 126.4167 / 216.4792 | 90.0208 / 90.0208（**不随 font 变**） | ✅ 已修（按 `ctx.font` 解析 px 缩放） |
| `glVendor` / `glRenderer` | `null` / `null` | 字符串 | ⚠️ 试过改成 null → `bagMatched` 213→200 **负优化，已回退** |
| `webgl2 VERSION` / 扩展数 | `WebGL 2.0` / 16 | `WebGL 1.0` / 29 | env.mjs 未合并（该 build 未调用 webgl2，`env_candidate` 有实现） |
| `screen` / `outer` | 1920×1080 / 1904×911 | 2048×1152 / 2048×1104 | 实例差异，不动 |
| `visibilityState` / `hidden` | `hidden` / `true` | `visible` / `false` | MCP 窗口在后台；真实用户点击时是 visible，保持 visible |
| `cookie` | `TDC_itoken=…` | `TDC_itoken=…` | 值不同，无关 |

修复后仍不同 **9 项**（上表除 locale/measure 外）。

### 收敛度量（唯一口径，`--pin=all`）

```
修复前： bagMatched 213/440 (48.4%)   neverInLocal 216
修复后： bagMatched 212/440 (48.2%)   neverInLocal 216    ← 基本持平（-1 块）
回退 glVendor 后： bagMatched 212      localCollect 3144 B
改成 null 那次：   bagMatched 200      localCollect 3072 B  ← 更低，说明该值确实被写进明文
```

**判读**：`locale` 与 `measureText` 是**真实的错值**，但修完 `bagMatched` 不动 ⇒ 这两个字段不是残差来源。
剩下的 216 块（1728 B）仍然无法用"补值/补能力"解释。

### 下一步只剩两条（都需要你定）

1. **继续深挖写入点**：在 TDC 正常加载的会话里 hook VM 的 `0x1f/0x22`（写容器），拿到"浏览器实际写了哪些字段"，
   与本地 115 个写键逐一比对 —— 这是唯一能直接指认 216 块的办法。做法：`intercept_request(mock)` 把 `tdc.js`
   换成本地"只加日志"的版本（不改逻辑），或对同一 build 用 `instrumentation` 定向 tap。
2. **接受当前边界**：`bagMatched 48%` + 纯本地 collect 被拒（12），走 R5（页面出值、本地采集）。

## 13. rdp_debugger 断点尝试（2026-11-23 深夜，两次后停止）

目标：在真实浏览器里对 VM 的写入 opcode 下条件断点，拿到"SDK 实际写了哪些字段"。

### 做成了的

```
launch(url=挑战页)                      → 调试端口 51672，指纹配置继承
enable(url_substr="51cto")              → attach ok
sources(url_substr="tdc.js")            → source24 / sourceLength 192476
source(save_path=samples/rdp_tdc.js)    → 全文落盘
breakable_positions(line=1)             → 单行脚本的可停列（2400+ 个）
set_breakpoint(column=12486,
  condition='typeof _0xf6d96d[_0xcb7fef[_0x496920+2]] === "string"')
                                        → installed，吸附到 0-based 12485 ✓
```

顺带确认了 opcode 编号 **确实 build 绑定**：
- `192476` 字符那份：写入是 `case 0x1f`
- `241194` 字符那份（同一次运行里 reload 后）：写入变成 `case 0x51 / 0x5a / 0x5e`

### 卡在哪（两条，都是机制性的）

1. **断点不跨导航**：`reload` 返回
   `reapply_skipped: [{hint: "这个断点只按 sourceId 下的…要跨导航请用 source_url 下断点"}]`。
   而 `tdc.js` 的 URL 里带 `js_data`，**每次请求都变**（同一会话两次 reload 拿到 192476 与 241194 两份不同脚本），
   所以 source_url 也没法预先固定。
2. **无法触发 `getData()`**：TDC 的写入集中在 `getData` 调用时，但 `rdp_debugger` 只能在**暂停帧**里 evaluate，
   而 `window.TDC` 在 widget iframe（跨域），主 frame 访问不到；让页面自己点又等于发一次 verify（越界）。

按纪律：同一手段两次不成即停，`rdp_debugger` 会话已 close（`profile_removed: true`）。

### 下次要过这一关，只有三条路

1. **Python + `route.fulfill` 注入本地"只加日志"的 `tdc.js`**（能读文件、无参数大小限制）。
   上次 `record_writes.py` 试过但 `hasTDC=false`，需要先确认是"脚本被 replace 后报错"还是"iframe 对象陈旧"，
   判据：fulfill 后 `frame.evaluate("typeof window.TDC_NAME")` 与页面 console 是否报 SyntaxError。
2. **本地起一个 HTTP 服务，把 tdc.js 的 URL 指过去**（需要改 hosts 或让 prehandle 的 js 域名可替换，成本高）。
3. **接受边界**：`bagMatched 48%` + R5（页面出值、本地采集）。

## 12. 恢复取证的三条路径（下次任选其一，都需要授权）

1. **冷却后重试**：等一段冷却（数小时级），用同一脚本跑一次；判据是 `frame1.hasTDC === 'function'`。
2. **换出口**：换 IP/实例再做同样的一次采集。
3. **人工点到通过为止**：由你在浏览器窗口里手动点击复选框直到进入文章页，我在**同一会话**里读 `__probe`
   —— 这条不依赖 `tdc.js` 自动加载，命中的概率最高。

采到之后，把 `readPixels / getImageData / fonts / storage` 四份基线回放进 `env.mjs`，再跑
`node scripts/converge_metric.mjs --pin=all`，看 `bagMatched` 是否从 213/440 抬升 —— 那是判断“补齐了”的唯一口径。

1. **浏览器侧取证（一次）**：在真实浏览器里 `route` 注入一个"只加日志、不改逻辑"的 `tdc.js`，导出
   `readPixels` 的真实像素、事件 `items`、字体检测结果、`storage` 快照 → 落到 `samples/`，之后全部离线回放。
2. 回放后跑 `converge_metric.mjs`，看 `residual` 是否降到个位数。
3. `residual` ≤ 时间戳块后，再申请**一次**在线 verify（单批次单假设，预算 1）。
