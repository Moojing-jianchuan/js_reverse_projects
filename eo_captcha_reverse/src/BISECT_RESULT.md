# 二分定位结果：服务端到底校验哪些槽（2026-11-19 12:00–15:50）

## 实验方法

`tdc_key3` 打通 key 提取（3.5s/份）之后，可以做「金标准改槽」实验：

1. 浏览器会话拿到 collect（金标准，能过）+ 该会话的 tdc.js
2. `tdc_key3` 提 key → 解出明文
3. 本地 VM 用**同一份 tdc.js** 跑出明文
4. 把金标准明文里指定的槽替换成本地值 → 重新加密 → 提交
5. 看 `errorCode`：`0` = 这个槽不被校验；`12` = 被校验

## 逐槽结果（每行都是一次真实提交）

| 实验 | 替换的槽 | 结果 |
|---|---|---|
| exp1 | 无（仅 JSON 重建） | **0** |
| exp-canvas | canvas 深指纹槽 | **0** |
| exp-1 | `cd[1]`（10001） | **0** |
| exp-4/8/11/16/20 | 5 个 | **0** |
| exp-26/28/32/34/41 | 5 个 | **0** |
| exp-half1 | 前 10 个 | **0** |
| exp-all（14 个） | 全部 | **12** |
| exp-idx2（7 个） | 后半 7 个 | **12** |
| exp-8:11（3 个） | `43,45,46` | **12** |
| exp-8:10（2 个） | `45,46` | **12** |
| exp-8:9（1 个） | `45` | **0** |
| **exp-9:10（1 个）** | **`46`** | **12** |

## 定位到的槽：`"<flag>;<sid>"`

```
浏览器: "1;102223449"      ← flag=1, sid 与 prehandle 的 sid 参数一致
本地  : "0;1106021005"     ← flag=0（且 sid 是硬编码旧值）
```

**验证**：金标准里只把 `1` 改成 `0`（sid 不动）→ **立刻 `12`**。

⇒ 这一槽**确实被服务端校验**，且要求：
- `sid` = 本次 `prehandle` 的 `sid` 参数
- `flag` = `1`

## 但修好它仍然不过

用 `e76` 走「本地 VM 出 collect → key3 解密 → 把 `0;<sid>` 改成 `1;<sid>` → 加密 → 提交」：

```
[1b] sid = 1106021005
[3b] slot 46 -> 1;1106021005
[3b] collect (flag fixed) 4320 | replaced? true
[5] verify: {"errorCode":"12",...}
```

**仍是 12** ⇒ 除了 `flag;sid` 之外**还有别的校验项**。

## 已经能排除的（不必再花时间）

- canvas 深指纹（`_state:-2` 与否无关紧要）
- `cd[1]`（10001）、自动化分（22）、WebRTC IP、`"top"` vs `"iframe"`、父页面 URL、`unknown`、`sd.ep.m` 之类
- 明文 JSON 的序列化格式（紧凑 / 带空格都一样过）
- `Worker` / `SharedWorker` / `MessageChannel` / `createImageBitmap` / `crypto.subtle`（TDC 全没调用）

## 这一轮顺手修掉的真 bug

`cd[36]`：SDK 用 `Error().stack` 取执行位置，正则按 Firefox 的 `fn@url:line:col` 写；
Node 的栈是 `    at fn (file:1:2)`，`match()` 返回 null → `null[0]` 抛 TypeError → 这个 TypeError 被当指纹写进载荷。
`env.mjs` 新增 `createContext(w, tdcUrl)`（`Error.prepareStackTrace` 渲染 Firefox 格式 + 真实脚本 URL），
修复后该槽与浏览器**逐字节一致**（槽位匹配 47 → 48 / 72）。

## 下一步

1. **继续二分剩下的**：现在是「`flag;sid` 已修好，但仍 12」，说明还有第 2 个校验项。
   最可能是 `sd` 里的 `tdc_perf`（我们 `{fi:235,pi:215,gd:58}` vs 浏览器 `{fi:81,pi:41,gd:116}`）或
   某个「组合条件」（两个槽同时不对才判失败）。
2. **优先做一次 `tdc_perf` 实验**：金标准里只改 `sd.tdc_perf` → 看是否 12。
3. 若 `tdc_perf` 也不算，则改为「本地 collect + 逐个把金标准的值换回来」，从 12 往 0 收敛。
