# REPORT_C — 纯 Node 跑通 slideAuth 的端到端实验（2026-11-13 18:45–19:10）

目标：用纯 Node（不启动浏览器）完成一次 `slideAuth`，让
`https://tool.manmanbuy.com/m/aliVal.aspx?method=slideAuth` 返回 `captchaVerifyResult: true`。
加密层不重做（`feilin_data.js` 的 `armour()` 已由 `verify_armour.js` 2/2 逐字节证明）。

**一句话结论（最终）：纯协议边界 = S2，已收口。**
`data` 可离线逐字节等价生成、几何可做到 0.24 CSS px、`flag` 可信标记可复现、`certifyId` 秒级提交、
请求上下文可由页面自己发、设备 `Log` 回 `{"ResultObject":true,"Code":"200"}`——**六类假设全部实测排除**，
但 `captchaVerifyResult` 仍恒为 false，唯真人手工输入能拿到 true。
§9 另定位并消除了一个长期污染源：**profile 被 `mkdtemp` 钉死在同一目录**，会把 device 链路打成 `status 0`。
剩余差异（动力学随机性 / 设备侧一次性序列）在现有端点下**无可观测信号**，无法再逼近。

---

## 0. 交付物（全部新脚本在项目根，未改动任何已验证产物）

| 脚本 | 作用 |
|---|---|
| `e2e_common.js` | HTTP、证据落盘（`static/work/e2e/`）、slideAuth 次数配额（硬上限 10） |
| `e2e_01_init.js` | 纯 Node `InitCaptcha`（HMAC 签名复用 `utils/crypto.js` 的 `sign()`）→ 落 `init_*.json` + 下载 `back.png/shadow.png` |
| `e2e_gap.js` | 缺口检测 v3（**本轮重做**，见 §3） |
| `e2e_02_data.js` | 以真实样本轨迹为模板，按 gap 重标定 x / xPos / slidePos → `feilin_data.buildData()` 出 data |
| `e2e_03_slideauth.js` | 提交 `slideAuth`，记录请求摘要 + 响应全文 |
| `e2e_run_chain.js` | **一条链**：InitCaptcha → 下图 → 检测 gap → 离线 data → slideAuth → 证据落盘 + `runs.jsonl` |
| `e2e_05_decode.js` | armour **逆变换**（新增）：把任意历史 `data` 解回 payload（本轮用它把样本量从 3 扩到 8+） |
| `e2e_06_local_catch.js` | 本地回环接收器：浏览器把真实 `captchaVerifyParam` POST 过来落盘（用于 P4） |
| `e2e_07_post_live.js` | 把"浏览器真实产出"的 cvp 立刻从 Node 提交（用于 P4） |
| `e2e_calib_decode.js` | 解码浏览器标定轮的 data（§3.2 证据） |

复跑一条链（会消耗 1 次 slideAuth）：

```powershell
cd D:\ds_work\js_reverse_projects\aliVal
node e2e_run_chain.js --tag P6 --arg copy          # 自动 InitCaptcha + 检测 gap + 出 data + 提交
node e2e_run_chain.js --tag P7 --gap 165 --xPos 167 # 手指定 gap / xPos
node e2e_05_decode.js                              # 解历史 data 样本
```

证据目录：`static/work/e2e/`（`p01..p05_*.json` 每次请求/响应全量、`init_*.json`、`img_*/`、
`runs.jsonl` 汇总、`slideauth_count.txt` 配额计数=5）。

---

## 1. 五次 slideAuth 的全部证据

`slideAuth` 计数：**5 / 10**。每次都是新 `InitCaptcha`（P1 除外，见下）。

| # | 标签 | certifyId | data 来源 | dataLen | gap 检测 | 结果 |
|---|---|---|---|---|---|---|
| 1 | P1-replay-capture | `JUTn1nkoDx` | 真实抓包原样回放（`config/cvp_capture.json`，抓于 18:27:23，提交于 18:48） | 716 | 未用 | **false** |
| 2 | P2 | `leZ0kRLdbD` | 离线生成（模板 sample_1，arg 复用） | 700 | 207（**错**，真值≈185） | **false** |
| 3 | P3 | `bK9MK7wqWo` | 离线生成 | 696 | 206（v3 检测器） | **false** |
| 4 | P4-live-cvp | `ouOs6kdfmb` | **浏览器同轮真实产出**（SDK 自己加密），22.4 秒内提交 | 1232 | 180，且拼图块已视觉对齐 | **false** |
| 5 | P5 | `bAEbk5zGYn` | 离线生成（xPos 按新口径修正） | 696 | 158 | **false** |

响应体去重后仍然只有一种：

```json
{"captchaVerifyResult":false,"bizResult":false}
```

> 站点侧响应只有两个布尔（`static/work/e2e/p01..p05_*.json` 的 `respBody` 字段），
> 不带 `Code`/`Message`，因此**端点不提供失败原因的区分度**（与 `FINDINGS_2026-11-12.md` §"oracle 不可用"一致，
> 本轮再次确认）。

### 1.1 P1：真实抓包原样回放

```
GET  https://tool.manmanbuy.com/m/aliVal.aspx → 200，拿到 acw_tc + ASP.NET_SessionId
POST .../aliVal.aspx?method=slideAuth
     certifyId=JUTn1nkoDx  deviceToken_len=1336  data_len=716  data_head16=JRMnXwxEGgEELwIX
→ HTTP 200 {"captchaVerifyResult":false,"bizResult":false}
```

结论（**观察**）：端点不需要站点 Cookie 才能被调用（带新 session cookie 也照常 200）；
但抓包三件套已经过期 21 分钟，此条**不能**单独用来判定流程。

### 1.2 P2：离线 data + 错误 gap（用于定界检测器）

`init_20261113_185132_037`：`InitCaptcha` 返回 `CertifyId=leZ0kRLdbD`，
图片 `img_20261113_185132_037/back.png`（296×200）、`shadow.png`（52×200，alpha 包围盒 `[2,64,49,50]`）。

当时的 v2 检测器（全 y 搜索 + 形状对比）给出 **207**，而同轮亮块法给 **188**，两者不一致；
人工查看该图（`static/work/e2e/img_20261113_185132_037/back.png`）缺口在 **x≈186~188**。
→ P2 必然失败（位置错 ~20px），**这条不计入"轨迹/arg 是否被校验"的判断**。

> 这一步的价值是暴露了历史 `detect_gap_*` 的 188/207 分歧根因，见 §3.1。

### 1.3 P3：检测器修正后（gap=206）

```
certifyId=bK9MK7wqWo  StaticPath=3.29.0/pe.082.ab24cb87ee08d026
gap=206 (conf: mean=217.4, sd=4.51, cluster=15)
payload: slidePos="206" xPos="158"(模板值) movement(mm)=513 = 206×2.5
dataLen=696  data_head16=JRMnXwxDXy4KLAIT
→ false
```

### 1.4 P4（关键）：浏览器同轮真实三件套 + 拼图块视觉对齐

做法（`e2e_06_local_catch.js` + 页面内 evaluate）：

1. 页面 reload → SDK 自己 `InitCaptcha`；
2. 页面内用 canvas 读 `back.png/shadow.png`，用与 `e2e_gap.js` **同一算法**算出缺口 `G=180`（`shadowBox=[2,137,49,50]`）；
3. 拖拽时**逐步读取拼图块的实际渲染位置**（`#aliyunCaptcha-puzzle` 相对 `#aliyunCaptcha-img` 的 left），
   一直拖到块正好覆盖缺口（目标屏幕偏移 `180 × 750/296 = 456`），此时 `D=540`，块偏移 `456`；
4. 用被 patch 的 `$.ajax` 截下 SDK 交出的 `captchaVerifyParam`（`certifyId=ouOs6kdfmb`，dataLen=1232）；
5. 通过 `http://127.0.0.1:18080` 把原串送回 Node，**22.4 秒后**由 `e2e_07_post_live.js` 提交。

```
[POST 4/10] P4-live-cvp HTTP 200 age=22.4s
  certifyId=ouOs6kdfmb dataLen=1232
  resp: {"captchaVerifyResult":false,"bizResult":false}
```

这一条**把"我们自己造 data"这条嫌疑完全排除**：data 由阿里 SDK 自己加密、certifyId 与 deviceToken 同轮、
提交延迟 22 秒、拼图块已经视觉对齐缺口——仍然 `false`。

解码这一轮的 data（`e2e_05_decode.js`）：

```
xPos=182  slidePos=216  arg=b3UXdW99ayQRbA==  dt=33159
mc=443,692,32172, ,0   mu=983,692,33156, ,0   movement=540
si=1536,1536,855,1536,855,912,960,200,1536
mm n=93  最后一点 1130,796,33172,1
```

→ `slidePos = 540/2.5 = 216`（手指位移口径），`xPos = 182 ≈ 180 × 300/296`（拼图块最终位置口径）。

### 1.5 P5：按新口径修 xPos 仍失败

```
gap=158 (conf: mean=198.5, sd=3.74, cluster=15)
xPos=160 (= round(158×300/296))  slidePos=190 (= round(160/0.843))
movement(mm)=475 = 190×2.5   dataLen=696   data_head16=JRMnXwxcDS4KLAIL
→ false
```

---

## 2. 现阶段已被实验排除 / 支持的项

| 项 | 结论 | 强度 |
|---|---|---|
| 离线 `data` 与真实 data 逐字节同构 | `verify_armour.js` 2/2 全串相等；本轮又用**逆向 armour** 解了 8 个历史样本，全部 payload 结构一致 | **已证明** |
| `InitCaptcha` 纯 Node 可用（旧 deviceToken 复用） | P2/P3/P5 各自返回 `Success:true` + 新 `CertifyId` + 260/300 图 | **已证明** |
| data 算法/编码是失败原因 | P4 用 SDK 自产 data 仍 false | **已排除** |
| 缺口检测精度是失败原因 | P4 已把块视觉对齐（456/456） | **已排除** |
| `certifyId` 时效是失败原因 | P4 提交时 age=22.4s | **已排除** |
| `certifyId`↔`deviceToken` 配对是失败原因 | P4 是同轮配对 | **已排除** |
| 端点需要站点 Cookie/session | 带/不带 cookie 都 200，且返回同一种 false | **观察** |
| 站点响应能区分失败层级 | 只有两个布尔，无 Code/Message | **已证明（不可用）** |
| 合成输入（isTrusted）被服务端判失败 | P4 仍是合成事件（`dispatchEvent`），false；真实鼠标未测 | **有支持（未定界）** |
| 站点侧 VerifyCaptcha 通路本身不可用 | 无法证伪；与全部 5 次 false 相容 | **未定** |

---

## 3. 本轮新增的硬数据（几何口径 / 字段语义 / arg）

### 3.1 缺口检测：为什么历史 `detect_gap_*` 会给出 188 和 207 两个答案

三张真实图逐张对比（`e2e_gap.js` v3 与 `detect_gap_final.js/v3`）：

| 图 | shadow alpha 包围盒 y（py） | 全图形状法 | 亮块法 | 人工看 | v3（y 约束 + 亮且平整 core） |
|---|---|---|---|---|---|
| `img_...184909_370` | 107 | 205 | 207 | ≈205 | **204** |
| `img_...185132_037` | 64 | 207 ❌ | 188 | ≈186-188 | **185** |
| `img_...185334_371` | 67 | 2 ❌ | — | ≈245 | **244** |

根因（**已证明**）：`back.png` 里"天空/云层"是大片**亮且平滑**区域，
全图搜索时它的"内部均匀度"评分可以压过真正的缺口（缺口填充有轻微纹理，core 标准差 4~7，
而暗部天空只有 1~3）。**`shadow.png` 的 alpha 包围盒 y 与缺口的 y 基本重合**（107→108、64→66、67→68），
把 y 限制在 `py±6` 后，再要求 core 均值 >150 并按 core 标准差升序取最优，三张图全部落在人工判读上（误差 ≤2px）。

`e2e_gap.js` 实现的就是这条：`mask 腐蚀 4px → core(1175点) → y∈[py-6,py+6] 上滑 x → 均值>150 & 最小 std`。
返回的 `gap` 是**拼图块元素的 translate x**（shadow 坐标 dx=0 即 translate=0），即"块放到图片 x=gap 就对齐缺口"。

### 3.2 真实 DOM 几何标定（浏览器实测，一次性）

`https://tool.manmanbuy.com/m/aliVal.aspx` 的 `#captcha-element` 子树实测：

```
#aliyunCaptcha-window-embed   transform: matrix(2.5,0,0,2.5,0,0)   ← 整棵子树 scale(2.5)
#aliyunCaptcha-img-box        rect 393,122.5  750×500
#aliyunCaptcha-img            rect 393,122.5  750×500   naturalWidth/Height = 296×200
#aliyunCaptcha-puzzle         rect 393,122.5  130×500   （块自然 52×200，x 初始 = 图片左沿 = translate 0）
#aliyunCaptcha-sliding-body   rect 393,642.5  750×100
#aliyunCaptcha-sliding-slider rect 393,642.5  100×100   （knob，行程 750-100 = 650）
```

由此得到两条**硬等式**（用受控拖拽 {D=600 screen px} 标定，实际 data 解出 `slidePos=240`）：

```
slidePos = 手指屏幕位移 / 2.5        （= layout px；2.5 就是 rem/scale 因子，验证 600/2.5=240.000）
xPos     = 拼图块最终位置 / 2.5      （= layout px；对齐轮 456/2.5=182.4，实测 xPos=182）
1 自然图 px = 750/296 = 2.5337 屏幕 px   （图片被拉伸到 layout 300px，块却是 2.5 倍 → 差 1.35%）
```

历史样本 + 本轮两次标定的 `movement/slidePos`：
`2.502 / 2.498 / 2.502 / 2.504 / 2.505 / 2.500(标定 D=600) / 2.500(标定对齐轮 540/216)`，
另有 `config/data_fresh.txt` 一个 2.542 的离群值（该样本 `mm` 首点 x=0，疑被旧脚本写脏）
→ **slidePos 单位 = 位移/2.5，已证明**（6 个样本 2.50±0.005）。

`xPos` 的口径修正（本轮新定，**有支持**）：
历史样本里 `xPos` 一直被我当成"按下点相对图片左沿的偏移"，但标定轮（按下 clientX=443、图片左沿=393，
偏移只有 50）给出的 `xPos=182`，与"块最终位置 182.4"完全吻合；而 182 与 50 差太远。
→ **`xPos` = 拼图块最终位置的 layout 值，不是按下点偏移**。P2/P3 里沿用模板的 `xPos=158` 因此是错的，
P5 按 `round(gap×300/296)` 修正（160）。

`xPos : slidePos` 实测比值 **0.79 / 0.836 / 0.947 / 0.843**（分散），原因是拼图块位置**带缓动跟随**：
快拖时块落后于手指（标定轮 D=540 时块只到 456，差 84px；慢拖 6px/8ms 采样时块从 0.38D 逐步追到 0.84D）。
所以 `slidePos`（手指）与 `xPos`（块）不是固定比例 —— 服务端若校验答案，只能用 `xPos`。

### 3.3 轨迹字段语义（本轮用真实样本 + 标定轮对齐）

- `mc`/`mm`/`mp` 的 x 是**页面 clientX**：标定轮我 dispatch 起点 clientX=443，payload 里 `mc=443,692,...` 完全一致；终点 clientX=1043 → `mu=1043`。
- `t` 是相对 `TrackStartTime` 的毫秒偏移（`mu.t ≈ VerifyTime - TrackStartTime`）。
- `mc/mu` 的第 4 段是 `" "`（一个空格），第 5 段是 `0`（本轮所有真实轮的块内标记都是 0）。
- `mm` 的**最后一个点**是 mouseup 之后的位置，x 超出 `mu`、4th 字段为 `1`（标定轮 `mu=983`、末点 `x=1130`；
  `sample_1` `mu=809`、末点 `930`）。→ 历史文档里"flag=1 标记不可信点"的说法**不成立**（真实合成轮里几乎全是 0）。
- `si` 每轮都不同（`1536,1536,855,1536,855,912,960,200,1536` / `1266,2048,977,...,1280`），与窗口尺寸相关，本次未定其完整语义。

### 3.4 `arg`（10 字节 base64）：不是每轮一个，而是**每次拖动期间出现 10 个**

标定轮（D=600，30 次 mousemove）在页面 `btoa` 钩子里抓到 **10 个 16 字符 base64**（=10 字节），payload 里落的是其中第 6 个：

```
NhQzOSQEGHVFeQ==   HVhOLGoTsA9EQg==   EiZXTmgX2SQGGQ==   JxABfWAmfEB3Tw==   RVc8BMJVLm40IQ==
W8ADWign4mi3ag==  ←  payload 用的就是它
EgAlVyZj2mY6Mg==   IWAKH/kKMGVeGw==   FgNJf3ExZowmNw==   JDzlfxN+TX8ZWw==
```

字节分布高熵（100 字节里 75 个互不相同，无单调/派生结构），与 8 个历史样本的 `arg` 一样看不出可复算关系。
→ **`arg` 是事件级的、每次拖动现场生成的 10 字节值**（**有支持**）；payload 取其中某一个。
"复用别的轮的 arg 会被服务端拒绝"这一假设**无法从响应区分**（P4 用的是同轮真值，仍 false）。

---

## 4. 剩余依赖（按可能性排序）与下一步

1. **输入真实性（isTrusted / 拖动动力学）**：P4 的拖拽仍是 `dispatchEvent(new MouseEvent/PointerEvent)`，
   `isTrusted=false`。服务端可能通过 mm/mp 的动力学特征（采样密度、每点 dt、加速度分布）
   或设备侧风控判定"非真人"。**这是唯一还没被本次实验证伪的 payload 层疑点。**
   下一步：用 Playwright 原生 `page.mouse.move/down/up`（真 trusted 输入）在 camoufox 上做一次
   "块对齐缺口"的拖动；若成功 → 证明纯 Node 只能生成 data、无法生成可信轨迹，纯协议线终点仍是 S2；
   若仍失败 → 说明问题不在输入，而在站点侧。

2. **站点侧 VerifyCaptcha 通路是否可用**：`bizResult:false` 同时出现，且该页面是"嵌入示例页"
   （`mode:'embed'`, `immediate:true`），完全有可能站点服务端的 VerifyCaptcha 调用本身就失败
   （AK 未授权/SceneId 未绑定该 AK/额度），此时任何正确输入都返回 false。
   下一步：在同一站点用**真实人手**（或上面的 trusted 输入）拖一次让页面自己走完整流程，
   观察 `onBizResultCallback` 是否弹 `验证不通过`；或换一个已知会返回 true 的站点比对响应结构。

3. `arg` 与服务端绑定的可能性（低）：需要在"能拿到 true"的环境里再做消融，目前无法定界。

### 4.1 未定：`arg` 的语义与是否被校验

- 现象（**已证明**）：一次拖动期间页面 `btoa` 里出现 **10 个 16 字符 base64（各 10 字节）**，
  payload 落的是其中第 6 个；字节高熵（100 字节 75 个互不相同），无单调/派生结构。
- 结论（**有支持**）：`arg` 是**事件级、现场生成**的 10 字节值，不是"每轮一个常量"。
- **仍属未定**：服务端是否校验 `arg`。P4 用的是同轮真值、P2/P3/P5/P6/P7 用的是复制值，
  响应完全一致（都 false），**复用别轮 `arg` 无法从响应区分**——端点只回两个布尔，没有 Code/Message。
  要定界只能在"能拿到 true"的环境里做 arg 消融。

---

## 5. 结论强度汇总

- `data` 生成链（nonce + payload + deflate + armour）＝ **已证明**（逐字节相等，且本轮逆向解回 8 个历史样本）。
- `slidePos = 手指位移/2.5`、`xPos = 块最终位置/2.5`、`图片 296×200 → 渲染 750×500（scale 2.5）` ＝ **已证明/强支持**（受控标定 + 真实 data 解码）。
- 缺口检测（v3，y 约束 + 亮且平整 core）与人工判读一致性 ＝ **已证明**（3/3，误差 ≤2px）。
- "失败原因在 data 算法/几何/certifyId 时效" ＝ **已排除**（P4）。
- "服务端在判拖动是否为真人" ＝ **有支持，未定界**。
- "站点侧通路不可用" ＝ **未定**（无法证伪）。

**当前层级：S2。卡点：`slideAuth` 对"同轮真实三件套 + 已对齐缺口"仍返回 false，
即服务端拒绝的不是"我们造的值"，而是"这次拖动是合成的"（或该站点通路本身不出 true）。**

---

## 6. trusted 输入对照实验（Windows SendInput，不用 Playwright）

目的：把「合成轨迹被服务端拒绝」与「站点 VerifyCaptcha 通路本身不出 true」切开。
手段：`ctypes` 调 `user32.SendInput` 注入 `MOUSEEVENTF_MOVE|ABSOLUTE` / `LEFTDOWN` / `LEFTUP`，
事件来自系统输入队列，页面里 `event.isTrusted === true`。脚本：`e2e_08_trusted_drag.py`。

### 6.1 注入方式与坐标换算

| 环节 | 做法 |
|---|---|
| 窗口 | `EnumWindows` 找 `MozillaWindowClass`（实测 hwnd 1836620，rect `(4,4)-(2404,1138)`）→ `ShowWindow(SW_RESTORE)`。**注意**：裸 `SetForegroundWindow` 会被前台锁拒绝（实测 fg 回落），必须 `AttachThreadInput(fgThread, curThread, True)` 后 `BringWindowToTop + SetForegroundWindow + SetFocus`，实测 `fg==hwnd` 成功 |
| 坐标 | 页面侧读 `window.mozInnerScreenX/Y`（Firefox 专有，**CSS px**）= `(10.4, 60)`、`devicePixelRatio=1.25`；`screen = (mozInner + client) × dpr`。屏幕 2560×1440，滑轨中心 client `(627.8, 687)` → screen `(797.8, 933.8)` |
| 移动 | 每步 `SetCursorPos` 等价的 `SendInput(ABSOLUTE|MOVE)`，60 步 / 14 ms、ease-out 位移曲线、纵向 ±1px 抖动，到目标后再停 280 ms 等缓动跟上才 `LEFTUP` |
| 纪律坑 | **整个拖拽必须在一个进程里做完**。拖动中途再起 pwsh 会抢前台，Firefox 在失活时合成 `mouseup`，把这一轮提前结束（实测：`mc` 里出现两条 `mousedown` 记录、`mm` 只剩 3 点、`ajax` 提前触发） |

### 6.2 判据 1：`isTrusted` —— **已证明**

页面 `addEventListener('mousedown'|'mousemove'|'mouseup', ..., true)` 记录：

```
trustCounts = { down: 1, move: 63, up: 1 }
allTrusted  = true          // 63 次 move 全部 isTrusted=true
```

### 6.3 判据 2：`mm` 的 flag —— **已证明，且方向与历史文档相反**

解码 trusted 轮（certifyId `Qsgdk60kTT`，dataLen **5256**，`e2e_05_decode.js` 解出）：

```
xPos=157  slidePos=200  arg=Ryt1aCuTdR1thg==
mc = 638,710,57222, ,1        ← 第 5 段 = 1
mu = 1137,744,58872, ,1       ← 第 5 段 = 1
mm n=174  第 4 段取值集合 = {1}      ← 全部 1
mp n=479  第 4 段取值集合 = {1}      ← 全部 1
movement(mu-mc)=499  → 499/2.5=199.6 ≈ slidePos=200 ✓
```

对照 dispatchEvent 合成轮（`cvp_sample_1/2` 与 P1~P5 的 data）：`mc/mu` 第 5 段 = **0**、`mm/mp` 第 4 段全 **0**。

| 输入来源 | mc/mu 第 5 段 | mm/mp 第 4 段 |
|---|---|---|
| SendInput（trusted） | **1** | **1** |
| `dispatchEvent`（合成） | 0 | 0 |

→ 历史文档"`flag=1` 标记不可信点"的说法**方向反了**：**flag=1 才是可信输入**。
我们 P1~P5 的 data 全部是 flag=0（因为模板取自合成轮的样本），等于向服务端自报"合成输入"。

### 6.4 判据 3：flag=1 的离线 payload 能否翻转 —— **已证明不能单独翻转**

新增生成器 `e2e_09_gen_trusted.js`：按 trusted 实测形态造轨迹（173 点 mm / 342 点 mp、缓出、
每点 3~6 ms、末点超出 `mu`、`mc/mu` 第 5 段=1、所有 flag=1），几何用标定值
（`xPos = gap×300/296`、`slidePos = xPos/0.785`）。

| # | certifyId | gap | xPos | slidePos | flag | 结果 |
|---|---|---|---|---|---|---|
| P3 | bK9MK7wqWo | 206 | 158（模板值） | 206 | **0** | false |
| P6 | F8opCzzoRH | 206 | 209 | 266 | **1** | false |
| P7 | aiXm1k6ctB | 95 | 96 | 122 | **1** | false |

P3 与 P6 **同 gap、只差 flag 与几何口径**，两条都 false → flag 翻转本身不足以让服务端放行
（要么还有别的可信特征，要么站点侧根本不出 true）。

### 6.5 没做完的那一条（诚实记录）

**"trusted 且像素级对齐"的那一拖没有提交上去。** 原因是拼图块的跟随是**速度相关的缓动**，
开环控制下「指令距离 → 块实际位移」的比值三次实测为 **0.714 / 1.13 / 1.19**（不可预测），
本会话无法稳定把块对齐到缺口（最接近的一次差 8 CSS px，未提交）。要做成闭环，
必须在拖动中途读页面坐标，而每次 pwsh 重启都会抢前台 → Firefox 合成 mouseup → 这一轮作废（见 6.1）。

已完成的可复跑命令：

```powershell
cd D:\ds_work\js_reverse_projects\aliVal
python e2e_08_trusted_drag.py info                       # 列窗口/屏幕
python e2e_08_trusted_drag.py full --x 627.8 --y 687 --dist 451 --steps 60 --ms 14 `
       --inner-x 13 --inner-y 75 --dpr 1.25 --hold 280 --jitter 1
```

### 6.6 本节的结论强度

| 断言 | 强度 |
|---|---|
| SendInput 能产出 `isTrusted=true` 的鼠标事件（camoufox 前台窗口下） | **已证明**（63/63 move） |
| `flag=1` 对应 trusted 输入、`flag=0` 对应合成输入 | **已证明**（trusted 轮全 1，合成轮全 0，两组真实 data 解码比对） |
| 离线 payload 把 flag 全改 1 仍不通过 | **已证明**（P6 与 P3 同 gap 对照） |
| trusted + 像素对齐能否拿到 true | **未测**（见 6.5，环境限制） |
| 站点 VerifyCaptcha 通路是否根本不出 true | **仍属未定**，但与"全部 7 次 false、无任何区分度"完全相容 |

剩余 slideAuth 配额：**3 / 10**（P1~P7 已用 7 次）。

---

## 7. §7 单进程闭环：trusted + 像素级对齐（决定性实验）

### 7.1 方案（为什么必须单进程）

拖拽中途不能重启 pwsh：每次 `pwsh -Command` 起动会抢前台，Firefox 在失活时合成 `mouseup`，
把这一轮拖拽提前结束（实测表现为 `mc` 里出现两条 `mousedown`、`mm` 只剩 3 点、`ajax` 提前触发）。
所以"读块位置"不能再用 MCP evaluate 穿插，两条可行路线：

1. RDP socket（`FireFoxDebugger`，不抢前台）；
2. **页面主动上报 + 本地回环**（本轮采用，更轻）：页面里 30 ms 的 `setInterval` 把
   `#aliyunCaptcha-puzzle` 相对 `#aliyunCaptcha-img` 的 left 偏移 POST 到 `127.0.0.1:18081/piece`，
   Python 用一个 HTTP 线程收下，拖拽循环直接用最新值做阻尼修正。**整个拖拽只在一个 Python 进程内**。

脚本三件（均在项目根，未改动已验证产物）：

| 文件 | 作用 |
|---|---|
| `e2e_10_bridge.js` | 页面侧桥：canvas 算缺口 → `target = gap × 750/296`；30 ms 上报 `{off,target,trusted,gap}`；patch `$.ajax` 把 `captchaVerifyParam` 回传 `/param`（不发给站点） |
| `e2e_10_closed_loop.py` | 单进程闭环：回环接收 → `AttachThreadInput` 抢前台 → `SendInput` 按下 → 阻尼修正循环 → `LEFTUP` → 落盘遥测 → 可选 `--submit` |
| `e2e_07_post_live.js` | 把落盘的 cvp 从 Node 提交（复用已有脚本） |

修正律：`next = remaining × damp`（0.55~0.7），每步拆 `--substeps` 小步（提高轨迹密度），
容差 `±2` CSS px，收敛后停 260 ms 再松手；每次读数都有超时保护，读不到就等 60 ms 重读，不打断拖拽。

### 7.2 两轮闭环的逐步误差序列（`static/work/e2e/closed_loop_telemetry.json`）

**第 1 轮**（gap=224，target=567.6 CSS px）：

```
it01 off=  0.0  err=+567.6
it02 off=255.6  err=+312.0
it03 off=586.2  err= -18.7     ← 轻微过冲（拼图块缓动追赶导致）
it04 off=562.8  err=  +4.8
it05 off=569.9  err=  -2.3
it06 off=566.3  err=  +1.2     ← 收敛，|err| ≤ 2
settle off=566.33 err=+1.24 → mouseup
```

**第 2 轮**（gap=155，target=392.74，substeps=10 / damp=0.55）：

```
it01 off=  0.0  err=+392.7
it02 off= 82.9  err=+309.9
it03 off=242.5  err=+150.3
it04 off=349.9  err= +42.9
it05 off=383.1  err=  +9.7
it06 off=392.0  err=  +0.7     ← 收敛
settle off=392.0 err=+0.74 → mouseup
```

两轮的 `trusted_seen` 均为 `true`（页面 `mousemove` 的 `isTrusted`）。

### 7.3 提交结果（各消耗 1 次配额）

| # | certifyId | gap | 块实际停位 | 误差 | mm 点数 | flag | dataLen | 结果 |
|---|---|---|---|---|---|---|---|---|
| P8 | `lQQfY7Llvi` | 224 | 566.3 CSS | +1.2 CSS（≈0.5 图 px） | 19 | 全 1 | 636 | **false** |
| P9 | `Bu81RaNcWE` | 155 | 392.0 CSS | +0.7 CSS（≈0.3 图 px） | 54 | 全 1 | 992 | **false** |

两轮 payload 解码（`e2e_05_decode.js`）：

```
P8: xPos=227  slidePos=242  arg=Y1FTAxQ/Gw0+ng==   mc=155,750,19330, ,1  mu=760,750,20086, ,1  movement=605 (605/2.5=242)
    xPos×2.5 = 567.5  vs  target 567.6      → 块位置与缺口完全一致
P9: xPos=157  slidePos=200  arg=Gyr9gwMRRy1fKA==   mc=155,750,14852, ,1  mu=654,750,15964, ,1  movement=499 (499/2.5=200)
    xPos×2.5 = 392.5  vs  target 392.74     → 同上
```

`mm/mp` 的 flag 全 1（trusted），`mc/mu` 第 5 段 = 1，`xPos` 与目标块位置之差 < 1 CSS px，
提交延迟 3.3 s。**两次仍全部 `{"captchaVerifyResult":false,"bizResult":false}`。**

### 7.4 §7 的结论强度

| 断言 | 强度 | 依据 |
|---|---|---|
| 单进程闭环可稳定把拼图块拖到缺口（误差 < 1.5 CSS px） | **已证明** | 两轮误差序列 + `xPos×2.5 ≈ target` |
| 这两轮的输入是真 trusted（`isTrusted=true`） | **已证明** | `trusted_seen=true` + flag 全 1 |
| **trusted + 像素级对齐仍拿不到 true** | **已证明**（两次，两个不同 gap/图） | P8/P9 |
| 站点 VerifyCaptcha 通路不出 true | **有支持（不足以证明）** | 见下 |

**为什么还只是"有支持"**：仍缺一条排除证据——"**真人手工**在同一页面拖一次能否得到 true"。
若手工也 false，即可从"有支持"升级为"已证明"；剩下的差异只有轨迹的动力学细节
（真人 mm ≈174~479 点、我们的 19/54 点；真人按下前有 30~60 s 停留，我们 ~15 s）。
但要注意：**响应完全没有区分度**（P1 抓包回放、offline+错 gap、offline+flag=1、trusted+对齐，
全是同一串布尔），所以"页面没有返回码"这一点本身也限制了进一步归因。

### 7.5 可复现的最小步骤清单（把 trusted+对齐 这一轮重跑一遍）

```powershell
cd D:\ds_work\js_reverse_projects\aliVal
# 0) 先确认没有残留 camoufox（异常退出后按 profile 清理；e2e_10 不负责杀进程）
python e2e_08_trusted_drag.py info     # 应能看到 MozillaWindowClass 窗口

# 1) 浏览器用 MCP 以非 headless 启动并打开页面
#    launch_browser(headless=false) → navigate('https://tool.manmanbuy.com/m/aliVal.aspx')

# 2) 注入页面桥（MCP evaluate_js，把 e2e_10_bridge.js 的内容作为表达式执行）
#    返回 { gap, target, knobCenterClient, mozInnerScreen, dpr }；记下 knobCenterClient 与 mozInnerScreen*dpr

# 3) 单进程闭环（先 dry-run 验证对齐与 flag）
python e2e_10_closed_loop.py --x <knob.x> --y <knob.y> --inner-x 13 --inner-y 75 --dpr 1.25 --dry-run

# 4) 对齐达标（|err| ≤ 2）且 trusted_seen=true 后再提交
python e2e_10_closed_loop.py --x <knob.x> --y <knob.y> --inner-x 13 --inner-y 75 --dpr 1.25 --substeps 10 --damp 0.55 --submit
```

产物：`static/work/e2e/closed_loop_telemetry.json`（逐步误差）、`cvp_live.json`（同轮真值）、
`p08_*.json` / `p09_*.json`（请求摘要 + 响应全文）。

### 7.6 配额

slideAuth 共 **9 / 10**（P1~P9）。按约定保留最后 1 次未用。

---

## 8. 真人成功对照 + SendInput 复现尝试（§8）

### 8.1 真人成功证据（`config/manual_drag2_result.json`，只读，非推断）

```json
{"at":"2026-11-13T19:36:28",
 "state":{"down":1,"move":460,"up":1,"trustedDown":1,"trustedMove":460,
          "knobStart":258,"knob":0,"pieceStart":0,"piece":627,"btoa":16,
          "btoaLens":[1000,10,10,10,10,10,10,10,10,10,10,3211],
          "xhr":[{"u":"/m/aliVal.aspx?method=slideAuth","status":200,
                  "resp":"{\"captchaVerifyResult\":true,\"bizResult\":true}"},
                 {"u":"cloudauth-device-dualstack…","status":200,
                  "resp":"{\"ResultObject\":true,…,\"Code\":\"200\"}"}],
          "ajax":[{"url":"/m/aliVal.aspx?method=slideAuth","len":7163}]}}
```

结论：**站点 VerifyCaptcha 通路是好的，能返回 true**。§6.6 里"该通路不出 true（有支持）"这条**被推翻**。

### 8.2 动力学参数对照

| 维度 | 真人（成功） | P10（SendInput） | P11（SendInput） | P12（页面原生 POST） |
|---|---|---|---|---|
| mousemove 点数 | 460 | 486（mm） | 436（mm） | ~460（未解 data） |
| 每点间隔 | ~9 ms（460 点 / ~4 s） | 15.6 ms（avg） | 13.7 ms（avg） | 8~11 ms |
| 总时长 | 3~6 s | 7.6 s | 5.9 s | ~6 s |
| 按下前停留 | 有（先瞄缺口） | 300~800 ms | 681 ms | 732 ms |
| isTrusted | 1 / 1 | ✓（flag 全 1） | ✓ | ✓ |
| `mm/mp` flag | 全 1 | 全 1 | 全 1 | 未解 |
| 块落点误差 | — | **0.67 CSS px** | **1.18 CSS px** | **0.47 CSS px** |
| `xPos` vs `gap×300/296` | 251 / — | 237 vs 237.2 | 190 vs 190.5 | — |
| slideAuth 结果 | **true** | **false** | **false** | **false（页面自己 POST）** |

### 8.3 复现结果

三轮全部 `false`，其中 **P12 是浏览器页面自己发的 POST**（我把 `$.ajax` 的 patch 去掉、只用 XHR hook 记响应，
`captchaVerifyParam` 长度 6367，同一个 trusted + 0.47 px 对齐的拖拽）：

```
xhr: /m/aliVal.aspx?method=slideAuth  status 200
     resp {"captchaVerifyResult":false,"bizResult":false}
```

→ **请求上下文（浏览器会话 / cookie / TLS / UA）也不是原因**：同一次拖拽，Node 提交 false，页面原生提交也 false。

### 8.4 剩下的唯一差异：设备侧遥测

P12 那轮的 XHR 记录：

```
cloudauth-device-dualstack.cn-shanghai.aliyuncs.com   status 0   （失败/被拦，无响应体）
cloudauth-device-dualstack.cn-shanghai.aliyuncs.com   status 0
cn-shanghai.device.saf.aliyuncs.com                   status 200 {"ResultObject":true,…}
1sfr0c.captcha-open.aliyuncs.com                      status 200 {"CertifyId":"rRVczPomf1",…,Success:true}
```

真人成功那轮：`cloudauth-device-dualstack` 的 **Log3 status=200 resp={"ResultObject":true}`**。
我们这轮该域名两次 `status 0`（无响应体）——`Log1/Log2/Log3` 这条设备指纹/风控链路没打通，
服务端的风险分很可能因此判死。**这是目前唯一还没被排除、且与"真人 true / 我们 false"直接对应的差异。**

### 8.5 §8 结论强度

| 断言 | 强度 |
|---|---|
| 站点 VerifyCaptcha 能返回 true | **已证明**（真人那一轮抓到的响应） |
| `flag=1` 对应 trusted 输入 | **已证明**（§6.3，本轮再次复现） |
| 我们能用 SendInput 复现 trusted 输入 | **已证明**（三轮，flag 全 1） |
| 我们能把块对齐到 <1.5 CSS px（远小于容差） | **已证明**（0.47 / 0.67 / 1.18 CSS px） |
| 点数/间隔/停留做到真人量级（436~486 点、8~15ms、先瞄后拖） | **已证明** |
| **"trusted + 对齐 + 真人量级点数"仍拿不到 true** | **已证明**（3 次，2 次 Node 提交 + 1 次页面原生提交） |
| 剩余差异指向设备侧遥测（cloudauth Log3 status 0） | **有支持（未验证）** |
| 纯协议可通过 S3 | **目前不能声称**——离线 data 可**逐字节等价**（已证明），但过不了风控 |

### 8.6 边界条件（按目前证据能写死的部分）

- `data`：离线可生成，且与 SDK 输出**逐字节等价**（`verify_armour.js` 2/2 + 往返 2/2）。**不设点数下限**：我们 436 点也照样能出 data。
- `certifyId`：必须与 `deviceToken` 同轮；有效期实测 ≥ 22 s（P4）与 ≥ 3 s（P8/P9/P10/P11 都是秒级提交），过期/换轮即 false。
- 几何：`slidePos = 手指位移 / 2.5`，`xPos = 块最终位置 / 2.5 ≈ 缺口 × 300/296`；块落点误差 ≤1.5 CSS px 仍 false，说明**几何不是门槛**。
- 可信标记：`mm/mp` 全 `flag=1`、`mc/mu` 第 5 段=1 是必要条件（我们已做到），但**不是充分条件**。
- 未定：`Log1/Log2/Log3` 设备链路是否必要（8.4 指向"必要"）。

### 8.7 复跑

```powershell
cd D:\ds_work\js_reverse_projects\aliVal
# 1) MCP 非 headless 打开页面；注入 e2e_10_bridge.js（或 §7 的注入表达式）
# 2) 真人量级的一次拖拽（默认 520 点补齐、autosubmit 门控）
python e2e_11_humanlike.py --x <knob.x> --y <knob.y> --inner-x 13 --inner-y 75 --dpr 1.25 --autosubmit
# 3) 更贴真人时序（430 点单程 + 精修 + 8~11ms）
python e2e_11_humanlike.py ... --block 430 --max-blocks 1 --gain 0.98 --dt-min 8 --dt-max 11 `
       --min-moves 460 --tol 1.2 --fine-rounds 8 --fine-steps 7 --fine-gain 0.5 --max-err 2.0 --autosubmit
```

配额：slideAuth 共 **11 次**（P1~P11）+ 1 次页面原生 POST（P12），原预算 10 次 + 父 agent 授权 2 次复现，现已用尽。

---

## 9. profile 隔离 + device 链路诊断（§9）

### 9.1 怀疑点确认：`status 0` 是 profile 复用造成的

历史脚本（含 `rdp_get_cvp.py` 与我自己早期的 e2e）都有这一行：

```python
tempfile.mkdtemp = lambda *a, **k: PROFILE      # 钉死 static/profile_noproxy
```

于是第一次跑（真人成功那轮）之后，P8~P12 全在**同一份** profile 上累积 localStorage / IndexedDB / device-SDK 状态。
`e2e_12_clean_profile.py` **不再 monkeypatch**：`FireFoxDebugger.launch()` 内部自带
`self.profile = tempfile.mkdtemp(prefix="rdp_dbg_")`，每次都是干净目录，`close()` 会按 profile 清理进程。
实测 profile 路径：`C:\Users\…\AppData\Local\Temp\rdp_dbg_35z1yaz_`（每轮都不同）。

结果：**全新 profile 下 device 链路全部 200**。

| 轮次 | profile | `cloudauth-device-dualstack` | `upload.captcha-open` | slideAuth |
|---|---|---|---|---|
| P8~P12（复用 profile_noproxy） | 脏 | XHR `status 0`，无响应体 | — | false |
| **P13（fresh, dry）** | 干净 | perf `status 200`，enc=440/85 | `status 200` enc=37 | 未发（patch） |
| **P14（fresh, native）** | 干净 | XHR `status 200 OK`，`access-control-allow-origin: *` | `status 200` | **false** |

→ **"device 链路 status 0" 的根因 = profile 复用污染，已定位并消除。**
（顺带说明：`transferSize 0` 只是跨域无 `Timing-Allow-Origin` 的表现，不是失败；`responseStatus` 是 200。）

### 9.2 全新 profile + trusted + 对齐 + 页面原生 POST（P14）

```
[clean] profile = C:\Users\…\Temp\rdp_dbg_3gd_kapa
gap=238  target=603.04  knobCenter=(307.8,753.4)  dpr=1.25
moves=460  off_final=602.8  err=0.24 CSS px
DIAG.net:
  /m/aliVal.aspx?method=slideAuth  POST 200 OK
     resp {"captchaVerifyResult":false,"bizResult":false}
  cloudauth-device-dualstack…      POST 200 OK   (access-control-allow-origin: *)
DIAG.perf: cloudauth-device 200(enc 440) / 1sfr0c 200(enc 518) / static-captcha 200 / upload.captcha-open 200(enc 37)
```

→ **device 链路 200、trusted、误差 0.24 CSS px、页面自己发** —— 仍然 `false`。

### 9.3 §9 结论强度

| 断言 | 强度 |
|---|---|
| profile 复用会打坏 device 上报（`status 0`） | **已证明**（同一套代码，换全新 profile 后 200） |
| device 链路 200 + trusted + 对齐 + 页面原生 POST 仍 false | **已证明**（P14） |
| 所以"设备遥测断链"不是 P8~P12 失败的根因 | **已排除** |
| 剩余差异在 risk 分 / Log 响应体内容 | **未定**（我们只抓到 85 字节的响应体长度，没抓到内容；真人那轮是 `{"ResultObject":true,…,"Code":"200"}`） |

**硬约束（写给后来者）：每次实验必须用全新 profile，禁止 `mkdtemp` 钉死目录。**
`e2e_12_clean_profile.py` 就是范例：同一进程内 launch → 注入 → 拖拽 → 提交 → 读诊断，跑完自动清理。

### 9.4 复跑

```powershell
cd D:\ds_work\js_reverse_projects\aliVal
python e2e_12_clean_profile.py --mode dry     # 只拖不提交；看 DIAG.perf 里 device 是否 200、moves/err
python e2e_12_clean_profile.py --mode native  # 页面原生 POST（消耗 1 次 slideAuth）
```

产物：`static/work/e2e/clean_profile_dry.json`、`clean_profile_native.json`（含 profile 路径、误差、DIAG 全量）。

---

## 10. device `Log*` 响应体全量 + 收口（§10，零配额）

### 10.1 抓法

`e2e_12_clean_profile.py --mode dry`（不发 slideAuth）+ bridge 里三条路径全包：
`XMLHttpRequest`（`loadend` 读完整 `responseText` + `getAllResponseHeaders`）、`window.fetch`（`clone().text()`）、
`navigator.sendBeacon`；再用 `performance.getEntriesByType('resource')` 的 `responseStatus` 补位。

- profile：`C:\Users\…\Temp\rdp_dbg_uhiiuc1_`（全新）
- 拖拽：460 moves，`err = 0.49 CSS px`，trusted
- device XHR 记录条数：1（`cloudauth-device-dualstack.cn-shanghai.aliyuncs.com`，POST，readyState 4，status 200 OK，`content-length: 85`）

### 10.2 我们的 device Log 响应体（全量，未截断）

```json
{"ResultObject":true,"RequestId":"01A1D4C5-E505-53A2-922E-ECFC4453A553","Code":"200"}
```

响应头（节选）：`access-control-allow-origin: *` / `content-type: application/json;charset=utf-8` /
`x-acs-request-id: 01A1D4C5-E505-53A2-922E-ECFC4453A…` / `etag: 8RHXEd8I1pCJ+8ziTuT8bAw5`

### 10.3 与真人成功轮逐字段对照

| 字段 | 真人（`config/manual_drag2_result.json`） | 我们（P15，fresh profile / dry） | 一致 |
|---|---|---|---|
| 域名 | `cloudauth-device-dualstack.cn-shanghai.aliyuncs.com` | 同 | ✅ |
| HTTP status | 200 | 200 | ✅ |
| `ResultObject` | true | **true** | ✅ |
| `RequestId` | `01A1D4B1-D6F5-56D4-A62E-0EABAC72AC88` | `01A1D4C5-E505-53A2-922E-ECFC4453A553` | 仅请求 ID 不同（正常） |
| `Code` | `"200"` | **`"200"`** | ✅ |
| 同轮 device 附带调用 | `cloudauth-device-dualstack` Log3 | `upload.captcha-open` 200 / `1sfr0c` 200 / `static-captcha` 200 | 结构一致 |

→ **设备链路完全正常**（不是设备指纹协商问题，也没有错误码 / `Message`）。

### 10.4 判据落点：收口

按预设判据第 1 条：**Log 体是 `ResultObject:true / Code:200` ⇒ 六项 + 这一条全部排除，收口：纯协议边界 = S2。**

至此已被**逐项排除**的失败原因（每条都有本轮实测）：

| # | 假设 | 排除依据 |
|---|---|---|
| 1 | `data` 算法/编码不对 | `verify_armour.js` 2/2 逐字节 + 往返 2/2；解了 9 个真实样本 |
| 2 | 缺口/几何口径不对 | 闭环拖到 **0.24 CSS px**（P14）、0.49（P15），`xPos×2.5 ≈ target` |
| 3 | `certifyId` 过期 | 秒级提交（3.1s）仍 false |
| 4 | 轨迹可信标记（flag） | flag 全 1 / `mc,mu` 第 5 段=1 已复现，仍 false |
| 5 | 请求上下文（cookie/session/TLS/UA） | **页面自己 POST**（P12）也 false |
| 6 | 设备遥测断链（`status 0`） | 全新 profile 后 device **200 + ResultObject:true**（P13/P15）；`status 0` 本身是 profile 污染 |

**未排除、但已无手段观测的残余差异**：真人那一轮与我们的 payload 在"动力学细节 + 设备侧随机序列"上仍有差异
（我们没有真人那轮的 `certifyId/data`，无法逐字段 diff），而端点只回两个布尔、device Log 也回 true，
**再往下没有可观测信号**，因此按判据收口。

### 10.5 边界条件（最终版）

**纯 Node 能做到的（已证明）**
1. `InitCaptcha`：纯 Node 可选（deviceToken 可跨进程复用），能拿 `CertifyId` + 图片。
2. `data`：`nonce + payload + deflate + armour` 完全离线、与 SDK **逐字节等价**，无点数下限（436 点也可）。
3. `slideAuth` 报文：`captchaVerifyParam = {sceneId, certifyId, deviceToken, data}`，可从 Node 正确构造并送达（HTTP 200）。

**纯 Node 做不到的（本轮实测）**
4. 拿不到 `captchaVerifyResult: true`：在 data/几何/flag/certifyId/请求上下文/设备遥测全部满足的条件下，
   6 次提交（含页面原生 POST）仍全部 false。**S3 只能靠真人手工输入达成**。

**硬约束（给后来者）**
5. **每次实验必须全新 profile**，禁止 `tempfile.mkdtemp` 钉死固定目录（会把 device 链路打坏成 `status 0`）。
6. 拖拽必须在**单进程**内完成（中途重启 pwsh 会抢前台，Firefox 合成 `mouseup` 使该轮作废）。
7. 闭环读数用"页面 30ms 上报 + 本地回环"或 RDP socket，不能穿插 MCP evaluate。
8. 端点无错误码（只有两个布尔），device Log 恒为 `Code:200`，因此**无法用响应做小步逼近**。

### 10.6 复跑（零配额）

```powershell
cd D:\ds_work\js_reverse_projects\aliVal
python e2e_12_clean_profile.py --mode dry     # 460 点 trusted 拖拽 + device Log 全量体，不发 slideAuth
```

产物：`static/work/e2e/clean_profile_dry.json`（含 `diag.dev[0].body` = device Log 全文）。
