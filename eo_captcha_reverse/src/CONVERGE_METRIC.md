# CONVERGE_METRIC —— collect 环境收敛度量（离线）

> 工具：`scripts/converge_metric.mjs`（本批新建，唯一产物）
> 实验单：`runs/20261118-offline-sheet/sheet.md`
> 固定项：`samples/cur_tdc.js`（浏览器实际执行字节，sha256 `ee698720141d…139a`，264504 chars）
> 基线：`samples/dumped_cur.json` 第一行（3520 B / 440 块，sha256 `b487d52d576248ee…488d`）
> 预算：**0 次网络请求**，只用 `node:fs / node:vm / node:crypto`，无新依赖。

---

## 0. 一句话结论

`--pin=all` 后本地两次 `getData(true)` **逐块完全一致（selfVarying = 0）**；与浏览器基线**逐块对齐**只有 `identicalBlocks = 16 / 440`（coverage 3.64%，最长一致段 13 块），
但这是**长度错位造成的度量假象**：换成 ECB 内容对齐后，本地其实**复现了 202 块（bag 213 / 440 = 48.4%）**，真正缺口是 **238 块 ≈ 1904 B**，集中在 `[291-353]`(504 B)、`[223-258]`(288 B)、`[16-38]`(184 B)。
这 238 块 **不归** 10 个指纹字段（单点变异最多只"回收" 6 块）、**不归**事件回放（回放后 bag 213→210）、**也不归** `env_candidate.mjs` 的 6 项修复（pin=all 下 collect 字节与 `env.mjs` **完全相同**）。

---

## 1. 工具与口径

```bash
# 主测量（两次同配置 + 块对齐 + 内容对齐 + time-owned 拆分）
node scripts/converge_metric.mjs --tdc samples/cur_tdc.js --env scripts/env.mjs \
     --baseline samples/dumped_cur.json --pin=all --json runs/20261118-offline-sheet/metric_pin_all.json

# 加变异归因（10 个字段 × 1 次单点变异；整轮 ~21 s）
node scripts/converge_metric.mjs --tdc samples/cur_tdc.js --env scripts/env.mjs \
     --baseline samples/dumped_cur.json --pin=all --attribute \
     --json runs/20261118-offline-sheet/metric_pin_all_attr.json

# 回放事件（可选）
node scripts/converge_metric.mjs --tdc samples/cur_tdc.js --env scripts/env.mjs \
     --baseline samples/dumped_cur.json --pin=all \
     --trace samples/traces/synthetic-human-20261118-135950.json \
     --json runs/20261118-offline-sheet/metric_trace_human.json
```

| 参数 | 默认 | 说明 |
|---|---|---|
| `--tdc` | `samples/cur_tdc.js` | 待跑字节，工具记录 chars/bytes/sha256 |
| `--env` | `scripts/env.mjs` | 任意导出 `buildEnv()` 的模块（**只读**，不修改） |
| `--baseline` | `samples/dumped_cur.json` | 第一行非空行 = base64 明文 collect |
| `--pin` | `all` | `none`/`date`/`random`/`all`：`date` = `Date`(含`now`)+`performance.now` 基准；`random` = `Math.random`+`crypto.getRandomValues`；`all` = 两者 |
| `--attribute` | off | 10 字段单点变异归因 |
| `--trace` | off | 回放事件（自带的事件对象构造，含 pointer/mouse/touch/key 全字段） |
| `--no-time-owned` | off | 关掉"未钉死两次跑"的时间块探测 |
| `--json` | off | 全量结构化结果（含所有块索引） |
| `--wait` / `--trace-compress` / `--trace-offset` / `--trace-repeat` | 600 / 40 / 20 / 1 | 时序参数 |

**三套数字，各有用途（不可混用）**

| 口径 | 定义 | 用途 |
|---|---|---|
| `blocks.*`（index-aligned） | 同一下标的 8 B 块是否相等 | 实验单原口径；**任何字段长度变化都会让后段整体错位**，会饱和 |
| `content.*`（ECB 内容对齐） | 8 B 块**值**的最大有序匹配（LCS）+ bag 匹配（多重集交） | 真正"复现了多少浏览器内容"；LCS 为下界，bag 为上界 |
| `timeOwned.*` | 未钉死后两次跑的不一致块 | 钉死即**永远**不可能与浏览器一致的时间块，从 residual 里剔除 |

**失败分类（显式，不当 0）**：`tdc_load_err`(exit 3) / `collect_err`(exit 4，`getData` 返回 `Err:` 也算) / `baseline_missing`(exit 2，只出 self 指标，块指标写 `null`)。三条均已实测触发。

---

## 2. 实测 A：`env.mjs` @ `--pin=all`（主结果）

命令：`metric_pin_all_attr.json`
本地 collect：**3144 B / 393 块**，sha256 `c371c5fde914e435…`（与 `--pin=date` 字节相同，见 §3）

| 指标 | 值 |
|---|---|
| `blocksLocal / blocksBaseline` | **393 / 440**（byteDelta **−376 B**） |
| `identicalBlocks` | **16 / 440**（coverage **3.64%**） |
| `longestRun` | **13 块** @ block 3 / byte **24–127** |
| `residual`（index） | **424**（其中 7 块 time-owned，417 块环境可归因） |
| `content.matchedBlocks`（LCS） | **202 / 440（45.91%）** |
| `content.bagMatched` | **213 / 440（48.41%）** |
| `content.unmatchedBaseline` | **238 块**（3 块 time-owned + 235 环境） |
| `content.neverInLocalCount` | **216 块**（值在本地**任何位置都不存在**） |
| `selfVarying` | **0** |
| `timeOwned` | 7 块 = `[2] [149] [161] [390-393]` |

**判读**：`identicalBlocks=16` 不是"只复现了 16 块"，而是**第 16 块之后整体错位**（本地比浏览器少 ~47 块早期内容 → 后面每个下标都对不上）。
证据：`0-15` 与 `44` 是唯一同下标相同的位置；内容对齐后本地复现 202–213 块。**本批起应以 `content.bagMatched` 为主指标，`residual(index)` 只作对照。**

### residual 区间（内容对齐，22 段）

| # | 块区间 | 字节区间 | 块数 | 字节 |
|---|---|---|---|---|
| 1 | `[291-353]` | 2328–2831 | **63** | 504 |
| 2 | `[223-258]` | 1784–2071 | **36** | 288 |
| 3 | `[16-38]` | 128–311 | **23** | 184 |
| 4 | `[149-171]` | 1192–1375 | **23** | 184 |
| 5 | `[355-372]` | 2840–2983 | 18 | 144 |
| 6 | `[417-434]` | 3336–3479 | 18 | 144 |
| 7 | `[278-289]` | 2224–2319 | 12 | 96 |
| 8 | `[40-48]` | 320–391 | 9 | 72 |
| 9 | `[67-75]` | 536–607 | 9 | 72 |
| 10 | `[174-178]` | 1392–1431 | 5 | 40 |

其余 12 段均为 1–4 块（`[2-2] [50-50] [81-81] [95-95] [106-106] [109-110] [114-115] [181-181] [197-197] [214-217] [219-221] [436-439]`）。

**形状判读**：残差是**少数几个连续的"整段"**（63 / 36 / 23 / 23 块），不是撒胡椒面。即"有几个记录整块内容不同/整块缺失"，而不是"每个字段都错 1–2 字节"。`[291-353]` = 504 B 连续不同，接近一条完整记录的长度；`[16-38]` 在容器前部，紧接 16 块一致的头，怀疑是**某个前置指纹记录**（多字段合并块）。

---

## 3. `--pin` 对照矩阵（同一 env，各两次跑）

| `--pin` | 本地字节 | 块 | `selfVarying` | `identicalBlocks` | `residual`(index) | LCS | bag |
|---|---|---|---|---|---|---|---|
| `none` | 3152 | 394 | **5~7**（每次不同，`[2] [149] [161] [390-393]`） | 15 | 425 | 201 | 212 |
| `date` | 3144 | 393 | **0** | 16 | 424 | 202 | 213 |
| `random` | 3152 | 394 | **7**（同一批时间块） | 15 | 425 | 201 | 212 |
| `all` | 3144 | 393 | **0** | 16 | 424 | 202 | 213 |

**结论**：
1. **只要钉 `Date`（含 `now`）就已完全确定**：`--pin=date` 与 `--pin=all` 的 collect **sha 相同**（`c371c5fde914…`）。即本 build 的 collect **不含** `Math.random` / `crypto.getRandomValues` 的可观测贡献（钉不钉都不变）。
2. `selfVarying` 的 5–7 块全部是时间块：`[2]`（头部时间戳）、`[149]`、`[161]`、尾部 `[390-393]`。**尾部 16 B 每次变**，与 `src/TDC_FINDINGS.md` §2.2 一致。
3. 未钉死时 `Date` 的字符串长度不同 → 本地是 **394 块**（3152 B），钉死后 **393 块**（3144 B）。**所以 `selfVarying=0` 只在"同一 pin 配置下"成立**；跨 pin 比较会多出 1 块错位，不是环境退化。

---

## 4. 变异归因（`--attribute`，`env.mjs`）

> 每个字段做一次单点变异（`env_candidate.mjs` 与 `env.mjs` 同源，故这套钩子复用 `buildEnv()` 返回的 `w`：`navigator.*`、`screen.*`、`document.createElement` 包装 → `canvas`/`fonts`/`webgl`、`OfflineAudioContext.startRendering`、`localStorage`、沙箱内 `Date.prototype.getTimezoneOffset`+`Intl`）。

| 字段 | `ownedResidual` | `recovered` | `alreadyCorrect` | bag（Δ） | index-change |
|---|---|---|---|---|---|
| userAgent | **83** | 6 | 8 | 212 (−1) | 148 |
| webgl | **83** | 2 | 17 | 198 (−15) | 100 |
| hardwareConcurrency | **73** | 4 | 4 | 214 (**+1**) | 78 |
| timezone | **72** | 5 | 7 | 213 (0) | 135 |
| storage | 42 | 0 | 2 | 212 (−1) | 45 |
| platform | 26 | 1 | **60** | 153 (**−60**) | 88 |
| canvas | 10 | 1 | 4 | 210 (−3) | 14 |
| audio | 4 | 0 | 0 | 213 (0) | 4 |
| screen | 2 | 0 | 4 | 209 (−4) | 6 |
| fonts | 1 | 0 | 0 | 213 (0) | 1 |

- `ownedResidual` = 该字段变异后"变成非基线值"的块数（内容口径，抗位移）：**它衡量"这堆残差对这个字段有多敏感"，不等于"这字段填错了"**。
- `recovered` = 变异后**出现了基线里的块** → 方向对了（最多 6 块，全部是小量）。
- `alreadyCorrect` = 本来是基线块、被这个变异**毁掉** → 说明当前值**已经是对的**。`platform` 60 块、`webgl` 17 块、`userAgent` 8 块属于此类。
- **总计**：10 个字段 `ownedResidual` 相加 396 > 内容残差 238 ⇒ **同一批残差被多个字段反复"认领"**（典型的"改任何字段都会重排同一段记录"现象），**没有任何字段独占这批残差**。

---

## 5. `scripts/env.mjs` vs `scripts/env_candidate.mjs`（6 项修复前后）

`env_candidate.mjs` 已由并行子任务落地（sha256 `cae48343825dd9c1…`，宣称修复 6 项：canvas.toDataURL 真实 PNG、measureText 解析 font、webgl2 独立 stub、getComputedStyle 解析内联样式、performance.now 锚定模块加载、screen 几何自洽）。

```bash
node scripts/converge_metric.mjs --tdc samples/cur_tdc.js --env scripts/env_candidate.mjs \
     --baseline samples/dumped_cur.json --pin=all --attribute \
     --json runs/20261118-offline-sheet/metric_pin_all_attr_candidate.json
```

| 指标 | `env.mjs` | `env_candidate.mjs` | 变化 |
|---|---|---|---|
| 本地 collect sha256 | `c371c5fde914e435…` | `c371c5fde914e435…` | **字节完全相同** |
| 字节 / 块 | 3144 / 393 | 3144 / 393 | 0 |
| `selfVarying` | 0 | 0 | 0 |
| `identicalBlocks` | 16 | 16 | 0 |
| `residual`(index) | 424 | 424 | 0 |
| LCS / bag | 202 / 213 | 202 / 213 | 0 |
| 归因 10 行 | 见 §4 | **逐行数字相同** | 0 |

块级直比（`runs/20261118-offline-sheet/_probe3.mjs`）：`--pin=all` 下两 env **differing = 0 块**；`--pin=none` 下差异**只落在 7 个 time-owned 块**（`[2] [149] [161] [390-393]`）。

**判读**：这 6 项修复对本 build（`cur_tdc.js`）的 collect **零影响**。可能原因（任一即可解释，且都可被本工具二分证明）：该 build 根本不调用这些路径；或调用了但候选实现返回值与旧值**逐字节等价**（如 `canvas_real_dataurl.txt` 优先生效、`screen` 仍取 2048×1152、webgl2 无人 `getContext`）。**无论哪种，实验单的"若改完几乎不变 ⇒ 差异不在这些项"分支成立。**

---

## 6. 事件回放实测（`--trace`）

`samples/traces/synthetic-human-20261118-135950.json`（1283 事件）→ 投递 **643 次**到 TDC 注册的 12 个监听器（`pointerdown/up`、`mousedown/up`、`click` 均命中；`pointermove` 无监听器，故只走了 `mousemove` 一支）。

| 指标 | 无 trace | 有 trace |
|---|---|---|
| 本地字节 / 块 | 3144 / 393 | **3216 / 402**（+72 B 事件数据） |
| bag / LCS | 213 / 202 | **210 / 200** |
| 内容残差 | 238 | **240** |

**判读**：事件确实进了容器（+9 块），但**没有把任何残差区间补上**，反而因为轨迹形状与浏览器真实轨迹不同，把个别原本一致的块顶掉。⇒ **残差与"事件条数/轨迹形状"无关**，`--trace` 不是下一批的收敛手段（仅用于结构对齐）。

---

## 7. 下一步该冻结 / 该查什么（本工具给出的判决）

1. **冻结 `--pin=all` + `--baseline dumped_cur.json` + `cur_tdc.js` 三件套**，主指标改成 `content.bagMatched`（当前 213/440）+ `neverInLocalCount`（当前 216）。`identicalBlocks/residual(index)` 只作对照打印，否则任何长度变化都会把"改进"读成"退化"。
2. **不要再调这 10 个指纹字段的值**。本次归因已证明：单点变异最好只 `+1` 块（hardwareConcurrency），其余 Δ≤0；`platform/webgl/userAgent` 的当前值本来就是对的（`alreadyCorrect` 60/17/8），继续改只会更差。要动只能动**新增能力**（env 里缺失的 API 分支），不是改值。
3. **下一步该查的是三个连续段**：`[291-353]`(504 B)、`[223-258]`(288 B)、`[16-38]`(184 B) + 尾部 `[417-439]`(162 B)。方法是**二分新增**：在 `env_candidate.mjs` 上补一类 API（每次一类），跑本工具，**只认 `bagMatched` 上升 / `neverInLocalCount` 下降**，Δ=0 的改动直接丢弃（6 项修复就是这类）。优先怀疑顺序（按证据强度）：`[16-38]` 在容器头、紧跟 16 块一致区 ⇒ 前置的"多字段合并记录"；`[291-353]` 504 B ⇒ 一条完整记录（插件/字体表/媒体设备类清单型数据）。
4. **时间维度已排除**：`timeOwned` 只有 7 块，且其中只有 3 块落在内容残差里 ⇒ 就算时间完全对上，也最多回收 3 块。**时间不是本批的矛盾。**

---

## 8. 口径与已知局限（写报告时连带记下）

1. **index 对齐会饱和**：本地比基线短 376 B（47 块），从 block 16 起全部错位，因此 `identicalBlocks` 天然只有个位数。sheet 里"289 → <30"的旧口径若建立在同一份 baseline 上，需要复核其当时的本地长度（本工具 `blocks.byteDelta` 已把它变成一等指标）。
2. **内容对齐有歧义**：基线 440 块里有 400 个不同值（+40 重复块），LCS 在重复块上可以有多种最优解 ⇒ 用 **LCS（下界 202）+ bag（上界 213）区间**表述，不承诺单一真值。判定"某改动是否收敛"时用 bag 的**方向**，不用 LCS 的具体值。
3. **ECB 前提**：内容对齐只在"同 build、同密钥、ECB（同明文块→同密文块）"下成立。已由 `TDC_FINDINGS.md` §2.2 的重复块证据 + 本次 `--pin=all` 两次跑 0 差异支持；若将来换 build（密钥随之变），跨 build 的内容对齐无意义，只能比长度与自变性。
4. **`--pin=none` 的 selfVarying 是随机量**：同一命令两次分别得到 5 与 7，属正常；`--pin=all` 为硬要求 0，已满足。
5. **只读约束**：`scripts/env.mjs`、`scripts/e2*.mjs`、`scripts/e30/e31*`、`scripts/env_candidate.mjs` 全程只读；本工具所有变异都在 `buildEnv()` 返回值 `w` 上做**运行时包装**，不落盘、不改源。

---

## 9. 产物清单

| 文件 | 内容 |
|---|---|
| `scripts/converge_metric.mjs` | 工具本体（命令行、pin、trace 回放、两种对齐、归因、摘要、json、失败分类） |
| `runs/20261118-offline-sheet/metric_pin_{none,date,random,all}.json` | pin 矩阵原始结果 |
| `runs/20261118-offline-sheet/metric_pin_all_attr.json` | 主结果 + 10 字段归因（env.mjs） |
| `runs/20261118-offline-sheet/metric_pin_all_attr_candidate.json` | 同上（env_candidate.mjs，数字逐行相同） |
| `runs/20261118-offline-sheet/metric_trace_human.json` | 事件回放结果 |
| `runs/20261118-offline-sheet/_probe{,2,3}.mjs` | 三份取证脚本（结构/块语义/env-vs-candidate 直比） |
