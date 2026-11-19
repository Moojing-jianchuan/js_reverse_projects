# 纯离线通过腾讯天御验证码（腾讯 EdgeOne / TEOCaptcha）—— 最终方案

**状态：已跑通，可重复。全程无浏览器参与提交。**

```
[1] prehandle 200  sess=…  sid=1106021005
[2] tdc.js 200  eks=352
[3] 本地 VM 生成 collect（4472 B）
[3b] fixed slots: 43:0;1106021005->1;1106021005, 48:22->0, 60:top->iframe, 71:3->0
[5] verify 200 {"errorCode":"0","randstr":"@j02","ticket":"t04Vse9yVkMS90byl5bWrRzuKKrgWkhK2Hs0i4kr…"}
    target 200 len 988 captcha=false
```

第二次运行（槽号完全不同：`34:top->iframe, 46:0;…->1;…, 56:22->0, 64:3->0`）同样 `errorCode=0`。

## 一、整条链路

```
① prehandle            GET cap_union_prehandle → sess / pow_cfg / tdc_path / sid
② 下载 tdc.js           每次都是全新字节（11 次抓包 = 10 份不同 sha256）
③ 本地跑 VM            vm.runInContext + buildEnv() → TDC.getData(true) → collect
                       （VM 自己用内部 key 做 XTEA 加密，不需要我们提 key）
④ 提 key              tools/tdc_key3.mjs --selfcheck（3.5s，用于第 ⑤ 步改明文）
⑤ 修正 4 个关键槽       解密 → 改值 → 重新加密
⑥ verify              collect / tlg / eks / sess / ans / deviceID / pow_answer / pow_calc_time
⑦ 用 ticket 请求目标页  200 且不含 "Security Verification"
```

## 二、服务端到底校验什么（二分 + 金标准实验定位）

方法是「金标准改槽」：拿浏览器真实 collect（必过），只把一个槽改成本地值，看 `errorCode`。

### 结论：4 个槽是**综合评分**，必须同时正确

| 槽语义 | 浏览器真值 | 我们 VM 的值 | 修正 |
|---|---|---|---|
| `"<flag>;<sid>"` | `1;<prehandle 的 sid>` | `0;1106021005`（硬编码旧值） | flag → 1，sid → 本次 prehandle 的 sid |
| 自动化特征分 | `0` | `22` | → 0 |
| iframe 判定 | `"iframe"` | `"top"` | → "iframe" |
| 某计数 | `0` | `3` | → 0 |

**为什么必须 4 个一起改**（实测）：

```
rev0:9   (恢复前 9 个金标准槽)      → 0    ← 后 9 个用本地值完全没问题
rev5:9   (只恢复中间那 4 个)        → 0    ← 这 4 个是关键
rev5:7   (恢复 4 个里的前 2 个)     → 12
rev7:9   (恢复 4 个里的后 2 个)     → 12
rev0:5   (前 5 个)                  → 12
```

⇒ 服务端算的是**综合分**，只修一部分仍超阈值。

## 三、已被证明**不校验**的（无需再补）

逐项替换验证（每项一次真实提交）：

| 项 | 结果 |
|---|---|
| canvas 深指纹 `{"_state":-2}` | 0 |
| `cd[1]` = 10001、`sd.tdc_perf`、`sd.ep.m` | 0 |
| 媒体编解码 / WebGL vendor / `"unknown"` URL | 0 |
| 父页面 URL、WebRTC IP、`{"lang":…}` | 0 |
| 明文 JSON 格式（紧凑 vs 原始带空格） | 0 |
| 事件计数 `{"count":0,"items":[]}` | 0 |

## 四、关键技术点

### 4.1 key 提取（`tools/tdc_key3.mjs`）

`collect = base64(XTEA_32轮_ECB(明文))`，key 由 `js_data` 派生、**每次会话都不同**。
`tdc_key3` 的做法：
- patch dispatcher → 从寄存器里采样 4 元 32bit 整数数组作 key 候选
- 从寄存器里的字节码 int 流按**运行期读取次数**取盐候选（比静态反汇编的排序强得多）
- 用「同一份 tdc.js 在本地 VM 跑出的 collect 必须解成 JSON」做 oracle 自证

平均 3.5 s/份。已知 `245664` 这类形状它会失败（约 1/5 概率），重试换 build 即可。

### 4.2 `Error.stack` 必须是 Firefox 格式（真 bug，已修）

SDK 用 `Error().stack` 取执行位置，正则按 `fn@url:line:col` 写；Node 的栈是 `    at fn (file:1:2)`，
`match()` 返回 null → `null[0]` 抛 TypeError → **这个 TypeError 被当指纹写进载荷**。

`env.mjs` 的 `createContext(w, tdcUrl)` 用 `Error.prepareStackTrace` 渲染 Firefox 格式后，该槽与浏览器逐字节一致。

### 4.3 其他已对齐的环境项

`Object.keys(window)` 补齐到 282 键 · 非原生函数 108 → 0 · `window.name` · 实时 AudioContext 48kHz ·
`matchMedia("(color-gamut: srgb)")` · 裸元素 rect `-9999/100` · `canPlayType` 真值映射 ·
`getData` 前等 800ms 让异步采集落地 · 真实内存版 localStorage/sessionStorage · `readPixels` 填非零（让 `gp` 探针 `s:0`）

## 六、key 提取的覆盖率与重试（已修）

### 6.1 采样改进

`tdc_key3` 原来只接受**长度恰好为 4** 的寄存器数组作为 key 候选。实测某类 build（如 245664）
把 key 放在更长的数组里，导致候选池只有 4 个、枚举 51 万组不可能命中。

改成「扫描 ≥4 长度数组的连续 4 元窗口」，并加了两道保护（超长数组跳过、每数组最多 12 个窗口，
否则采样内核会把 VM 拖到 240s 超时）后，同一份 build 的 key 候选从 **4 个 → 23 个**。

### 6.2 仍有约 1/6 的 build 提取不出来

抽样 6 份 live build：**5 成功 / 1 失败（83%）**。失败的那份枚举了 291 万～330 万组仍不命中，
说明它的 key/盐结构超出当前模型（不是采样密度问题）。

**工程处理**：`scripts/e76_retry.mjs` 带退出码重试 —— 提取失败就换一份 build 重跑整个流程：

```
e76 退出码：0 = 通过 · 3 = key 提取失败（换会话重试） · 2 = verify 被拒 · 1 = 初始化错误
node scripts/e76_retry.mjs 4      # 最多 4 次，实测第 1 次即通过
```

### 6.3 通过率实测

| 时间 | 结果 |
|---|---|
| 18:35 | `errorCode=0` + ticket |
| 18:45 | `errorCode=0` + ticket |
| 16:40 | `errorCode=0` + ticket（经 retry wrapper） |

三次全过，槽号各不相同（`43/48/60/71`、`34/46/56/64`、`43/48/60/71`），证明是按语义修正。

## 七、复现

```bash
node scripts/e76_retry.mjs 4      # 带重试，推荐
node scripts/e76_online_vm.mjs    # 单次（key 提取失败会以 exit 3 退出）
```

期望输出含 `[3b] fixed slots:` 与 `"errorCode":"0"`。

## 八、遗留

- 约 1/6 的 build 形状 `tdc_key3` 仍提取不出（枚举 330 万组不中），靠 `e76_retry.mjs` 换会话绕过
- 4 个关键槽用值特征定位（`/^[01];\d+$/`、`'top'`、`22`、`3`）；若某次 build 出现同值异义槽，
  用 `samples/e106_show_candidates.mjs` 打印逐槽对照再复核
