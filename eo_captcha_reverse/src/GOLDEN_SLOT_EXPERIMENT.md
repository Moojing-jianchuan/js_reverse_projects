# 实验平台已打通：金标准改槽定位（2026-11-19 09:30–10:30）

## 一、先确认前提还成立

**A 组（浏览器自己的 collect + Node 发送）今天仍然通过**：

```
A-group verify: 200 {"errorCode":"0","randstr":"@z5H","ticket":"t04W7wsRiT_2bom0PfoS9Hhx..."}
    target 200 len 989 captcha= false
```

⇒ 发送链路、`ans`/`tlg`/`eks`/`deviceID`/`pow_answer` 参数、UA/Referer/sec-fetch 全部正确。
**唯一变量就是 collect 的明文。**

## 二、第二个关键确认：明文格式不敏感

拿同一会话的浏览器明文 → `JSON.parse` → `JSON.stringify`（紧凑，**丢掉原始的 103 个空格**）→ 用**同一份 build 的 key** 重新 XTEA 加密 → 提交：

```
[5] decrypted, cd slots 72 | bytes 3592
[6] rebuilt plaintext 3526 B -> collect 4704
[7] verify: {"errorCode":"0","randstr":"@1d2","ticket":"t0438eUVhOI18hv1VtWJzli88HDMaWTI1..."}
```

**`errorCode=0`**。这一条同时证明了三件事：

| 结论 | 意义 |
|---|---|
| 格式不敏感 | 服务端只解析内容，不管空格/重建 |
| `tdc_key2` 提取的 key 正确 | 能用它加密出被接受的 collect |
| 我们的 XTEA 实现正确 | 32 轮 / ECB / 小端 / sum 位置 全对 |

⇒ **从此可以自由改任何一个槽，然后加密提交**，这就是定位"服务端到底校验哪几个槽"的实验平台。

## 三、同 build 下的差异清单（`scripts/e88_same_build_diff.mjs`）

用 `samples/mix_tdc.js`（244257，与浏览器同字节）在本地跑 VM，解密后逐槽对比**同一会话**的浏览器明文：

```
differing slots: 23（其中 3 个是时间扰动）
  ≠  3 | {"_state":0,"canvas":"e7f8614f…"}          | {"_state":-2}          ← canvas 深指纹
  ≠  8 | "https://blog.51cto.com/u_16213614/14723924" | "unknown"             ← 父页面 URL
  ≠ 15 | 1080                                        | 1152                  ← screen.height
  ≠ 18 | ""                                          | "192.168.1.14"        ← WebRTC IP
  ≠ 29 | 1920                                        | 2048                  ← screen.width
  ≠ 40 | "captcha.eo.gtimg.com"                      | "blog.51cto.com"      ← location.host
  ≠ 43 | "1;2727828153"                              | "0;1106021005"        ← sid 及前缀
  ≠ 45 | [[4,140,212.8,<ts>,0,0,0,0]]                | [[4,-1,-1,<ts>,…]]    ← 布局测量
  ≠ 48 | 0                                           | 22                    ← 自动化分
  ≠ 60 | "iframe"                                    | "top"
  ≠ 63 | 767                                         | 65
  ≠ 64 | 0.112                                       | 0
  ≠ 65 | canvas dataURL 尾部不同
  ≠ 68 | 5                                           | 10001
  ≠ 70 | 1920                                        | 2048
  ≠ 71 | 0                                           | 3

sd 差异：
  fpBio.gp.px   2687c95a…       vs  4a6d02c5…        ← readPixels 像素 hash（我们填的是伪随机）
  sd.ep.m       0               vs  36                ← ★ 这个最可疑
  tdc_perf      {91,53,122}     vs  {115,102,46}
```

**新发现**：`sd.ep.m` 浏览器是 **0**，我们 **36**。这个字段之前没注意过，它极可能是"异常计数"。

## 四、当前唯一瓶颈：key 提取的通用性

改槽实验必须用"该会话那份 build 的 key"重新加密。而：

```
capture10 的 tdc.js  244257 chars  sha256 a204d54c…  → tdc_key2 提取 OK
capture11 的 tdc.js  257913 chars  sha256 e496e5d7…  → tdc_key2 报错
                                    "helper identification failed" at tools/vmp/bytecode.mjs:82
用 capture10 的 EK 去解 capture11 的 collect      → 乱码（确认 key 不同）
```

⇒ **只要能覆盖 key 提取，实验就能一轮轮跑下去**。已派子任务 `dacd984b` 新建 `tools/tdc_key3.mjs` 解决这个问题（判据：三份 build 的 `--selfcheck` 全部 `OK`）。

## 五、拿到 key3 之后的实验顺序（每次一个新 sess，一次只改一槽）

## 六、金标准实验第一批结果（10:00–11:15）

有了 `tdc_key3`（3.5s 提 key，三份 build 全 OK）之后，实验平台终于能连续跑了。

| 实验 | 改动 | 结果 |
|---|---|---|
| exp1 | 浏览器明文 → `JSON.parse`→`JSON.stringify` → 同会话 key 重新加密 | **`errorCode=0`** |
| exp-canvas | 只把 canvas 深指纹槽改成 `{"_state":-2}` | **`errorCode=0`** |
| exp-half1 | 把前 11 个差异槽（`1,4,8,11,16,20,26,28,32,34,41`）改成本地值 | **`errorCode=51`** |
| exp-all | 18 个差异槽**全部**改成本地值 | `errorCode=12` |

**三条硬结论**：

1. **canvas 深指纹根本不校验** —— 花了一整晚追的 `-2` 是无关项。
2. **`51` 是新的失败模式** —— 前 11 槽里有东西"格式非法"（不是"不匹配"）。最可疑的是：
   ```
   浏览器 cd[1] = 5      本地 cd[1] = 10001
   ```
   `10001` 不是 env 里的任何常量（已 grep 确认），是 VM 内部算出来的。
3. **12 与 51 是两个不同校验点**：全改 → 12（内容不匹配），改一半 → 51（格式非法）。

## 七、这轮真正修掉的一个 bug：`Error.stack` 格式

`cd[36]` 一槽：

```
浏览器: "_0x5b18c6@https://captcha.eo.qq.com/tdc.js?app_data=…&js_data=d04XxgZUD7T…"
我们原: "TypeError: Cannot read properties of null (reading '0')\n    at _0x5b18c6 (tdc.js:1:12561)…"
```

根因：SDK 用 `Error().stack` 取执行位置，正则按 **Firefox 的 `fn@url:line:col`** 写；Node 的栈是
`    at fn (file:1:2)`，`match()` 返回 null，再取 `[0]` 抛 TypeError，这个 TypeError 被当指纹写进载荷。

修法（已进 `scripts/env.mjs` 的 `createContext(w, tdcUrl)`）：

```js
Error.prepareStackTrace = (err, frames) => frames.map(f =>
  `${f.getFunctionName() || 'anonymous'}@${f.getFileName() || url}:${f.getLineNumber()}:${f.getColumnNumber()}`
).join('\n');
```

效果（同 build、同会话）：

```
修复前  identical slots 47/72   cd[36] = TypeError…
修复后  identical slots 48/72   cd[36] = "_0x5b18c6@https://captcha.eo.qq.com/tdc.js?app_data=…"  ✓
```

用修复后的 env 跑真实提交仍是 `12` —— 真 bug，但不足以通过。

## 八、下一步（二分定位 51 / 12）

一轮 = 新会话 + key3(3.5s) + 本地 VM(2s) + 提交，约 1 分钟：

1. 单测 `cd[1]`（10001）看是否复现 `51`
2. 若复现 → 在浏览器里对同一槽断点看输入，找 `10001` 的来源
3. 否则继续二分 half1 的 11 个槽，再二分后半 11 槽

最多 5 轮可把"服务端真正校验的槽"缩到 1-2 个。

1. `sd.ep.m`：0 → 36（若变 12，直接锁定这就是被校验项）
2. `cd[3]` canvas：完整对象 → `{"_state":-2}`
3. `cd[8]` URL：真 URL → `"unknown"`
4. `cd[60]`：`"iframe"` → `"top"`
5. `cd[48]` 自动化分：0 → 22
6. 若单项都 0 → 说明都不是关键，改做二分（一次改一半）

每一步的产出都是"这个槽到底要不要补"的硬结论，比继续盲补 14 个槽高效得多。
