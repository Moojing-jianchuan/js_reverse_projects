# data 轨迹加密 — 证据链（截至 Stage 1）

## 已确认事实（均有证据）
1. **data 字段结构**：`data = 3字节魔数(0x25 0x13 0x27) + 变长密文`。dist=120 时总 420 字节，成功滑动 3216 字节。前 3 字节跨样本固定，第 4 字节起不同。
2. **data 是加密的**：Shannon 熵 7.295 bits/byte，185/256 不同字节值，0 个重复 4 字节序列 → 高熵随机，非序列化。
3. **密钥来源**：DeviceConfig 解密（RES 密钥 + AES-128-CBC + IV "0123456789ABCDEF"）后的 field[0] 是每次请求动态密钥（如 `db61c739893c9b16`）。
4. **加密引擎**：`FEILIN.initFeiLin` = `sC.apply(this, arguments)`，即 sC 函数本体（164 状态 CFF，feilin149.js 位置 546563）。
5. **crypto 依赖**：feilin149.js 用 `__ALIYUN_CRYPT`（crypto-js）：`HmacSHA1`、`enc.Base64`、`MD5`（密钥派生），以及 `rB(ACCESS_SEC, ACCESS_KEY.SECRET)`（AES 解密密钥）。

## 已排除（盲目试过但失败，非证据驱动）
- AES-CBC/ECB（非 16 倍数）
- AES-CTR/CFB/OFB（iv 0123456789ABCDEF / 零向量）
- RC4 / RC4Drop / Rabbit（密钥 ascii16 / hex8）
- MD5(key) + RC4
- keystream 反推：若明文 `{"` 开头，keystream 前 2 字节 `5e 31` ≠ MD5(key) `6c b6` → 明文可能非 JSON 开头，或 MD5 输入非简单 key

## config 结构（Br = new Zt，从 AliyunCaptcha.js 提取）
```
Br._extend({endpoints, appName, appKey, DeviceConfig, DeviceToken, ...})
Br.logs = []
Br.initTime = Date.now()
```
sC(initFeiLin) 读取 config 字段：logs、DeviceConfig、appKey、sceneId、endpoints、appName、logs.push

## 卡点
- 动态捕获工具限制：camoufox 的 evaluate_js + hook_function 都在隔离 world（访问不到 main world 全局，`[TRACE] Cannot find: window.__ALIYUN_CRYPT.MD5`）；instrumentation 能改写（files_rewritten）但 tap 日志收集为空
- jsdom 驱动 sC：完整 config 仍报错 `w["switch"]`（feilin149.js 555200），w 是 undefined，t0=K+"d"（K 解码后可能是 "switc"）

## 待办
- 定位 w 的赋值来源（sC CFF 内部），理解 "switch" 是什么字段
- 或改用更可靠的 main world 捕获手段
