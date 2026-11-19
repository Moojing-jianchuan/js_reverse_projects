# 腾讯 EdgeOne / 天御「Security Verification」纯离线逆向

目标站点：`https://blog.51cto.com/u_16213614/14723924`（EdgeOne 拦截 → 天御 TEOCaptcha 复选框校验）
方法论：`hello-js-reverse-skill`

---

## 0. 结论摘要

| 层级 | 状态 | 证据 |
|---|---|---|
| S1 本地生成合法校验请求 | ✅ | `scripts/e76_online_vm.mjs`：prehandle → pow → **本地 vm 跑 tdc.js 出 collect** → verify 全链路 |
| S2 服务端不拒绝 | ✅ | **`errorCode=0` + `ticket`，4 次成功**（含浏览器已关闭状态下复验） |
| S3 命中目标数据 | ✅ | 带 ticket 请求目标页 → `200`，正文出现，不再是 `Security Verification` |
| S4 可持续 | ✅ | 全流程纯 Node（无浏览器）；key 提取失败自动换 build 重试 |

**核心突破**：服务端并不逐槽校验环境值，而是对 **4 个槽的综合分**打分 —— 必须同时正确。

| 槽语义 | 真机值 | 本地 VM 值 | 修正 |
|---|---|---|---|
| `"<flag>;<sid>"` | `1;<prehandle 的 sid>` | `0;1106021005` | flag→1、sid→本次会话 |
| 自动化特征分 | `0` | `22` | → 0 |
| iframe 判定 | `"iframe"` | `"top"` | → `"iframe"` |
| 某计数 | `0` | `3` | → 0 |

其余 16 个差异槽（canvas 深指纹、URL、WebRTC IP、`sd.tdc_perf`…）**逐项验证全都不校验**。

---

## 1. 快速开始

```bash
node scripts/e76_retry.mjs 4      # 推荐：带重试（约 1/6 的 build 提不出 key，自动换一份）
node scripts/e76_online_vm.mjs    # 单次；退出码 0=通过 3=key提取失败 2=verify被拒 1=初始化错误
```

期望输出：

```
[1b] sid = 1106021005
[3b] fixed slots: 27:3->0, 39:top->iframe, 41:0;1106021005->1;1106021005, 45:22->0
[5] verify 200 {"errorCode":"0","randstr":"@FnH","ticket":"t04Ij_…"}
*** TICKET t04Ij_MyvVlHqC6aOs1Ee45tXg9xyxSVZqZfUX8WTxh…
    target 200 len 987 captcha= false
```

---

## 2. 可用文件

```
scripts/
  env.mjs                沙箱环境（DOM/Canvas/WebGL/Audio/storage…）+ createContext（Firefox 栈对齐）
  browser_globals.mjs    真机 iframe 的 282 个可枚举全局键表
  e76_online_vm.mjs      主流程：prehandle → 本地 VM → 提key → 修4槽 → 重加密 → verify
  e76_retry.mjs          带退出码重试的入口（推荐）
  dump_server.mjs        调试用：把浏览器侧 collect 落到本地
tools/
  tdc_key3.mjs           build 绑定的 XTEA key 提取（运行期采样 + VM 自证，~3.5s/份）
src/
  SOLUTION_FINAL.md      ★ 最终方案（加密参数、4 个关键槽、定位方法、复现）
  BISECT_RESULT.md       金标准改槽二分的完整过程与每次提交的结果
  GOLDEN_SLOT_EXPERIMENT.md  实验平台搭建过程
  CONVERGENCE_LIMIT.md   纯补环境路线为什么止步于 56/73
samples/
  cur_tdc.js             一份 build 样本（264504）
  collect_plaintext.json 解密后的真机明文（72~73 槽结构参考）
  collect_plaintext_raw.bin  原始明文字节（含 103 个空格）
  capture2.json          含 prehandle 模板（e76 复用其参数骨架）
  archive/               全部中间抓包与实验脚本（187 个文件，可追溯）
experiments/             一次性探针脚本（110 个，非主流程）
```

---

## 3. 关键技术点（细节见 src/SOLUTION_FINAL.md）

- **每次会话 `tdc.js` 字节全新**（11 次抓包 = 10 份不同 sha256），key 不可复用，必须现场提取
- **opcode 编号 build 绑定**（同一站点见过 `0x22/0x4b/0x4e/0x51`），硬编码必失效
- **XTEA 32 轮 / ECB / 8B / 小端 / sum 在两半之间**，有效密钥 `EK = key + S`，`S` 的位置随 build 变
- **`Error.stack` 会进载荷**：Node 默认栈格式不匹配 SDK 的正则 → `null[0]` 抛 TypeError → 被当指纹写入。
  用 `Error.prepareStackTrace` 渲染成 Firefox 的 `fn@url:line:col` 才对
- **`Object.keys(window).length` 会进载荷**（`sd.ep.k`），真机 iframe 是 282
- **`readPixels` 全 0** 会让 graphics 探针降级（`gp.s=-3`），需填非零像素

---

## 4. 踩坑与纠错

完整清单见案例文档：[`cases/tencent-edgeone-teocaptcha-jsvmp-xtea.md`](../../../Users/卢/.dsh/skills/hello-js-reverse-skill/cases/tencent-edgeone-teocaptcha-jsvmp-xtea.md)

最关键的三个：

1. **追了一整晚的 canvas `_state:-2` 根本不校验**（只改它 → `errorCode` 仍 0）
2. **二分脚本自身有 bug**（rev 分支恢复的值被后续一行覆盖），导致"全恢复"也 12 —— 先验证「全恢复 == 金标准」再用二分
3. **4 个槽是综合分**，单独修任何一个都仍 12
