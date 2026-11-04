# WAF 请求流程分析

## 一、浏览器真实流程（MCP 抓包验证，2026-05-27）

```
页面加载 goodsList/7/6
  │
  ├─ <script src="jsvm_all.js"> 同步执行
  │   ├─ dB = document.currentScript（定位当前 script → jQuery CDN）
  │   ├─ AA() → 生成 seed: __00b204e9800998__（仅一次，后续不变）
  │   ├─ 注册行为监听器（mousemove/keyup/click...）
  │   └─ 首次 AG() → Gg.x 编码 → GC() 写入 ssxmod_itna / itna2
  │
  ├─ 前端 nuxt.js 发起 goodsPublic/page
  │   │  Cookie: acw_tc + ssxmod_itna + ssxmod_itna2  ← 初始 cookie
  │   │  Headers: Sign, Random, PZTimestamp, sec-ch-ua...
  │   │
  │   ├─ ✅ cookie 可信 → 返回商品 JSON
  │   │
  │   └─ ❌ cookie 不可信 → 返回 renderData (WAF 挑战页)
  │       ├─ _waf_bd8ce2ce37 = "..."          ← waf_value
  │       ├─ _waf_a86dfdc5f2 = Date.now()     ← waf_ts
  │       ├─ localStorage: _waf_bd8ce2ce37 = "value||expiry"
  │       │                _waf_a86dfdc5f2 = "ts||expiry"
  │       ├─ 加载额外 WAF JS + 滑块验证码
  │       ├─ WAF JS 调用 SDK 内部逻辑生成 decode__1174
  │       └─ 前端用 decode__1174 + u_atoken/u_asig 重试 → 成功
  │
  └─ 关键观察：
      - __00b204e9800998__ (seed/m_value) 整个流程中从未改变
      - _waf_bd8ce2ce37 (waf_value) 存入 localStorage（非 _waf_3d7faf79）
      - 两次请求的 ssxmod cookie 前缀相同但 body 不同（中间有 AG() 触发）
```

## 二、decode__1174 生成公式

### 2.1 完整公式

```
decode__1174 = "214d4f07715-" + O(ag)

ag = [ag0, ag1, ag2, ag3, ag4, ag5, ag6].join("|")

ag0 = a2(a0(ao))     ← ao 含 body（case '12' 在 case '1' 之前追加）
ag1 = a2(a0(aI))     ← aI 不含 body
ag2 = w()            ← PRNG 依赖，含 H() 调用栈指纹
ag3 = Date.now()
ag4 = waf_token      ← 服务端 renderData._waf_bd8ce2ce37
ag5 = waf_ts         ← 服务端 Ali-Swift-Global-Savetime × 1000
ag6 = M()            ← localStorage __00b204e9800998__ 的原始 hex 值
```

### 2.2 a4() 函数 case 执行顺序

```
["6","10","7","12","11","1","2","9","4","3","8","0","5"]
```

| # | case | 操作 |
|---|------|------|
| 0 | 6 | 初始化：获取 window 引用 |
| 1 | 10 | 获取 HTTP method |
| 2 | 7 | ao/aI 构造：a0(ao) = encodeURIComponent(waf+method+sep+url) |
| 3 | 12 | body 追加到 ao：ao += sdkBodyEncode(body)，ao ≠ aI |
| 4 | 11 | Math.random = D(l)：安装 LCG (注：Z 变量仍持有原生 Math.random) |
| 5 | 1 | ag = a0(ao)：使用含 body 的 ao |
| 6 | 2 | aS = ag：保存 |
| 7 | 9 | 组装 ag：ag0=a2(ag), aS=a0(aI), ag1=a2(aS), ag2=w() |
| 8 | 4 | av = O(ag) |
| 9 | 3 | 构造最终 URL |
| 10 | 8 | 发请求 |
| 11 | 0 | 清理 |
| 12 | 5 | 恢复 Math.random |

### 2.3 K 函数 (a2 内部)

```javascript
function K(input) {
    var aa = Math.floor(1 + ((26 * Math.random()) % 7));  // 消耗 LCG 1 次
    var a9;
    for (var i = 0; i < aa; i++) {
        a9 = Math.floor(1 + ((26 * Math.random()) % 7));  // 消耗 LCG aa 次
    }
    // a9 = LAST 循环值
    for (var j = 0; j < input.length; j++) {
        result.push(R[(parseInt(input[j], 16) + a9) % 16]);
    }
}
// a2(input) = K(input).join('').toLowerCase()
// pre/post 调用: Date.now() — 不消耗 LCG
// R 表: ["0","1","2","3","4","5","6","7","8","9","A","B","C","D","E","F"]
```

### 2.4 D(l) LCG 算法

```
T_next = (1436544 × T + 1051861197) % 3074446023
output = T / 3074446023

T0 = 2124388304  ← 来自 D 函数 case '0' 求值，非 4051901044
a  = 1436544     ← 硬编码
c  = 1051861197  ← l 变量，跨会话不变
m  = 3074446023  ← 硬编码
```

### 2.5 w() 函数

```javascript
function w(ctx) {
    var a8 = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];  // u() = 17 zeros
    
    // bit0, bit3 用原生 Math.random (浏览器 Z 变量), 不消耗 LCG
    a8.push(nativeRandom() > 0.5 ? 1 : 0);   // bit0
    a8.push(1);                                // bit1
    a8.push(timestamp / 1000 % 2);             // bit2
    a8.push(nativeRandom() > 0.5 ? 1 : 0);   // bit3
    
    a8 = a8.concat(H_features);               // 8 elements
    
    // Fisher-Yates: 29 次 LCG 调用 (Math.random 即 q 变量)
    for (var i = a8.length - 1; i >= 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        swap(a8[i], a8[j]);
    }
    
    // bitmask
    var bitmask = 0;
    for (var i = 0; i < a8.length; i++) bitmask |= (a8[i] ? 1 : 0) << i;
    return String(bitmask);
}
```

### 2.6 H() 调用栈指纹

H() 通过故意抛错获取 Error.stack，正则提取调用栈词条，z() 哈希后去重返回。与 8 个 Chrome 期望 hash (e 数组) 对比生成 features。

浏览器实测: 21 个调用栈 hash，仅 2 个命中 → features = [0,0,0,1,1,0,0,0]

Node 无法复制相同调用栈，H() 直接返回固定值模拟相同 features。

### 2.7 LCG 消耗总览

| 调用者 | LCG 消耗 | 备注 |
|--------|----------|------|
| a2(ag) - aa0 | 1 次 | aa0 = floor(1+26*lcg%7) |
| a2(ag) - loop | aa0 次 | 循环 aa0 次 |
| a2(aS) - aa1 | 1 次 | |
| a2(aS) - loop | aa1 次 | |
| w() - bit0 | **0 次** | 用原生 random (Z) |
| w() - bit3 | **0 次** | 用原生 random (Z) |
| w() - Fisher-Yates | 29 次 | 数组 29 元素 |
| **总计** | **5 + 29 = 34 次** | |

## 三、itna / itna2 Cookie 构造

### 3.1 itna

```
itna = '1-' + Gg.x([
  dM[0..22].join('^'),                          // 23 字段环境指纹
  [a, g.len, u.len, e.len].join('^'),            // 行为摘要 "P^0^0^0"
  dK[0..4].join('^'),                             // 5 字段 env 检测
  Gi, A8, dh.join('^'), GE(dl), dL.join('^')      // 其他
].join('^'), true)
// 共 46 字段
```

### 3.2 itna2

```
itna2 = '1-' + Gg.x(
  dM[0..3].join('^') + '^' +                    // seed^version^ts^counter
  [kM.a, kM.j, kM.g.join('|'), kM.S, kM.u.join('|'), kM.e.join('|'),
   kM.O, GR, Gf, Gi, A8, GY, Gp, kM.c, Gn, Gr].join('^'), true
)
```

### 3.3 浏览器首次加载 Cookie 特征

- g.len=0, u.len=0, e.len=0（零用户交互）
- kM.O=0（无键盘事件）
- dK[3]=-1|0|0|0|0（DOM 未就绪）
- itna ≈ 459 chars, itna2 ≈ 108 chars

### 3.4 Cookie 修复清单

| 修复项 | 修复前 | 修复后 |
|--------|--------|--------|
| kM.g.len (移除 mousemove 注入) | 1 | 0 |
| kM.e.len (移除 keyup 注入) | 1 | 0 |
| kM.O (hook_join 强制改 0) | 1 | 0 |
| dK[3] DOM counts (移除假 DOM) | 137\|49\|24\|23\|0 | 0\|0\|0\|0\|0 |

## 四、Gg.x 编码器

```javascript
// 自定义 LZ78 + variable-bit + base64
// Alphabet: "DGi0YA7BemWnQjCl4+bR3f8SKIF9tUz/xhr2oEOgPpac=61ZqwTudLkM5vHyNXsVJ"
// useUnderscore=true → 替换 '+' 为 '_'
// 输出前缀: '1-'
```

## 五、关键修复记录 (2026-05-28)

### 5.1 LCG T0 值修正

- **错误值**: 4051901044（SUMMARY 旧数据）
- **正确值**: 2124388304（浏览器 D 函数 case '0' 公式求值）
- **发现方法**: 浏览器断点 case '11' 后采样 Math.random()，对比 Node 发现序列完全不同

### 5.2 w() bit0/bit3 随机源修正

- **问题**: Node w() 的 bit0/bit3 使用 Math.random (LCG)，额外消耗 2 次 LCG
- **浏览器行为**: bit0/bit3 使用 Z 变量（闭包捕获的原生 Math.random），不消耗 LCG
- **发现方法**: 在浏览器 Hook LCG 函数统计 34 次调用，分析确认 5 次 a2 + 29 次 Fisher-Yates = 34，无 base bits 消耗
- **修复**: w() bit0/bit3 改用 `_nativeRandom`（在 installGlobalLCG 前保存的原生 Math.random）

### 5.3 H() features 修正

- **问题**: Node H() 返回全部 8 个 e 数组值 → features = [1,1,1,1,1,1,1,1]
- **浏览器行为**: 21 个调用栈 hash，仅 2 个命中 → features = [0,0,0,1,1,0,0,0]
- **修复**: H() 返回数组仅包含 e[3]=2887643941 和 e[4]=918569231，再混合其他值

### 5.4 K 函数验证

- 浏览器 K 源码和 Node makeK 完全一致
- aa = floor(1+26*Math.random()%7)，loop aa 次，使用 **LAST** a9
- a2 的 pre/post 调用为 Date.now()，不消耗 LCG
- R 表: ["0","1","2","3","4","5","6","7","8","9","A","B","C","D","E","F"]

## 六、验证结果

### 6.1 ag 字段逐字段对比

使用同一组 waf_token/waf_ts/body/m_value，浏览器断点 aB=8 捕获 ag 后与 Node buildAg() 输出对比：

| 字段 | 浏览器 | Node | 匹配 |
|------|--------|------|------|
| ag0 | 868a888675868a88 | 868a888675868a88 | ✅ |
| ag1 | a7a7243359a7a724 | a7a7243359a7a724 | ✅ |
| ag2 | 75628712 | 75628712 | ✅ |
| ag3 | 1780028323397 | 1780028323397 | ✅ |
| ag4 | 5y1kjX8uJ0... | 同 | ✅ |
| ag5 | 1780026200801 | 同 | ✅ |
| ag6 | 1766246849a... | 同 | ✅ |

### 6.2 端到端测试

test.py 二次请求返回 `{"success":true,"code":"SUCCESS"}` — WAF 通过。

## 七、test.py vs 浏览器流程差异

| 步骤 | 浏览器 | test.py | 状态 |
|------|--------|---------|------|
| 1. 生成 cookie | SDK 生成 → seed 写入 localStorage | `generate_ssxmod_cookies()` → Node 子进程 | ✅ |
| 2. 获取 acw_tc | 前端自动 | `get_acw_tc()` | ✅ |
| 3. 首次请求 | POST page (无 decode) | 同左 | ✅ |
| 4. 提取 waf | renderData._waf_bd8ce2ce37 | 同左 | ✅ |
| 5. m_value | localStorage `__00b204e9800998__` | ssxmod_gen 提取 `\|\|` 前的值 | ✅ |
| 6. decode__1174 | WAF JS 调用 a4() | `_generate_decode_1174()` | ✅ |
| 7. 二次请求 | POST page?decode__1174 | 同左 | ✅ |

## 八、文件结构

```
pzds_reverse/
├── decode_1174/
│   ├── jsvm_all_new.js                       # 浏览器 WAF SDK
│   ├── generate_decode_1174_full.js           # Node 离线 decode 生成（已修复）
│   ├── decode_1174_ast.js                     # AST 反混淆版本
│   ├── browser_trace.json                     # 浏览器断点捕获数据
│   └── SUMMARY.md                             # decode 技术总结
├── ssxmod/
│   ├── 1.js / 1_ast.js                        # ssxmod SDK
│   ├── env_patch.js                           # 浏览器环境补丁（已修复 g.len/dK[3]）
│   ├── hook_join.js                           # Array.join hook (kM.O 强制置 0)
│   ├── run_with_env.js                        # 运行入口（已禁用行为注入）
│   └── NODE_BROWSER_DIFF_REPORT.md            # 环境对齐报告
├── ssxmod_gen.py    # → itna, itna2, m_value
├── waf.py           # decode__1174 生成 + WAF 请求
├── test.py          # 端到端测试 ✅ PASS
├── acw.py / sign.py
└── WAF_FLOW_ANALYSIS.md                       # 本文档
```

## 九、新 Agent 接手指南

### 9.1 快速验证当前状态

```bash
cd pzds_reverse
python test.py
```

预期输出：`"success":true,"code":"SUCCESS"` 且有商品 JSON 数据。如果返回 `<textarea id="renderData">` 说明某层验证失败。

### 9.2 参数变化时的排查顺序

**P0: 先确认哪个环节失败**

```bash
# 1. 单独测 cookie 生成
cd ssxmod && node run_with_env.js
# 看 [RESULT] itna/itna2 长度。浏览器首次加载 itna≈459, itna2≈108

# 2. 单独测 decode 生成（用已知有效的 waf_token）
node -e "var m=require('./decode_1174/generate_decode_1174_full.js');
m.installGlobalLCG(0); 
var ctx={ao:'...',aI:'...',waf_token:'...',waf_ts:'...',m_value:'...',timestamp:Date.now(),seed:0};
console.log(m.buildAg(ctx).ag);"
```

**P1: Cookie 变了 → 排查 env_patch.js**

```
对比 NODE_BROWSER_DIFF_REPORT.md 中的字段清单。
在浏览器设断点: inject_before_load hook Array.prototype.join('^') 抓 itna 明文。
对比 Node: cd ssxmod && node run_with_env.js 看 [ITNA2_CAPTURE] 的 fullPayload。
```

**P2: decode__1174 变了 → 排查 LCG / a0 / a2 / w**

```
在浏览器控制台设断点到 a4() 函数的 case '11' (Math.random = D(l)) 之后：
1. 采样 Math.random() 前 5 个值 → 确认 LCG (T0, c, a, m) 是否改变
2. Step 到 case '9' 后读 ag 变量 → 拿到浏览器 ag0-ag6
3. 用同样参数跑 Node buildAg() → 逐字段对比

Node cmp 脚本模板:
  var built = mod.buildAg({ao, aI, waf_token, waf_ts, m_value, timestamp, seed:0});
  console.log(built.fields); // {ag0, ag1, ag2, timestamp, waf_token, waf_ts, ag6}
```

**P3: LCG 参数变了**

```
浏览器断点 case '11' 后:
  D.toString() → 解出 T0 (case '0') 和 m (case '1')
  l → 增量 c

更新 generate_decode_1174_full.js:
  _Dl_T0 = <新 T0>n;
  _Dl_c = <新 c>n;
```

**P4: a2/K 函数变了**

```
浏览器 a2.toString() → 对比 Node makeK
关注: aa 算法、loop 中用 first/last a9、pre/post Date.now() 调用
```
### 9.3 MCP 浏览器调试常用操作

```
# 设断点
mcp__js-reverse__set_breakpoint_on_text({ text: "Math.random = D(l)" })

# 暂停时获取变量
mcp__js-reverse__evaluate_script({ function: "() => { return ag; }" })

# 单步执行
mcp__js-reverse__step({ direction: "over" })

# 注入持久 hook（跨页面导航存活）
mcp__js-reverse__inject_before_load({ script: "..." })

# 搜索动态脚本（搜不到时，dynamic script id 每次变化）
mcp__js-reverse__search_in_sources({ query: "...", urlFilter: "jquery" })
```

### 9.4 关键常量速查

| 常量 | 值 | 位置 |
|------|-----|------|
| LCG T0 | 2124388304 | generate_decode_1174_full.js:330 |
| LCG a | 1436544 | 硬编码 |
| LCG c | 1051861197 | generate_decode_1174_full.js:327 |
| LCG m | 3074446023 | 硬编码 |
| R 表 | ["0"-"9","A"-"F"] | generate_decode_1174_full.js:18 |
| Gg.x alphabet | "DGi0YA7Bem..." | 1_ast.js:641 |
| decode__1174 prefix | "214d4f07715-" | generate_decode_1174_full.js:147 |
| e 数组 (H expected) | [364329469,3357003361,287272213,2887643941,918569231,315509683,829934165,2025428912] | generate_decode_1174_full.js:417 |
| waf_token key | `_waf_bd8ce2ce37` | renderData 中提取 |
| waf_ts key | `Ali-Swift-Global-Savetime` × 1000 | 响应头 |
| m_value key | `__00b204e9800998__` (取 `\|\|` 前) | localStorage |
