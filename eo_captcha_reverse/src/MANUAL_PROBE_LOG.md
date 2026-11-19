# 人工点击取证记录（2026-11-18 19:47–19:56）

授权：用户手动点击，主会话只读检测。未发送任何 verify。

## 三轮结果

| 轮次 | 现象 | 判读 |
|---|---|---|
| 1（19:47） | **用户手动点击后页面通过**，`page.title()` 变成文章标题（`…豆包验证码识别…_51CTO博客`） | 出口没被封；人手可以通过校验 |
| 1（同一轮的采样） | iframe 存活期间轮询到 `{"rp":0,"gi":0,"f":0,"tdc":"undefined","mk":[]}` | **widget 里 `window.TDC` 始终 undefined，SDK 没做任何 canvas/webgl/字体采集** |
| 2（19:52） | iframe 短暂出现后消失，title 仍是 `Security Verification` | widget 重建/未通过 |
| 3（19:55） | 整个 240s 内 **widget iframe 从未出现** | 停止当批（链路 K） |

## 两个关键结论

1. **人工点击能过**（第 1 轮标题变成了文章页）⇒ 站点没有封死这条出口，也不需要我们本地生成任何东西就很可能会过。
2. **抓不到浏览器基线**：通过那一轮里 `TDC` 根本没加载（`tdc: undefined`），`readPixels/getImageData/fonts` 全是 0。
   - 要么这个 widget 版本在本实例下走了**不带 tdc.js 的降级路径**（`verify` 的 `collect` 会是空/占位），
   - 要么 `tdc.js` 的加载被前面几十次 prehandle 触发限速而跳过。
   无论哪种，**"录制浏览器 TDC 采集值"这条路在当前状态下不可用**。

## 因此的路线判断

`problem-routing.md` 的 R5（页面出值、本地发送）已经在本项目里被验证可用：
`samples/capture3.json` 那次「浏览器出 collect + Node 发 verify」拿到 `errorCode=0` 与 ticket，
目标页随即返回第二层 JS（见 `e7_send_captured.mjs` 的输出）。

也就是说：
- **R3（纯本地补环境）**：卡在 216 块（1728 B）无法定位，且拿不到浏览器基线；继续投入性价比低。
- **R5（浏览器出值 + 本地采集）**：已被实测证明能到 S2/S3，只需要浏览器在关键时刻做一次校验，
  之后 30 天（`ticket_timeout=2592000`）内本地 HTTP 直接采集。

## 建议

1. 若要继续 R3：等冷却（数小时）或换出口后，重跑 `scripts/browser_probe_manual.py`，
   判据是 `frame1.hasTDC === 'function'`（现在连 iframe 都不出现，说明还没恢复）。
2. 若交付优先：按 R5 做采集器——浏览器过一次校验拿 cookie，本地用该 cookie 采集，
   交付说明里写清「依赖一次人工过验证，ticket 30 天有效」。
