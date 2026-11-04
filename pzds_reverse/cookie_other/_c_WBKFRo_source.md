# _c_WBKFRo 来源分析

## 结论

`_c_WBKFRo` 是 **阿里云设备指纹 SDK**（cloudauth）**纯客户端 JavaScript 生成**的 Cookie，通过 `document.cookie` setter 写入，不依赖任何 HTTP `Set-Cookie`。

---

## 写入方式

- **写入途径**: `document.cookie` setter（JS 端）
- **非**: CookieStore API / HTTP Set-Cookie

## 生成链路（完整调用栈）

```
HTMLScriptElement.i          ← jsvm_all.js 分发器 (script onload 回调)
    ↓
Object.yi                    ← deviceToken.min.js 模块导出入口
    ↓
bi(...)                      ← 收集设备指纹信息并组装
    ↓
ai(40)                       ← 生成 40 位随机字符串
    ↓
Math.random() * 62           ← 核心随机源
    ↓
document.cookie = name + "=" + value + "; " + attrs
```

## 关键脚本

| 脚本 | URL | 角色 |
|------|-----|------|
| `jsvm_all.js` | `https://cn-shanghai-aliyun-cloudauth.oss-cn-shanghai.aliyuncs.com/web_sdk_js/jsvm_all.js` | JSVM 加载器，动态创建 `<script>` 加载 deviceToken.min.js |
| `deviceToken.min.js` | `https://o.alicdn.com/yd-cloudauth/cloudauth-cdn/deviceToken.min.js` | 阿里云设备指纹 SDK，包含 `ai`/`bi`/`yi` 等核心函数 |

HTML 中通过 `<script data-n-head="ssr">` 静态引入 `jsvm_all.js`，再由 JSVM 动态加载 `deviceToken.min.js`。

## 核心生成函数

### `ai(n)` — 随机字符串生成器

```javascript
function ai(e) {
    var t = "", i = "...abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for (r = 0; r < e; r++) t += i.charAt(Math.floor(62 * Math.random()));
    return t;
}
```

- 字符集: `[a-zA-Z0-9]` (62 个字符)
- 长度: `40` 字符
- 随机源: **仅 `Math.random()`**，不使用 `crypto.getRandomValues`

### `si(e)` — 域名提取

从完整 URL 中提取域名部分，用于构造 Cookie 的 `domain` 属性。

### Cookie 写入代码

```javascript
document.cookie = e + "=" + t + "; " + n + o
// e = "_c_WBKFRo" (cookie 名)
// t = ai(40)        (40 位随机值)
// n, o = domain/path/expires 属性
```

## 依赖项总结

| 依赖 | 是否使用 | 说明 |
|------|---------|------|
| `Math.random()` | **是** | 唯一定义随机源，生成 40 字符 alphanumeric token |
| `Date.now()` | 否（仅 hook 自身触发） | 生成逻辑不依赖时间戳 |
| `crypto.getRandomValues` | **否** | 未调用 |
| `localStorage` | **否** | LS 操作均来自 jquery.min.js (WAF 测试)，与 token 无关 |
| `sessionStorage` | **否** | 同上 |

## Cookie 属性

| 属性 | 值 |
|------|-----|
| name | `_c_WBKFRo` |
| value | 40 位 `[a-zA-Z0-9]` 随机字符串（例: `Mn70zu1o8FofsaNHDA86M3WDqPWjdPYKXWOlnjN3`） |
| domain | `.pzds.com` |
| path | `/` |
| expires | 1 年（`Fri, 28 May 2027 03:25:48 GMT`） |

## 复现方法

```javascript
// 等效于 ai(40)
function generate_WBKFRo() {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < 40; i++) {
        result += chars.charAt(Math.floor(62 * Math.random()));
    }
    return result;
}
```

## 补充说明

- `_c_WBKFRo` 是阿里云设备指纹 SDK 生成的设备标识，用于云端反欺诈/风控
- 与 `ssxmod_itna`/`ssxmod_itna2` 无直接关系（那些来自另一套阿里云 WAF 系统）
- Token 值完全由 `Math.random()` 决定，可预测性取决于 JS 引擎的 PRNG 质量
