# 方案提案（待 review）

## 一、三个不能再绕开的事实

| # | 事实 | 证据 |
|---|---|---|
| 1 | **每次会话的 `tdc.js` 字节全新，key 永不可复用** | 11 次捕获 → 10 份不同 sha256；连"同长度 244257 + 同 TDC_NAME NKibc"的 capture9/capture10 也 `499b4d7b…` ≠ `a204d54c…`（`scripts/e91_tdc_identity.mjs`） |
| 2 | **发送链路 100% 正确** | 浏览器自己的 collect + Node 发送 → `errorCode=0` + ticket，目标页 200 非挑战页（`samples/a_group_today.json`） |
| 3 | **明文格式不敏感，改槽重建可过** | 浏览器明文 → `JSON.parse`→`JSON.stringify`（丢 103 个空格）→ 同会话 key 重新加密 → `errorCode=0`（`samples/exp1_rebuild.json`） |

结论：**卡点不在加密、不在参数、不在格式，只在「明文里的环境值」。**

## 二、补环境为什么停在 56/73

```
differing slots: 23（3 个时间扰动）
  cd[3]  canvas 深指纹 {"_state":0,...} | {"_state":-2}
  cd[8]  父页面 URL                     | "unknown"
  cd[48] 自动化分 0                     | 22
  cd[60] "iframe"                       | "top"
  ...
  sd.ep.m  0                            | 36
```

这 14 项分两类，**都不是"再加几个 API"能解决的**：

- **单 realm 结构性缺失**：`cd[8]` 父页面 URL、`cd[60]` `"iframe"` —— 实测（`e73` 读 trap）SDK 只读 `location.href`(3) / `window.name`(2) / `window.opener`(1)，**不读** `referrer/frameElement/top/parent/self`。真值来源在沙箱里不存在。
- **能力探测降级分支**：`cd[3]` 的 `-2` 是用对象字面量整块构造的（`e70` 捕获所有 `_state` 写入 → 只有 3 次 `0` + 1 次 `-1`，没有 `-2`），不是异常。
- **VM 内部派生量**：`cd[48]`、`sd.ep.m`、`cd[63]/[64]/[68]/[71]` —— `e75/e77` 给所有全局属性/函数装了 trap，**没有任何 API 返回这些数**。

## 三、三条候选路线

| 路线 | 做法 | 可行性 | 成本 |
|---|---|---|---|
| **A. 半自动 R5**（推荐） | 浏览器过一次校验拿 `EO-Bot-Captcha-Token`（有效期 30 天）→ 期间全本地 HTTP 采集 → 失效自动回浏览器 | **已验证可过**（A 组 0） | 每 30 天一次浏览器 |
| **B. 原生渲染替换 env** | 把 env 里的 canvas/WebGL stub 换成 `node-canvas` + `headless-gl`（真 Cairo / 真 GL），让 `cd[3]`、`cd[48]` 走真路径 | 未验证，可能把 56/73 提到 65+ | 装原生依赖 + 调指纹 |
| **C. 浏览器模板 + 纯算** | 浏览器取一次明文模板 → 每次新会话只替换动态槽 → 用**当次 key** 加密提交 | **被自家数据否掉**：`244257` 是 72 槽、`264504` 是 73 槽，槽序也不同（`e66`），模板跨 build 失效 | — |

**C 为什么不行**（这是最容易误判的一条）：模板要与当次 build 的 cd 结构一致，而 build 每次不同、结构也不同 ⇒ 等于每次都要浏览器取模板 ⇒ 退化成 A，但比 A 多了一整套 key 提取依赖。

## 四、推荐方案 A 的详细设计

### 4.1 全流程

```
┌─ 阶段 1：过校验（每 30 天一次，或 401 时触发）
│   Camoufox 打开目标页 → 等 TDC 加载 → 自动点复选框（record_trace.py 已验证能点过）
│   → 拿 cookie EO-Bot-Captcha-Token（max-age 2592000）
│   → 落盘 token_store.json {token, expires_at, ua, entry_url}
│
├─ 阶段 2：本地采集（纯 HTTP，无浏览器）
│   带 Cookie 请求目标页 → 判 200 且 body 含正文特征 → 解析提取
│   → 分页/断点续采（skill 的 pagination + resume）
│
└─ 阶段 3：失效兜底
    出现「Security Verification」/ 空数据 / 401 → 自动回落阶段 1 重取
    连续 3 次重取仍失败 → 停止并报告（频控信号，链路 K）
```

### 4.2 关键实现点

| 点 | 做法 |
|---|---|
| 自动点击 | 已有 `scripts/record_trace.py`，其中 `find_captcha_frame` + 坐标点击可点过；抽取成 `scripts/solve_once.py` |
| 判 "过没过" | `page.title()` 从 `Security Verification` 变正文标题，或 `frame1` 消失（实测两条都可靠） |
| token 校验 | 拿到后立刻用 Node 打一次目标页，`200 && !/Security Verification/` 才入库 |
| 采集器 | `scripts/collect.py`：读 token_store → 请求 → 解析 → 存 `data/` |
| 频控保护 | 每次失败只重试 1 次；重取间隔 ≥10 分钟；一天最多 3 次过校验 |

### 4.3 判据（每步都要真跑）

1. 阶段 1：`solve_once.py` 退出码 0 且 `token_store.json` 里 `expires_at - now > 25 天`
2. 阶段 2：连续抓 3 页，每页 `200` 且正文特征命中
3. 阶段 3：手动把 token 改成过期值，跑采集器，应自动触发阶段 1 并恢复

## 五、方案 B 作为并行改进项（可选）

如果目标必须"完全不依赖浏览器"，那 B 是唯一出路，但**不承诺成功**：

1. `npm i canvas gl`（Node 原生扩展）
2. 把 `env.mjs` 里 `getContext('2d')` / `getContext('webgl')` 的实现换成真渲染
3. 重跑 `scripts/e44_cd_diff.mjs`，看 `cd[3]` 是否从 `-2` 变 `0`
4. 若 `cd[3]` 修好、`cd[48]` 下降 → 继续；否则停止（说明不是渲染问题）

风险：`canvas`/`gl` 的渲染结果与 Camoufox（Firefox + RFP）**仍不会一致**，可能白做。所以建议只在 A 跑通后再投入。

## 六、我建议的落地顺序

| # | 任务 | 产出 | 依赖 |
|---|---|---|---|
| 1 | 抽 `solve_once.py`（浏览器过校验 → token） | 阶段 1 可跑 | 现有 `record_trace.py` |
| 2 | 写 `collect.py`（token → 采集 → 解析） | 阶段 2 可跑 | 1 的 token |
| 3 | 接兜底（401/挑战页 → 自动重取） | 端到端 | 1+2 |
| 4 | 可选：`tdc_key3` 收尾（10/10 提取） | 供方案 B/研究用 | 子任务 `dacd984b` |

**不建议**继续在"补满 73 槽"上投入——14 项里至少 3 项在单 realm 沙箱中原理上无解，而 A 路线已经用实测数据证明能拿到合法 token。

## 七、需要你拍板的两点

1. **交付形态**：接受"每 30 天跑一次浏览器"吗？（A 路线的前提）
2. **如果必须纯离线**：先允许我跑方案 B 的第一步（装 `node-canvas` + `headless-gl`，只改 env 的 canvas 层，跑 `e44` 对比 `cd[3]`），用一次实验决定 B 值不值得做。
