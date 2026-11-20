# 得物 www.dewu.com PC 端接口逆向

目标接口：`POST https://app.dewu.com/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info`
（首页商品流，`category-pick/mapping` 提供品类与 pickRuleId）

逆向开始：2026-11-20 · 环境：Camoufox 152.0.4-beta.30-reverse.5（Firefox 内核）+ Node 24.13.0

---

## 一、当前结论（按验证强度分级）

| # | 结论 | 强度 | 证据 |
|---|---|---|---|
| 1 | `sign = md5(键名升序拼接 key+value + SALT)`，`SALT = 048a9c4943398714b356a696503d2d36` | **已证明** | 3 组浏览器抓包值逐字节对拍通过，见 `src/dewu_sign.js` 自测 |
| 2 | 服务端**仍接受**明文请求体 `{"sign":..., ...params}` | **已证明** | 本地 Node `mapping` 200；`info` 返回 485（不是签名错误） |
| 3 | `mapping` 接口可纯协议本地采集（无验证码、无浏览器） | **已证明（S3）** | `src/probe_local.js` → 200 + 完整品类表 |
| 4 | `info` 被风控挡在验证码之后，签名对了也只有 485 | **已证明** | 485 `{"msg":"请校验验证码","data":{"sessionId":...,"type":2}}` |
| 5 | 验证码过掉后同一会话 info 才 200 | **已证明** | verify `{"code":1,"msg":"验证成功"}` 后 128ms 的 info 请求 200 |
| 6 | 浏览器里 info 请求体被 SDK 改写成 `{"data":"<hex32><b64>"}`，`hex32 = md5(明文JSON)`，密文 = 明文 XOR 会话级固定 keystream | **已证明（结构层）** | 同会话两条不同明文请求的 keystream 完全对齐（119/119 字节），跨会话不同 |
| 7 | `d`（验证码载荷）由 `preinforce2.js`/`pceptor.js`（JS DUN PROTECT VM）生成，约 6278 字符 | **观测** | 抓包 + 三件套全部自解码成功 |
| 8 | 响应体也加密（wire 上是纯 base64 文本），客户端由拦截器解密 | **观测** | 200 响应 body 为 base64，content-type 却是 application/json |
| 9 | `_yundunxhr` 是伪造 native 外观的 XHR 拦截器 | **已证明** | `_yundunxhr.toString()` → `function XMLHttpRequest() {\n [native code]\n}` |

| 10 | captcha 的 `sign = md5("d" + d + SALT)`，与 info **同一套盐、同一个算法** | **已证明** | 逐字节对拍命中，且服务端接受 |
| 11 | captcha 全流程由 `pyuntu.js` 的 `dewuCap()` 驱动（**不是** preinforce2） | **已证明** | `dewuCap({})` → 沙箱 netLog 出现 `captcha/call` |
| 12 | 本地生成的 `d` + `sign` 服务端只回「请求已过期」→ 格式与签名均已通过 | **已证明** | HTTP 200 `{"code":0,"msg":"请求已过期"}` |
| 13 | `sk` / `dwsm` 被打包进 `d`（`d` 长度 +308 / +108） | **已证明** | `createEnv({seedStorage})` 矩阵可复现 |
| 14 | 三件套在 jsdom + 106 条环境补丁下零异常加载，环境检测点 35/35 对齐 | **已证明** | `scripts/verify_env.js`、`scripts/load_sdks.js` |
| 15 | `yd_md5` 就是标准 MD5 | **已证明** | 三组向量 + 得物 sign 样本对拍 |
| 16 | `d` = base64(UTF8(明文 XOR keystream))，明文是 1301 字节 JSON（48 叶子字段），无任何时间字段 | **已证明** | 本地重算与 SDK 逐字节一致 + 三条差分实验 |
| 17 | keystream 只由 `localStorage.sk` 决定（sk 空时为常量 K0，已存 9701 字节） | **已证明** | sk↔ks 矩阵 + 跨进程复用解密成功 |
| 18 | 「请求已过期」是**环境风控**的通用拒绝，不是构造错误 | **已证明（控制组）** | 真实浏览器页面内调 `dewuCap({})` 也返回同一 24 字节响应，而干净会话曾返回 11808 字节挑战 |

**一句话**：`sign`（含 captcha 的 sign）已彻底收口；`d` 也能在本地生成且被服务端解析通过，当前唯一卡点是 `d` 内部的时间/会话时效判定——攻的是这一个点。

---

## 二、三道闸门与状态码

```
请求 → ①sign 校验 → ②风控验证码 → ③返回数据
         │失败 401 签名认证失败
                     │失败 485 请校验验证码
                                   │通过 200
```

- **401** = sign 错（本地用假 sign 实测）
- **485** = sign 对但没验证码（本地用真 sign 实测）
- **403 请求已拒绝** = 风控升级后的硬拒（会话被标记，连页面自己的请求都拒）

验证码流程（真机抓包）：

```
POST /api/v1/h5/risk-stone-captcha/captcha/call     {"d":"<~2900字符>","sign":"<32hex>"}
  → 11.8KB 挑战配置（type=2，含 bgList 图集）
POST /api/v1/h5/risk-stone-captcha/captcha/verify   {"d":"<~6278字符>","sign":"<32hex>"}
  → {"code":1,"msg":"验证成功"}
POST .../feeds/info                                 {"data":"<hex32><b64>"}  → 200
```

注意：验证码**不是塞进 info 请求体**，而是服务端按 `sessionid / sk / shumeiid` 记住"本会话已放行"。放行是限时限量的，实测同会话第二次请求就被 403。

---

## 三、目录结构

```
dewu_reverse/
├─ README.md                     本文件：结论与索引
├─ src/
│  ├─ dewu_sign.js               ★ sign 算法（Node，自测 3/3 通过）
│  ├─ dewu_sign.py               ★ sign 算法（Python，纯标准库，自测 3/3 通过）
│  ├─ probe_local.js             ★ 本地纯协议探测：mapping 200 / info 485
│  ├─ env_patch.js               （子任务C 产出中）jsdom 环境补丁工具链
│  ├─ pceptor_loader.js          （子任务A 产出中）pceptor 载入器：header/加密/解密
│  └─ preinforce_loader.js       （子任务B 产出中）preinforce2 载入器：captcha d 载荷
├─ docs/                         逆向报告
├─ scripts/                      分析脚本（ctx/envelope_probe/hsn_probe/keystream_cmp/unpack/load_probe）
└─ artifacts/
   ├─ js/                        原始 SDK 与页面 chunk（pceptor / preinforce2 / pyuntu / d0RG 所在 chunk）
   ├─ unpacked/                  自解码后的 SDK 源码（JS DUN PROTECT 脱壳结果）
   ├─ env_baseline/              真实浏览器环境基线包（163KB）
   ├─ mod_d0RG.js                请求封装模块（sign 出处，含 salt）
   └─ resp_125.bin               加密响应样本
```

---

## 四、关键机制备忘

### 4.1 sign（已完全还原）

出处：`artifacts/js/b003166a...js` 内 webpack 模块 `d0RG`。

```js
// d0RG.E(url, params) → POST
body = JSON.stringify({ sign: f(params), ...params })

function f(t) {                       // 关键：键名排序后拼接
  return md5(
    (t ? Object.keys(t).sort().reduce(...) : "")   // key+value 依次拼接
    + "048a9c4943398714b356a696503d2d36"           // 固定盐
  );
}
```

拼接细则：`undefined` 跳过；`NaN` 当空串；数组先 `sort()` 再 `join(',')`（元素是对象则 `JSON.stringify`）；对象 `JSON.stringify`；其它 `toString()`。

### 4.2 请求封装层（SDK 加的）

真实浏览器里 `info` 的 body 是 `{"data":"<hex32><b64>"}`：

- `hex32 = md5(明文JSON字符串)`
- 密文与明文**等长**，`明文 XOR 密文 = keystream`，同会话内所有请求 keystream 相同、跨会话不同（等价 AES-CTR 固定 IV 的形态）
- base64 前有一次 UTF-8/Latin-1 破坏：`buf.toString('utf8')` 后逐字符 `charCodeAt & 0xff` 才是真实密文字节（`scripts/envelope_probe.js` 里有还原函数）

### 4.3 请求头（SDK 注入）

`adi`（每请求变）、`hsn`（每请求变，32hex）、`ltk`（会话级，缓变）、`sk`（= `sk` cookie，会话级）、`sks`（`1,hdw4`）、`shumeiid`、`sessionid`、`traceparent`，风险接口另带 `bcv: 1.3.1.20260331`、`bcn: dewu`、`appid: h5`、`platform: h5`、`skt: hdr1`。

### 4.4 SDK 自己的上报链路（抓包实测，可能与 `sk`/`d` 的生成有关）

首页加载与验证码流程中，SDK 会打这几个自有接口（域名 `dav.dewu.com`）：

| 端点 | 方法 | 响应体量 | 推断用途 |
|---|---|---|---|
| `/interceptor` | POST | 596 B | 拦截器配置下发（决定拦哪些 URL、加哪些头） |
| `/webSk` | POST | 1440 B | **`sk` 令牌签发/续期**（`sk` cookie 与 `sk` header 同值） |
| `/cost` | POST | 13 B | 耗时/性能上报 |
| `/wr` | POST | 36 B | 风控事件上报 |

另有阿里云设备指纹通道：`POST https://cloudauth-device-dualstack.cn-shanghai.aliyuncs.com/`（440 B / 85 B 两次）。
说明 `d` 的环境指纹采集很可能**借道阿里云 cloudauth**，而不是全部自研 —— 这会影响复现策略（自研部分只负责打包与加密）。

### 4.5 SDK 三件套

| 文件 | 大小 | 保护 | 自解码后 | 挂载全局 |
|---|---|---|---|---|
| `pceptor.js` | 152KB | JS DUN PROTECT | 515KB | `_yundunxhr`（伪造 native 的 XHR 拦截器）、`base64js` |
| `preinforce2.js` | 107KB | JS DUN PROTECT | 366KB | `fun`、`base64js`、`jsdVipUserMark='dw'` |
| `pyuntu.js` | 172KB | JS DUN PROTECT | 703KB | `regeneratorRuntime` |

脱壳方法：`scripts/unpack.js` —— 在 vm 沙箱里接管 `eval` / `Function`，SDK 运行时自解码的源码会被整体落盘。这一步让"读混淆字节码"变成"读混淆源码"，把工程量降了一个数量级。

---

## 五、可运行脚本

```bash
# 1. sign 算法自测（3/3 必须通过）
node src/dewu_sign.js
python src/dewu_sign.py

# 2. 本地纯协议探测（mapping 应 200，info 应 485）
node src/probe_local.js

# 3. SDK 脱壳（输出到 artifacts/unpacked/）
node scripts/unpack.js preinforce2.js
node scripts/unpack.js pceptor.js
node scripts/unpack.js pyuntu.js
```

`src/probe_local.js` 里的 cookie 是抓包时的临时值，需替换成自己浏览器的最新 `sk` / `dwsm`。

---

## 六、待办（子任务并行中）

- [ ] A：`pceptor.js` 载入器 —— `_yundunxhr` 拦截链路、`adi/hsn/ltk/sk/sks` 生成、body 加密与响应解密入口
- [ ] B：`preinforce2.js` 载入器 —— `fun` 的真实签名、`d` 载荷字段清单与加密算法、时效性
- [ ] C：jsdom 环境补丁工具链 —— 三件套在 Node 里零异常加载
- [ ] 集成：本地造 `d` → 打 `captcha/call` + `captcha/verify` → 再打 `info` 验证 200
- [ ] 采集器：品类 → pickRuleId → 分页翻取 → JSONL 落盘 + 断点续采

## 七、风险与边界

- 当前 IP/会话已被风控标记（同会话第二次请求即 403），在线验证需控制频次，单次会话只发必要请求。
- 得物前端版本会变（`bcv` 带日期戳），`d` 的算法与字段可能随版本调整；本仓库结论标注了采集日期，改版后需回归。
- 本项目仅用于自有/授权范围内的接口联调与数据分析。
