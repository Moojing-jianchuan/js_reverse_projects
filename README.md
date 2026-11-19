# js_reverse_projects

Web 逆向 / 前端签名 / 风控对抗的项目集合。**每个目录一个目标站点**，包含可运行的复现代码与还原过程文档。

> 仅用于学习交流与技术研究参考。

---

## 目录

| 项目 | 目标站点 | 技术特征 | 状态 | 入口 |
|---|---|---|---|---|
| [`eo_captcha_reverse`](./eo_captcha_reverse/) | blog.51cto.com（腾讯 EdgeOne / 天御 TEOCaptcha） | JSVMP + **逐会话换 key** 的 XTEA + 服务端综合分校验 | ✅ **纯离线通过**（`errorCode=0`，无浏览器） | [README](./eo_captcha_reverse/README.md) · [方案](./eo_captcha_reverse/src/SOLUTION_FINAL.md) |
| [`zhipin_reverse`](./zhipin_reverse/) | zhipin.com（BOSS 直聘） | `security-js` JSVMP → `__zp_stoken__` | 有结论文档 | [README](./zhipin_reverse/README.md) |
| [`aliVal`](./aliVal/) | tool.manmanbuy.com（阿里 FeiLin 拼图验证码） | 拼图轨迹 + `btoa`/AES 载荷 | 分析中 | 项目内文档 |
| [`slider_captcha`](./slider_captcha/) | tool.manmanbuy.com | 滑块/拼图求解 | `solve.py` | — |
| [`pzds_reverse`](./pzds_reverse/) | api.pzds.com | 阿里 WAF：`acw_sc__v2` / `ssxmod_itna` | 有分析文档 | [WAF_FLOW_ANALYSIS.md](./pzds_reverse/WAF_FLOW_ANALYSIS.md) |
| [`yaopin_reverse`](./yaopin_reverse/) | www.nmpa.gov.cn（国家药监局） | 瑞数 RS6（`FSSBBIl1UgzbN7N` / 412） | 脚本 | — |
| [`ths_reverse`](./ths_reverse/) | q.10jqka.com.cn（同花顺） | `chameleon` 混淆 SDK | 环境复现脚本 | — |
| [`yjp_reverse`](./yjp_reverse/) | www.yijiupi.com（易久批） | JSVMP + 环境指纹 | `envPatch.js` | — |
| [`jxhk_reverse`](./jxhk_reverse/) | www.juneyaoair.com（吉祥航空） | 定位/风控参数（`td_location`） | 脚本 | — |
| [`ouzhi_reverse`](./ouzhi_reverse/) | www.ouyeel.com（欧冶） | 接口签名 | 单脚本 | — |
| [`manmanbuy_client`](./manmanbuy_client/) | tool.manmanbuy.com | 客户端侧采集 | 有 README | [README](./manmanbuy_client/README.md) |
| [`sdenv`](./sdenv/) | — | RS 补环境运行时（子模块/占位） | 空目录 | — |

---

## 各项目简述

### eo_captcha_reverse —— 腾讯 EdgeOne / 天御 TEOCaptcha（★ 完整收口）

**结果**：`errorCode=0` + `ticket`，连续 4 次成功，其中一次在**浏览器进程已关闭**的状态下复现 —— 全程纯 Node。

**链路**：`prehandle` → 下载 `tdc.js` → 本地 `vm` 跑出 `collect` → `tdc_key3` 提 XTEA key → 解密后**定点修正 4 个槽** → 重加密 → `verify`。

**三个关键结论**：

1. **`tdc.js` 每次会话字节全新**（11 次抓包 = 10 份不同 sha256），key 不可复用；opcode 编号也是 build 绑定的（同站点见过 `case 0x22 / 0x4b / 0x4e / 0x51`）。
2. **服务端不逐槽校验，而是 4 个槽的综合分**：`<flag>;<sid>` / 自动化特征分 `22→0` / iframe 判定 `top→iframe` / 计数 `3→0`。只修 1~2 个仍 `errorCode=12`；其余 16 个差异槽（canvas 深指纹、URL、WebRTC IP、`sd.tdc_perf`…）逐项验证**全都不校验**。
3. **`Error.stack` 会进载荷**：SDK 按 Firefox 的 `fn@url:line:col` 解析栈，Node 默认 `    at fn (file:1:2)` 让 `match()` 返回 null → `null[0]` 抛 TypeError → **这个 TypeError 被当指纹写进 collect**。

**快速开始**

```bash
node scripts/e76_retry.mjs 4      # 带重试（约 1/6 的 build 提不出 key，自动换一份）
node scripts/e76_online_vm.mjs    # 单次；退出码 0=通过 3=key失败 2=verify被拒
```

目录：`scripts/`（生产代码）· `tools/tdc_key3.mjs`（key 提取）· `src/`（过程文档）· `samples/`（代表性样本）· `experiments/`（一次性探针）

### zhipin_reverse —— BOSS 直聘 `__zp_stoken__`

`security.html` 动态加载 `security-js/<sdkName>.js`，扁平化 dispatcher（`31&p` 位拆包）生成 Cookie。
记录文档见项目内 README（含载荷公式反解与环境原生性要点）。

### pzds_reverse —— 阿里 WAF

`acw_sc__v2` + `ssxmod_itna` 双 Cookie 挑战，含 `WAF_FLOW_ANALYSIS.md` 的流程分析。

### yaopin_reverse —— 瑞数 RS6

NMPA 站点的 412 挑战，`1.js` / `ajax.js` 为抓取样本，`sign.py` 为签名实现。

### ths_reverse —— 同花顺 `chameleon`

`chameleon.1.7.min.*.js` 混淆 SDK，`run_chameleon_env.js` 为环境复现。

### yjp_reverse —— 易久批 VMP

`browser_vmp.json`（浏览器侧采集快照）+ `envPatch.js`（环境补丁）+ `gen_token.js`。

### aliVal / slider_captcha / manmanbuy_client —— 阿里 FeiLin 拼图

同一目标（`tool.manmanbuy.com`）的三个角度：`aliVal` 做载荷/加密分析，`slider_captcha` 做求解，`manmanbuy_client` 做客户端采集。

### jxhk_reverse / ouzhi_reverse

小规模脚本：吉祥航空的定位/风控参数、欧冶的接口签名。

---

## 通用约定

每个项目尽量遵循同一结构：

```
<project>/
  README.md      结论摘要 + 快速开始 + 坑点
  scripts/       可运行的复现脚本（生产代码）
  tools/         辅助工具（提取器 / 反混淆 / 探针）
  src/           过程文档（方案、二分记录、发现）
  samples/       代表性样本（小体积）
  experiments/   一次性探针脚本（不进主流程）
```

**体积约定**：抓包归档、反汇编中间产物、`node_modules` 一律不进仓库（各项目 `.gitignore` 处理）。

## 环境

- Node.js 24 / Python 3.13
- 取证与调试：`camoufox-reverse-mcp`（Firefox/Camoufox + RDP）
- 方法论：`hello-js-reverse-skill`（案例库在 `cases/`）

## 免责

本仓库内容仅用于**学习交流与技术研究**。请勿用于未授权的目标。
