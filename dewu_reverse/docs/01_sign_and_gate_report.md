# 得物 info 接口逆向上半场报告（sign + 风控闸门）

> 采集时间：2026-11-20 10:15 ~ 11:00 (Asia/Shanghai)
> 环境：Camoufox 152.0.4-beta.30-reverse.5 / MCP camoufox-reverse 1.12.0 / Node 24.13.0
> 目标：`POST https://app.dewu.com/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info`

---

## 1. 接口定位

首页 `/` 的 Next.js chunk `pages/index-*.js` 里：

```js
B = n("rW1U");                                   // 请求封装模块别名
F = t => Object(B.b)("/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info", t);

// 点击分类 tab 时：
F({ pickRuleId: e.pickId, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true })
```

`rW1U` 只是再导出，实体模块是 `d0RG`（位于 chunk `b003166a44226269284d7eb3f320818977abba14.js`，已抽出为 `artifacts/mod_d0RG.js`）。

同页还会调 `category-pick/mapping`（拿品类 → pickRuleId），该接口**没有**风控闸门。

---

## 2. sign 算法（已完全还原并验证）

### 2.1 源码

```js
// d0RG 模块内
function f(t) {
  return c()(                                   // c() = md5
    "".concat(
      t ? Object.keys(t).sort().reduce(function (e, r) {
            var n = t[r];
            if (void 0 === n) return e;                       // undefined 跳过
            if (Number.isNaN(n) && (n = ""),                 // NaN 当空串
                Array.isArray(n)) {
              if (0 === n.length) return "".concat(e).concat(r);   // 空数组只拼键名
              var o = n.sort().map(function (t) {
                  return t instanceof Object ? JSON.stringify(t) : t
              }).reduce(function () {                         // 数组元素排序后用 "," 连接
                  var t = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : "",
                      e = arguments.length > 1 ? arguments[1] : void 0;
                  return t + (t ? "," : "") + e
              });
              return "".concat(e).concat(r).concat(o)
            }
            return n instanceof Object ? e + r + JSON.stringify(n) : e + r + n.toString()
        }, "") : "",
      "048a9c4943398714b356a696503d2d36"                     // 固定盐
    )
  )
}

// 发送
E = (url, params) => {
  var n = { sign: f(params), ...params };
  return fetch(url, { method: "POST", body: JSON.stringify(n), ... })
}
```

### 2.2 验证矩阵（浏览器抓包 vs 本地计算）

| 接口 | 参数 | 浏览器 sign | 本地 sign | 结果 |
|---|---|---|---|---|
| mapping | `{pageNum:1,pageSize:20}` | `a44fa02883cc1342f22c7dfefea1d9e9` | 同 | ✅ |
| info | `{pickRuleId:644443,pageNum:1,pageSize:24,filterUnbid:true,showCspu:true}` | `0e5d10fb111f2afef6ac0a1776187e23` | 同 | ✅ |
| info | `{pickRuleId:644479,...同}` | `f2b6b4c666227d52fdadf251f307445d` | 同 | ✅ |

第三行与 2025-11 的公开样本（CSDN《[JS逆向] 得物案例 -- webpack》）完全一致 → **该算法自 2025-11 至今未变**。

获取浏览器侧真值的方法（可复现）：在页面主世界把 `window.fetch` 包一层，点击分类 tab 让页面自己发请求，从包装里读出 SDK 加密前的明文 body：

```js
const w = window.wrappedJSObject;
w.__origFetch = w.fetch;
w.fetch = function (u, init) {
  w.__fetchlog.push({ u: String(u), body: String(init.body) });
  return w.__origFetch.apply(this, arguments);
};
// → {"sign":"0e5d10fb...","pickRuleId":644443,"pageNum":1,"pageSize":24,"filterUnbid":true,"showCspu":true}
```

---

## 3. 三道闸门（状态码可区分）

| 状态 | 触发条件 | 实测方式 |
|---|---|---|
| 401 `签名认证失败!` | sign 错 | 本地 POST 假 sign |
| 485 `请校验验证码` | sign 对，缺验证码 | 本地 POST 真 sign（`src/probe_local.js`） |
| 403 `请求已拒绝` | 风控升级，会话/IP 被标 | 同会话第二次点分类，连页面自身请求都被拒 |
| 200 | 签名 + 验证码都通过 | 浏览器 verify 成功后 128ms 的请求 |

### 3.1 485 响应样例

```json
{"code":485,"msg":"请校验验证码",
 "data":{"resultCode":485,
         "sessionId":"LkTEOGPUeaZubhIrHDQAVT0dGy9vzYA2Y72E5b6iAoJtlAoSGdhUI0Dd8khB8FGjAqDsti5TPYDSHafWlrKlke",
         "type":2},"status":485}
```

### 3.2 验证码链路

```
POST /api/v1/h5/risk-stone-captcha/captcha/call
  headers: appid:h5  bcn:dewu  bcv:1.3.1.20260331  platform:h5  skt:hdr1  sk  ltk  hsn  adi  shumeiid  sessionid
  body: {"d":"<约2900字符，base64 mojibake>","sign":"<32hex>"}
  → 11808 字节挑战配置（data.bgList 为图集 dataURL，type=2）

POST /api/v1/h5/risk-stone-captcha/captcha/verify
  body: {"d":"<约6278字符>","sign":"<32hex>"}
  → {"code":1,"msg":"验证成功"}
```

验证码**不是**塞进 info 请求体，而是服务端按 `sessionid / sk / shumeiid` 建立"本会话已放行"状态。放行限时限量：实测同会话第二次请求即 403。

---

## 4. SDK 加的外壳（浏览器路径上的额外一层）

真实浏览器里 info 的请求体不是明文，而是：

```json
{"data":"<32位hex><base64密文>"}
```

### 4.1 结构（已用两组同会话样本证明）

1. `hex32 = md5(明文 JSON 字符串)`
   - 样本 A：明文 119 字节 → `39a54d55570301b0b6476dee5a7ce7e3` = md5(明文) ✅
   - 样本 B：明文 124 字节 → `c536d0639fb2f24e2526ed558c463cf4` = md5(明文) ✅
2. 密文与明文**等长**（119↔119、124↔124），是流式异或而非分组密码填充。
3. `keystream = 明文 XOR 密文`：**同会话内不同明文的 keystream 完全一致**（119/119 字节对齐），跨会话不同。
   - 结论：会话级固定 keystream，形态等价于「固定 IV 的 AES-CTR」。
4. base64 前有一次 UTF-8/Latin-1 破坏：`Buffer.from(b64,'base64').toString('utf8')` 后逐字符 `charCodeAt(i)&0xff` 才是真实密文字节。

还原函数见 `scripts/envelope_probe.js`、`scripts/keystream_cmp.js`。

### 4.2 但服务端同时接受明文体

本地 Node 直接发 `{"sign":..., ...params}` 到 info → 返回 **485（不是 401/403）**，说明签名校验通过、只是要验证码。**外壳是 SDK 单方面加的，不是服务端强制的协议**。这条对后续方案很关键：一旦解决验证码，就不必再复现外壳加密。

### 4.3 响应侧也加密

info 200 的 wire body 是纯 base64 文本（内容却是 `application/json;charset=UTF-8`），客户端由 `_yundunxhr` 拦截器解密后交给业务代码。用请求侧 keystream 直接 XOR 解不出响应（已试，含 0~63 偏移扫描），响应侧 key/iv 或偏移不同，待子任务 A 定位。

---

## 5. SDK 三件套与脱壳

| 文件 | 原始大小 | 自解码后 | 挂载全局（真实页面实测） |
|---|---|---|---|
| `pceptor.js` | 152KB | 515KB | `_yundunxhr`、`base64js` |
| `preinforce2.js` | 107KB | 366KB | `fun`(object，无枚举键)、`base64js`、`jsdVipUserMark='dw'` |
| `pyuntu.js` | 172KB | 703KB | `regeneratorRuntime` |

页面加载顺序：`pceptor.js` → 业务 chunk → `preinforce2.js` → `pyuntu.js` → 阿里云验证码 SDK。

**脱壳方法**（`scripts/unpack.js`）：JS DUN PROTECT 的 VM 在运行时用 `eval` / `Function` 把源码还原后执行。在 vm 沙箱里接管 `eval` 与 `Function`，把每次还原出来的源码落盘即可，无需读字节码。

实测细节：

- `preinforce2.js` 在极简沙箱里能无异常跑完；
- `pceptor.js` 缺布局能力（`reading 'width'`）；
- `pyuntu.js` 真的在插入 `<style>`（`Couldn't find a style target`），需要真实 DOM/CSSOM 行为。

`_yundunxhr` 的关键特征：`String(_yundunxhr) === "function XMLHttpRequest() {\n    [native code]\n}"` —— 拦截器伪造了 native 外观，body 加密与响应解密就在这里。

---

## 6. 收口（上半场）

- **到达层级**：sign 到 S3（本地可复现、服务端认可）；info 数据到 S2（能被服务端理解，但被 485 拦在数据之外）。
- **当前路线**：R1（纯算法）已吃下 sign；info 需要 R3/R4（补环境运行原始 SDK）才能产出 `d`。
- **适用范围**：得物 PC 站 `www.dewu.com`，前端版本 `bcv=1.3.1.20260331`，2026-11-20 抓取。
- **结论强度**：sign 为「证明」；485/401/403 分层为「证明」；外壳结构（md5 前缀 + 会话 keystream）为「证明（结构层）」；`d` 生成机制为「观测」。
- **失效条件**：盐值变更、接口路径变更、`bcv` 版本升级导致 `d` 字段集变化、风控策略调整（例如把明文体也强制要求外壳）。
