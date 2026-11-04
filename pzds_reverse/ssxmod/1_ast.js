/*
 * 1_ast.clear.annotated.js
 *
 * 二次 AST 反混淆/注释版。
 * 处理内容：
 *   1) 原始字符串表 k/A/WV 的结果已经被上一轮 pass 静态内联，本文件去掉巨大字符串表，仅保留 WV 引用占位。
 *   2) 保留 Date.now / Math.random / 事件采集 / localStorage / cookie 写入等运行时语义，不做危险常量折叠。
 *   3) 在 ssxmod_itna / ssxmod_itna2 生成链路、环境指纹采集、行为数据采集处补充中文注释。
 *
 * 注意：qa 的真实运行时值按你已确认的结果固定为 116；当前文件重点用于阅读和继续扣链路。
 */
(function aeyaNG() {
  'use strict';

  // 原始脚本的字符串解码器 k/WV 已经在 1_ast.js 中完成静态内联。
  // 这里保留占位，避免后续死别名 `var xx = WV` 引用报错；正常情况下不应再被调用。
  var qa = 116;
  function k() {
    throw new Error('Unexpected call to removed string decoder k/WV; strings should already be inlined.');
  }
  var Wl = k;

  !function () {
      'use strict';

      // ==================== 全局常量 / WAF 配置 / 字符串已内联区域 ====================
      // WV 是原始字符串解码器别名；当前只剩死别名引用，真实字符串已在代码中明文出现。
      var WV = k;

      // 上一轮 dispatcher/string/object literal pass 已经把 dE 调度对象全部内联，原 dE 大对象已删除。
      // ==================== 基础配置与关键常量 ====================
      // dq/di: 与挑战/会话相关的 cookie/query 字段名集合。
      // dp: websdk 版本，后续会进入 ssxmod_itna 的环境字段。
      // dI: localStorage 中保存随机种子/初始 token 的 key。
      // dl: localStorage 中保存服务端下发 _waf_3d7faf79 的 key。
      var dq = "alichlgref",
        di = [dq, "acw_sc__dysigchl", "u_atoken", "u_aref", "u_asession", "u_asig"],
        dJ = "CLOSE_CAPTCHA",
        dr = "CAPTCHA_VERIFY_SUCCESS",
        dH = "CAPTCHA_VERIFY_FAIL",
        dN = {};
      dN.W = false;
      // 命名提示：dn=window, dR=document, df=navigator。
      const dn = window,
        dR = dn.document,
        df = dn.navigator,
        dp = "2.3.18d",
        dY = "xdomain",
        dI = "__00b204e9800998__",
        dl = "_waf_3d7faf79",
        dV = "captchaType",
        dQ = dN,
        d = new Date().getTime(),
        dz = "Aliyun-WAF-Client-Signal",
        dm = "clientSignal";
      var dF,
        ds = false;
      dF = df.userAgent || df.vendor || dn.opera, (/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(dF) || /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(dF.substr(0, 4))) && (ds = true);
      var dB = function () {
        var WQ = WV,
          kZ = document.currentScript;
        if (!kZ) {
          for (var kD = dR.getElementsByTagName("script"), kM = 0; kM < kD.length; ++kM) if ("6cc076e6727a87d6" == kD[kM].getAttribute('id')) {
            kZ = kD[kM];
            break;
          }
        }
        return kZ;
      }();
      // boolArrayToBitmask：把一组真假值压成 bitmask，用于 webdriver/phantom/自动化痕迹检测结果。
      function dZ(kZ) {
        var Wz = WV;
        for (var kD = 0, kM = 0; kM < kZ.length; ++kM) kD |= (kZ[kM] ? 1 : 0) << kM;
        return kD;
      }
      // throttle：按毫秒间隔限流执行。行为事件与 cookie 刷新都会经过它。
      function dD(kZ, kD) {
        var aJ = {
            dT: 0x20f,
            dx: 0x68a,
            dC: 0x436
          },
          ai = {
            dT: 0x6a3
          },
          kM = {
            'zQrTN': function (kh, kL) {
              var Wm = k;
              return kh - kL;
            }
          };
        let kK = 0;
        return function () {
          var Wo = k,
            kh = arguments,
            kL = Date.now();
          kM.zQrTN(kL, kK) >= kD && (kK = kL, kZ.apply(this, kh));
        };
      }
      dQ[dY] = true, dB && ("false" === dB.getAttribute(dY) && (dQ[dY] = false), "true" === dB.getAttribute("docReferer") && (dQ.W = true), dQ[dV] = dB.getAttribute(dV), dQ[dm] = dB.getAttribute(dm));
      var dM = [],
        dK = [],
        dh = [],
        dL = [];
      const dt = null != dn.matchMedia;
      var dU, dw, dv;
      // detectAutomationFlags：检测 webdriver、phantom、selenium cdc_*、domAutomation 等自动化痕迹。
      function dy() {
        var aR = {
            dT: 0x5a4
          },
          aN = {
            dT: 0x6b4,
            dx: 0x843,
            dC: 0x7a8,
            dg: 0x218,
            du: 0x6b1,
            dc: 0x7f6,
            da: 0x546,
            dj: 0x7f6,
            dS: 0x550,
            de: 0x6b1,
            dO: 0x7f6,
            dE: 0x7b7
          },
          WF = WV,
          kZ = {};
        kZ.roiDc = function (ky, kX) {
          return ky == kX;
        };
        var kD = kZ,
          kM = '';
        try {
          kM = dR.documentElement.getAttribute && dR.documentElement.getAttribute("webdriver");
        } catch (ky) {}
        var kK = 0;
        if (dn.hasOwnProperty && Object.keys(dR).forEach(function (kX) {
          var Ws = WF,
            kb = dR[kX];
          (0 == kX.indexOf("$cdc_asdjflasutopfhvcZLmcfl_") || kb && kb.hasOwnProperty("idPrefix_") && kb.hasOwnProperty("cache_") && kb.hasOwnProperty("nextId_")) && (kK = 1);
        }), 1 != kK) {
          var kh = new RegExp("^cdc_[a-zA-Z0-9]{22}_");
          Object.keys(dn).forEach(function (kX) {
            var WB = WF;
            ("$chrome_asyncScriptInfo" == kX || kh.test(kX)) && (kK = 1);
          });
        }
        var kL = new Date(),
          kt = 0;
        kL.toString = function () {
          var WZ = WF;
          if (kD.roiDc(2, ++kt)) return '';
        }, dU && dU(kL);
        var kU,
          kw = kt > 1 ? 1 : 0;
        const kv = [];
        return kv.push(kw), kv.push(df.webdriver), kv.push(kK), kv.push(dn._phantom), kv.push(dn.callPhantom), kv.push(dn.phantom && dn.phantom.cookiesEnabled), kv.push(dn.spawn), kv.push(dn.emit), kv.push(kM), kv.push(dn.Buffer), kv.push(dn.domAutomation), kv.push(dn.webdriver), kv.push(dn.__webdriver_script_fn), kv.push(dn.fxdriver_id), kv.push(dn.__fxdriver_unwrapped), kv.push(dn.ClientUtils), kv.push(dn.__nightmare), kU = dZ(kv), dy = function () {
          return kU;
        }, kU;
      }
      // simpleHash32：32 位字符串滚动 hash。用于本地随机 token、canvas/webgl 等指纹压缩。
      function dX(kZ, kD, kM) {
        var WD = WV;
        for (var kK = 0, kh = kD, kL = kZ.length, kt = kM || 1; kh < kL;) kK = (kK << 5) - kK, kK += kZ.charCodeAt(kh), kK >>>= 0, kh += kt;
        return kK;
      }
      dn.console && (dU = dn.console.log.bind(dn.console), dw = dn.console.debug.bind(dn.console), dv = dn.console.clear.bind(dn.console));
      const db = function (kZ) {
        var as = {
            dT: 0x2eb,
            dx: 0x1bf
          },
          aF = {
            dT: 0x45e,
            dx: 0x235,
            dC: 0x701
          },
          az = {
            dT: 0x182,
            dx: 0x60b,
            dC: 0x701
          },
          WM = WV,
          kD = {
            'AugIY': function (kP) {
              return kP();
            },
            'kLcWb': function (kP, W0) {
              return kP != W0;
            }
          },
          kM,
          kK = [],
          kh = false,
          kL = dR.documentElement,
          kt = kL.doScroll,
          kU = "DOMContentLoaded",
          kw = "addEventListener",
          kv = "onreadystatechange",
          ky = "readyState",
          kX = (kt ? /^loaded|^c/ : /^loaded|c/).test(dR[ky]);
        function kb(kP) {
          var WK = WM;
          for (kX = 1; kP = kK.shift();) kP();
        }
        return dR[kw] && dR[kw](kU, kM = function () {
          var Wh = WM;
          dR.removeEventListener(kU, kM, kh), kD.AugIY(kb);
        }, kh), kt && dR.attachEvent(kv, kM = function () {
          var WL = WM;
          /^c/.test(dR[ky]) && (dR.detachEvent(kv, kM), kD.AugIY(kb));
        }), kZ = kt ? function (kP) {
          var ao = {
              dT: 0x6a7
            },
            Wt = WM;
          kD.kLcWb(self, top) ? kX ? kP() : kK.push(kP) : function () {
            var WU = Wt,
              W0 = {
                'xEejR': function (W1, W2) {
                  return W1(W2);
                }
              };
            try {
              kL.doScroll("left");
            } catch (W1) {
              return setTimeout(function () {
                var Ww = WU;
                W0.xEejR(kZ, kP);
              }, 50);
            }
            kD.AugIY(kP);
          }();
        } : function (kP) {
          var Wv = WM;
          kX ? kP() : kK.push(kP);
        };
      }();
      var dP = false;
      function G0(kZ) {
        var Wy = WV,
          kD = dR.createElement("style");
        kD.type = "text/css";
        try {
          kD.appendChild(dR.createTextNode(kZ));
        } catch (kM) {
          kD.styleSheet.cssText = kZ;
        }
        return kD;
      }
      function G1() {
        var WX = WV;
        return dR.head || dR.getElementsByTagName("head")[0];
      }
      function G2(kZ, kD) {
        var Wb = WV;
        dR.addEventListener ? dR.addEventListener(kZ, kD, true) : dR.attachEvent && dR.attachEvent('on' + kZ, kD);
      }
      function G3(kZ) {
        var WP = WV,
          kD = kZ.parentNode;
        kD && kD.removeChild(kZ);
      }
      !function () {
        var T0 = WV,
          kZ = dR.createElement("script");
        dn.aliyun_csp_inline_test_func = kZ.text = "window.aliyun_csp_inline_test = 1;aliyun_csp_inline_test_func()";
        const kD = G1();
        var kM = kD.firstChild;
        const kK = function () {
          var T1 = T0;
          dn.aliyun_csp_inline_test && (dP = true, delete dn.aliyun_csp_inline_test), G3(kZ), delete dn.aliyun_csp_inline_test_func;
        };
        dn.aliyun_csp_inline_test_func = kK, kD.insertBefore(kZ, kM), setTimeout(function () {
          kK();
        }, 200);
      }();
      var G4 = Object.prototype.toString;
      Object.prototype.hasOwnProperty;
      function G5(kZ) {
        var T2 = WV;
        return null === kZ ? "null" : void 0 === kZ ? "undefined" : G4.call(kZ).slice(8, -1).toLowerCase();
      }
      function G6(kZ) {
        var T3 = WV;
        return "array" === G5(kZ);
      }
      function G7(kZ) {
        var T4 = WV;
        return "object" === G5(kZ);
      }
      function G8(kZ) {
        var T5 = WV;
        return "function" === G5(kZ);
      }
      // resolveWritableCookieDomain：探测当前可写 cookie domain，后续 GC 写 cookie 会使用。
      function G9() {
        var T6 = WV,
          kZ = {};
        kZ.CZoOt = function (kK, kh) {
          return kK - kh;
        }, kZ.egTUZ = "_aliyunwaf_test_cookie=test; domain=.", kZ.jbauq = function (kK, kh) {
          return kK !== kh;
        }, kZ.wVdmo = function (kK, kh) {
          return kK + kh;
        }, kZ.UMcvo = "_aliyunwaf_test_cookie=; domain=.", kZ.JFNZF = "; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        var kD = kZ,
          kM = dR.location.host.split(':')[0];
        try {
          const kK = function () {
            var T7 = T6;
            const kh = dR.location.host.split(':')[0].split('.');
            let kL = null;
            for (let kt = kD.CZoOt(kh.length, 2); kt >= 0; kt--) {
              const kU = kh.slice(kt).join('.');
              if (dR.cookie = kD.egTUZ + kU + "; path=/", kD.jbauq(-1, dR.cookie.indexOf("_aliyunwaf_test_cookie=test"))) {
                kL = kU, dR.cookie = kD.wVdmo(kD.UMcvo + kU, kD.JFNZF);
                break;
              }
            }
            return kL;
          }();
          kK && (kM = kK);
        } catch (kh) {}
        return G9 = function () {
          return kM;
        }, kM;
      }
      function Gd(kZ) {
        var T8 = WV,
          kD,
          kM = dR.createElement("div");
        return kM.innerHTML = "<a></a>", kM.firstChild.href = kZ, kM.innerHTML = kM.innerHTML, (kD = kM.firstChild).href = kM.firstChild.href, {
          'protocol': kD.protocol,
          'host': kD.host,
          'hostname': kD.hostname,
          'port': kD.port,
          'pathname': '/' === kD.pathname.substr(0, 1) ? kD.pathname : '/' + kD.pathname,
          'search': kD.search,
          'hash': kD.hash,
          'T': kD.href
        };
      }
      function GG(kZ, kD) {
        var T9 = WV;
        if (0 == Object.keys(kD).length) return kZ;
        var kM,
          kK = '';
        for (kM in kD) kK += encodeURIComponent(kM) + '=' + encodeURIComponent(kD[kM]) + '&';
        if (kK = kK.slice(0, kK.length - 1), 0 == kZ.length) kZ = '?' + kK;else {
          for (var kh = kZ.slice(1).split('&'), kL = [], kt = Object.keys(kD), kU = 0; kU < kh.length; kU++) kM = dn.decodeURIComponent(kh[kU].split('=', 1)[0]), -1 == kt.indexOf(kM) && kL.push(kh[kU]);
          kZ = '?' + (0 == kL.length ? '' : kL.join('&') + '&') + kK;
        }
        return kZ;
      }
      function GA(kZ) {
        var Td = WV;
        return !(!kZ.protocol || "data:" != kZ.protocol && "blob:" != kZ.protocol);
      }
      function Gk(kZ, kD) {
        var TG = WV;
        const kM = GA(kZ);
        var kK = kZ.pathname;
        return kM && 0 == kK.indexOf('/') && (kK = kZ.pathname.slice(1)), kZ.protocol + (kM ? '' : '//' + kZ.host) + kK + kZ.search + (kD ? '' : kZ.hash);
      }
      function GW(kZ, kD) {
        var TA = WV;
        if (dn.top !== dn.self) return true;
        var kM = Gd(kZ);
        if (GA(kM)) return false;
        var kK = Gd(kD);
        return !(kM.host == kK.host && kM.protocol == kK.protocol);
      }
      function GT(kZ, kD) {
        var j9 = {
            dT: 0x704,
            dx: 0x741,
            dC: 0x21d,
            dg: 0x3a2,
            du: 0x23b,
            dc: 0x2e6,
            da: 0x302,
            dj: 0x3a2,
            dS: 0x5e7,
            de: 0x3a2,
            dO: 0x6b4,
            dE: 0x302,
            dq: 0x302,
            di: 0x782,
            dJ: 0x5d4,
            dr: 0x6b1,
            dH: 0x7f6,
            dN: 0x7bd,
            dn: 0x1bf
          },
          Tk = WV;
        if (!kD || "string" != typeof kD) return null;
        var kM = function (kK) {
          var TW = Tk,
            kh = {};
          if (!kK || "string" != typeof kK) return kh;
          var kL = Gd(kK).search;
          if (!kL || 0 === kL.length) return kh;
          if ('?' === kL.charAt(0) && (kL = kL.substring(1)), 0 === kL.length) return kh;
          for (var kt = kL.split('&'), kU = 0; kU < kt.length; kU++) {
            var kw = kt[kU];
            if (kw && 0 !== kw.length) {
              var kv,
                ky,
                kX = kw.indexOf('=');
              -1 === kX ? (kv = kw, ky = '') : (kv = kw.substring(0, kX), ky = kw.substring(kX + 1));
              try {
                kv = dn.decodeURIComponent(kv);
              } catch (kP) {}
              try {
                ky = dn.decodeURIComponent(ky);
              } catch (W0) {}
              if (kh.hasOwnProperty(kv)) {
                var kb = kh[kv];
                G6(kb) ? kb.push(ky) : kh[kv] = [kb, ky];
              } else kh[kv] = ky;
            }
          }
          return kh;
        }(kZ);
        return kM.hasOwnProperty(kD) ? kM[kD] : null;
      }
      function Gx(kZ, kD) {
        var TT = WV,
          kM = "0|1|3|5|4|2|6".split('|'),
          kK = 0;
        while (!![]) {
          switch (kM[kK++]) {
            case '0':
              if (-1 == kZ.indexOf(kD + '=')) return kZ;
              continue;
            case '1':
              var kh = Gd(kZ);
              continue;
            case '2':
              for (var kL = [], kt = 0; kt < kU.length; ++kt) 0 == kU[kt].indexOf(kD + '=') || kL.push(kU[kt]);
              continue;
            case '3':
              if (!kh.search) return kZ;
              continue;
            case '4':
              if (0 == kU.length) return kZ;
              continue;
            case '5':
              var kU = kh.search.slice(1).split('&');
              continue;
            case '6':
              return 0 == kL.length ? kh.search = '' : kh.search = '?' + kL.join('&'), Gk(kh);
          }
          break;
        }
      }
      // setCookie：统一 cookie 写入函数。ssxmod_itna / ssxmod_itna2 最终都由这里写入 document.cookie。
      function GC(kZ, kD, kM, kK) {
        var Tx = WV,
          kh,
          kL;
        if (kh = kK || G9(), "number" == typeof kM) {
          var kt = new Date();
          kt.setTime(kt.getTime() + kM), kL = kt.toGMTString();
        } else kL = kM;
        dR.cookie = kZ + '=' + kD + ";expires=" + kL + ";path=/;domain=" + kh;
      }
      // Gg.x：自定义 LZ 类压缩/编码器。两个 ssxmod_* 值都会先拼接明文字段，再经 Gg.x(..., true) 编码。
      const Gg = function () {
        var jQ = {
            dT: 0x3a2,
            dx: 0x2e6,
            dC: 0x801,
            dg: 0x6b1,
            du: 0x7f6,
            dc: 0x625,
            da: 0x773,
            dj: 0x801,
            dS: 0x7f6,
            de: 0x625,
            dO: 0x682,
            dE: 0x253,
            dq: 0x1bf,
            di: 0x862,
            dJ: 0x632,
            dr: 0x1bf,
            dH: 0x7d7,
            dN: 0x1b2,
            dn: 0x6ed,
            dR: 0x1bf,
            df: 0x682,
            dp: 0x253,
            dY: 0x434,
            dI: 0x65c,
            dl: 0x1bf,
            dV: 0x432,
            dQ: 0x794,
            dz: 0x7f6,
            dm: 0x253,
            dF: 0x304,
            ds: 0x3a1,
            dB: 0x542,
            dZ: 0x574,
            dD: 0x3d2,
            dM: 0x513,
            dK: 0x1bf,
            dh: 0x368,
            dL: 0x858,
            dt: 0x4dc,
            dU: 0x1b2,
            dw: 0x1bf,
            dv: 0x2f7,
            dy: 0x513,
            dX: 0x65c,
            db: 0x602,
            dP: 0x396,
            G0: 0x3b8,
            G1: 0x6be,
            G2: 0x5b4,
            G3: 0x341,
            G4: 0x1b2,
            G5: 0x313
          },
          jV = {
            dT: 0x3cd,
            dx: 0x2d4,
            dC: 0x447
          },
          jl = {
            dT: 0x2e6
          },
          jf = {
            dT: 0x654
          },
          jN = {
            dT: 0x5f6
          },
          jJ = {
            dT: 0x547
          },
          ji = {
            dT: 0x326
          },
          je = {
            dT: 0x527
          },
          kZ = {
            'ktQMT': function (kM, kK) {
              return kM + kK;
            },
            'oCnjI': function (kM, kK) {
              return kM < kK;
            },
            'DanRX': function (kM, kK) {
              return kM | kK;
            },
            'JWqLj': function (kM, kK) {
              return kM - kK;
            },
            'wgydz': function (kM, kK) {
              return kM << kK;
            },
            'wRfQl': function (kM, kK) {
              return kM == kK;
            },
            'WGkpN': function (kM, kK) {
              var TC = k;
              return kM - kK;
            },
            'JnhLW': function (kM, kK) {
              return kM & kK;
            },
            'FVBJX': function (kM, kK) {
              return kM(kK);
            },
            'ISJxs': function (kM, kK) {
              return kM(kK);
            },
            'NmYXn': function (kM, kK) {
              return kM < kK;
            },
            'NsoYV': function (kM, kK) {
              var Tg = k;
              return kM | kK;
            },
            'rbNPl': function (kM, kK) {
              var Tu = k;
              return kM == kK;
            },
            'luNgT': function (kM, kK) {
              var Tc = k;
              return kM - kK;
            },
            'auFbI': function (kM, kK) {
              return kM(kK);
            },
            'KrBfK': function (kM, kK) {
              var Ta = k;
              return kM == kK;
            },
            'JViae': function (kM, kK) {
              var Tj = k;
              return kM < kK;
            },
            'wYIgy': function (kM, kK) {
              return kM | kK;
            },
            'FmjYZ': function (kM, kK) {
              var TS = k;
              return kM << kK;
            },
            'JFjax': function (kM, kK) {
              var Te = k;
              return kM(kK);
            },
            'RTNpT': function (kM, kK) {
              return kM < kK;
            },
            'ZlyEp': function (kM, kK) {
              return kM | kK;
            },
            'SEgfG': function (kM, kK) {
              var TO = k;
              return kM & kK;
            },
            'nWdaP': function (kM, kK) {
              return kM == kK;
            },
            'WtkBm': function (kM, kK) {
              return kM & kK;
            },
            'GuaUF': function (kM, kK) {
              return kM(kK);
            }
          },
          kD = {
            'x': function (kM, kK) {
              var TE = k;
              if (null == kM) return '';
              var kh = "DGi0YA7BemWnQjCl4+bR3f8SKIF9tUz/xhr2oEOgPpac=61ZqwTudLkM5vHyNXsVJ";
              kK && (kh = kh.replace('+', '_'));
              var kL = kD.C(kM, 6, function (kt) {
                var Tq = TE;
                return kh.charAt(kt);
              });
              return kL;
            },
            'C': function (kM, kK, kh) {
              var Ti = k;
              if (null == kM) return '';
              var kL,
                kt,
                kU,
                kw = {},
                kv = {},
                ky = '',
                kX = '',
                kb = '',
                kP = 2,
                W0 = 3,
                W1 = 2,
                d = [],
                W2 = 0,
                W3 = 0;
              for (kU = 0; kU < kM.length; kU += 1) if (ky = kM.charAt(kU), Object.prototype.hasOwnProperty.call(kw, ky) || (kw[ky] = W0++, kv[ky] = true), kX = kZ.ktQMT(kb, ky), Object.prototype.hasOwnProperty.call(kw, kX)) kb = kX;else {
                if (Object.prototype.hasOwnProperty.call(kv, kb)) {
                  if (kb.charCodeAt(0) < 256) {
                    for (kL = 0; kZ.oCnjI(kL, W1); kL++) W2 <<= 1, W3 == kK - 1 ? (W3 = 0, d.push(kh(W2)), W2 = 0) : W3++;
                    for (kt = kb.charCodeAt(0), kL = 0; kL < 8; kL++) W2 = kZ.DanRX(W2 << 1, 1 & kt), W3 == kZ.JWqLj(kK, 1) ? (W3 = 0, d.push(kh(W2)), W2 = 0) : W3++, kt >>= 1;
                  } else {
                    for (kt = 1, kL = 0; kL < W1; kL++) W2 = kZ.wgydz(W2, 1) | kt, kZ.wRfQl(W3, kZ.WGkpN(kK, 1)) ? (W3 = 0, d.push(kh(W2)), W2 = 0) : W3++, kt = 0;
                    for (kt = kb.charCodeAt(0), kL = 0; kZ.oCnjI(kL, 16); kL++) W2 = W2 << 1 | kZ.JnhLW(1, kt), W3 == kK - 1 ? (W3 = 0, d.push(kh(W2)), W2 = 0) : W3++, kt >>= 1;
                  }
                  kZ.wRfQl(0, --kP) && (kP = Math.pow(2, W1), W1++), delete kv[kb];
                } else {
                  for (kt = kw[kb], kL = 0; kL < W1; kL++) W2 = W2 << 1 | kZ.JnhLW(1, kt), kZ.wRfQl(W3, kK - 1) ? (W3 = 0, d.push(kZ.FVBJX(kh, W2)), W2 = 0) : W3++, kt >>= 1;
                }
                0 == --kP && (kP = Math.pow(2, W1), W1++), kw[kX] = W0++, kb = kZ.ISJxs(String, ky);
              }
              if ('' !== kb) {
                if (Object.prototype.hasOwnProperty.call(kv, kb)) {
                  if (kb.charCodeAt(0) < 256) {
                    for (kL = 0; kZ.oCnjI(kL, W1); kL++) W2 <<= 1, W3 == kK - 1 ? (W3 = 0, d.push(kh(W2)), W2 = 0) : W3++;
                    for (kt = kb.charCodeAt(0), kL = 0; kZ.NmYXn(kL, 8); kL++) W2 = kZ.NsoYV(kZ.wgydz(W2, 1), 1 & kt), kZ.rbNPl(W3, kZ.luNgT(kK, 1)) ? (W3 = 0, d.push(kZ.auFbI(kh, W2)), W2 = 0) : W3++, kt >>= 1;
                  } else {
                    for (kt = 1, kL = 0; kL < W1; kL++) W2 = W2 << 1 | kt, kZ.KrBfK(W3, kK - 1) ? (W3 = 0, d.push(kh(W2)), W2 = 0) : W3++, kt = 0;
                    for (kt = kb.charCodeAt(0), kL = 0; kZ.JViae(kL, 16); kL++) W2 = kZ.wYIgy(kZ.FmjYZ(W2, 1), 1 & kt), kZ.wRfQl(W3, kK - 1) ? (W3 = 0, d.push(kZ.JFjax(kh, W2)), W2 = 0) : W3++, kt >>= 1;
                  }
                  kZ.KrBfK(0, --kP) && (kP = Math.pow(2, W1), W1++), delete kv[kb];
                } else {
                  for (kt = kw[kb], kL = 0; kZ.RTNpT(kL, W1); kL++) W2 = kZ.ZlyEp(W2 << 1, kZ.SEgfG(1, kt)), kZ.nWdaP(W3, kZ.WGkpN(kK, 1)) ? (W3 = 0, d.push(kh(W2)), W2 = 0) : W3++, kt >>= 1;
                }
                0 == --kP && (kP = Math.pow(2, W1), W1++);
              }
              for (kt = 2, kL = 0; kL < W1; kL++) W2 = kZ.FmjYZ(W2, 1) | kZ.WtkBm(1, kt), W3 == kK - 1 ? (W3 = 0, d.push(kZ.GuaUF(kh, W2)), W2 = 0) : W3++, kt >>= 1;
              for (;;) {
                if (W2 <<= 1, kZ.wRfQl(W3, kK - 1)) {
                  d.push(kZ.auFbI(kh, W2));
                  break;
                }
                W3++;
              }
              return d.join('');
            }
          };
        return kD;
      }();
      var Gu = void 0;
      function Gc() {
        var TJ = WV;
        this.storage = {};
      }
      // getStorage：优先使用真实 localStorage，不可用时退化为内存 storage。
      function Ga() {
        return Gu || (Gu = function () {
          var Tr = k;
          try {
            var kZ = "aliyun_waf_testLocalStorage";
            return localStorage.setItem(kZ, kZ), localStorage.removeItem(kZ), true;
          } catch (kD) {
            return false;
          }
        }() ? localStorage : new Gc()), Gu;
      }
      Gc.prototype.setItem = function (kZ, kD) {
        var TH = WV;
        this.storage[kZ] = kD;
      }, Gc.prototype.getItem = function (kZ) {
        var TN = WV;
        return this.storage[kZ];
      }, Gc.prototype.removeItem = function (kZ) {
        var Tn = WV;
        delete this.storage[kZ];
      };
      const Gj = {};
      // encodeStorageValue：localStorage 保存格式：encodeURIComponent(value) || expireTimestamp。
      function GS(kZ, kD) {
        var TR = WV;
        return kD || (kD = 1800000), encodeURIComponent(kZ) + '||' + (new Date().getTime() + kD);
      }
      // setStorageWithTTL：写 localStorage，并同步到内存缓存 Gj。
      function GO(kZ, kD, kM) {
        var Tf = WV;
        const kK = Ga();
        kD = GS(kD, kM), Gj[kZ] = kD, kK.setItem(kZ, kD);
      }
      // getStorageWithTTL：读 localStorage；过期或 decode 失败则清理。
      function GE(kZ) {
        var Tp = WV;
        const kD = Ga();
        var kM;
        if (!(kM = Gj[kZ] ? Gj[kZ] : kD.getItem(kZ))) return Gj[kZ] = GS('', 300000), '';
        {
          var kK = kM.split('||');
          if (kK.length < 2) return kD.removeItem(kZ), delete Gj[kZ], '';
          const kh = kK[1];
          if (kh && new Date().getTime() > parseInt(kh)) return kD.removeItem(kZ), void delete Gj[kZ];
          Gj[kZ] = kM;
          try {
            return decodeURIComponent(kK[0]);
          } catch (kL) {
            return Gq(kZ), '';
          }
        }
      }
      function Gq(kZ) {
        var TY = WV;
        Ga().removeItem(kZ), delete Gj[kZ];
      }
      // ==================== 行为数据采集状态 ====================
      // Gb/GP: PC 鼠标移动与点击轨迹；GB/GZ: 触屏移动与触摸轨迹；GI: 键盘/输入事件；Gr: isTrusted=false 次数。
      var Gi = 1,
        GJ = false,
        Gr = 0,
        GH = df.maxTouchPoints;
      // normalizeEventAndCountUntrusted：兼容 IE event，并累计 isTrusted=false 的事件数量到 Gr。
      function GN(kZ) {
        var TI = WV;
        return !dR.addEventListener && dR.attachEvent && (kZ = dn.event), void 0 === kZ.isTrusted || kZ.isTrusted || (Gr += 1), kZ;
      }
      null == GH && (GH = 997), ("ontouchstart" in dn || GH) && (GJ = true);
      var Gn = 0,
        GR = 0,
        Gf = 0,
        Gp = 0,
        GY = 0,
        GI = [],
        Gl = 0,
        GV = d,
        GQ = function (kZ) {
          var Tl = WV;
          if (++Gl <= 20) {
            kZ = GN(kZ);
            var kD = new Date().getTime() - GV;
            GI.push(("keydown" == kZ.type ? 0 : 1) + kD.toString()), AG(), GV += kD;
          }
        },
        Gz = 0,
        Gm = 0,
        Go = d,
        GF = 0,
        Gs = 0,
        GB = [],
        GZ = [],
        GD = d,
        GM = 0,
        GK = 0,
        Gh = 0,
        GL = dD(function (kZ) {
          var TV = WV;
          if (GJ) {
            if (kZ = GN(kZ), GF > 100) {
              var kD = GB[1].split('+'),
                kM = GB[0].split('+');
              GB[1] = parseInt(kD[0]) + parseInt(kM[0]) + '+' + (parseInt(kD[1]) + parseInt(kM[1])) + '+' + (parseInt(kD[2]) + parseInt(kM[2])), GB.shift();
            }
            GF++;
            var kK = parseInt(kZ.touches[0].pageX) - Gz,
              kh = parseInt(kZ.touches[0].pageY) - Gm,
              kL = new Date().getTime() - Go;
            GB.push([kK, kh, kL].join('+')), 1 == GF && (Gs = kL), AG(), Gz = parseInt(kZ.touches[0].pageX), Gm = parseInt(kZ.touches[0].pageY), Go += kL;
          }
        }, 30),
        Gt = function (kZ) {
          var TQ = WV;
          if (GJ) {
            kZ = GN(kZ), GM > 10 && GZ.shift(), GM++;
            var kD = parseInt(kZ["touchstart" == kZ.type ? "touches" : "changedTouches"][0].pageX),
              kM = parseInt(kZ["touchstart" == kZ.type ? "touches" : "changedTouches"][0].pageY);
            "touchstart" == kZ.type && ++GK;
            var kK = new Date().getTime() - GD;
            GZ.push(("touchstart" == kZ.type ? '0' : 1) + '+' + kD + '+' + kM + '+' + kK), 1 == GM && (Gh = kK), AG(), GD += kK;
          }
        },
        GU = 0,
        Gw = 0,
        Gv = d,
        Gy = 0,
        GX = 0,
        Gb = [],
        GP = [],
        A0 = d,
        A1 = 0,
        A2 = 0,
        A3 = 0,
        A4 = dD(function (kZ) {
          var Tz = WV;
          if (kZ = GN(kZ), Gy > 100) {
            var kD = Gb[1].split('+'),
              kM = Gb[0].split('+');
            Gb[1] = parseInt(kD[0]) + parseInt(kM[0]) + '+' + (parseInt(kD[1]) + parseInt(kM[1])) + '+' + (parseInt(kD[2]) + parseInt(kM[2])), Gb.shift();
          }
          Gy++;
          var kK = kZ.pageX,
            kh = kZ.pageY;
          if (void 0 === kK) {
            var kL = dR.body ? dR.body.scrollLeft : 0,
              kt = dR.body ? dR.body.scrollTop : 0;
            kK = kZ.clientX + kL, kh = kZ.clientY + kt;
          }
          var kU = kK - GU,
            kw = kh - Gw,
            kv = new Date().getTime() - Gv;
          1 == Gy && (GX = kv), Gb.push([kU, kw, kv].join('+')), AG(), GU = kK, Gw = kh, Gv += kv;
        }, 30),
        A5 = function (kZ) {
          var Tm = WV;
          "mousedown" == (kZ = GN(kZ)).type && ++A2, A1 > 10 && GP.shift(), A1++;
          var kD = kZ.pageX,
            kM = kZ.pageY;
          if (void 0 === kD) {
            var kK = dR.body ? dR.body.scrollLeft : 0,
              kh = dR.body ? dR.body.scrollTop : 0;
            kD = kZ.clientX + kK, kM = kZ.clientY + kh;
          }
          var kL = parseInt(kD),
            kt = parseInt(kM),
            kU = new Date().getTime() - A0,
            kw = kZ.which ? kZ.which : 9;
          1 == A1 && (A3 = kU), GP.push(kw + ("mousedown" == kZ.type ? '0' : '1') + '+' + kL + '+' + kt + '+' + kU), AG(), A0 += kU;
        };
      function A6() {
        var To = WV;
        return GJ && 0 === GK;
      }
      // collectBehaviorPayload：汇总鼠标/触摸/键盘行为轨迹，供 ssxmod_itna2 详细行为字段使用。
      function A7() {
        var TF = WV,
          kZ = {};
        return (kZ = GJ ? {
          'g': A6() ? Gb : GB,
          'u': A6() ? GP : GZ,
          'c': A6() ? A2 : GK,
          'a': 'M',
          'j': A6() ? GX : Gs,
          'S': A6() ? A3 : Gh
        } : {
          'g': Gb,
          'u': GP,
          'c': A2,
          'a': 'P',
          'j': GX,
          'S': A3
        }).e = GI, kZ.O = Gl, kZ;
      }
      var A8 = d;
      let A9 = '';
      // ==================== ssxmod_itna / ssxmod_itna2 核心生成入口 ====================
      // AG 是节流后的刷新函数：事件触发后重新拼接字段、编码，并写入两个 cookie。
      var Ad = G9(),
        AG = dD(function () {
          var S0 = {
              dT: 0x290,
              dx: 0x313,
              dC: 0x3a2,
              dg: 0x3a2,
              du: 0x313,
              dc: 0x313,
              da: 0x313,
              dj: 0x313
            },
            jP = {
              dT: 0x2bf
            },
            TB = WV,
            kZ = {
              'Onsvw': function (kM, kK) {
                var Ts = k;
                return kM + kK;
              }
            };
          A8 = new Date().getTime(), dM[3]++;
          var kD = new Date(A8 + 1800000).toUTCString();
          // ssxmod_itna：偏环境摘要。字段结构：dM摘要 ^ 行为数量摘要 ^ dK环境字段 ^ Gi ^ 时间戳 ^ dh高级指纹 ^ _waf_3d7faf79缓存 ^ dL补充字段。
          GC("ssxmod_itna", function () {
            var TZ = TB;
            const kM = A7();
            return A9 = kZ.Onsvw('1-', Gg.x([dM.join('^'), [kM.a, kM.g.length, kM.u.length, kM.e.length].join('^'), dK.join('^'), Gi, A8, dh.join('^'), GE(dl), dL.join('^')].join('^'), true)), A9;
          }(), kD, Ad),
          // ssxmod_itna2：偏行为明细。包含鼠标/触摸轨迹、键盘事件、点击数、untrusted 事件数 Gr 等。
          GC("ssxmod_itna2", function () {
            var TD = TB,
              kM = A7();
            return '1-' + Gg.x(dM.slice(0, 4).join('^') + '^' + [kM.a, kM.j, kM.g.join('|'), kM.S, kM.u.join('|'), kM.e.join('|'), kM.O, GR, Gf, Gi, A8, GY, Gp, kM.c, Gn, Gr].join('^'), true);
          }(), kD, Ad);
        }, 60);
      // getOrCreateLocalSeed：读取/生成 localStorage[__00b204e9800998__]。包含 Math.random 与启动时间 d。
      function AA() {
        var TM = WV,
          kZ = GE(dI);
        return kZ || (kZ = dX((4294967295 * Math.random() >>> 0) + '|' + d, 0, 1) + 'a' + d.toString(16), GO(dI, kZ, 15552000000)), kZ;
      }
      function Ak(kZ, kD, kM) {
        var TK = WV;
        if (!kD) return kZ;
        kD = kD.split('.'), kM && kD.push("prototype");
        for (var kK = 0; kK < kD.length; ++kK) if (!(kZ = kZ[kD[kK]])) return;
        return kZ;
      }
      function AW(kZ, kD, kM, kK) {
        var Th = WV;
        return !(!(kZ = Ak(kZ, kD, kK)) || !kZ.hasOwnProperty) && kZ.hasOwnProperty(kM);
      }
      function AT(kZ, kD) {
        var TL = WV;
        return null != kZ ? kZ : kD;
      }
      const Ax = ["script", 'a', "button", "input", "textarea"];
      function AC(kZ) {
        var Tt = WV,
          kD = 10000,
          kM = 2000;
        try {
          for (; kM > 1;) dn.matchMedia('(' + kZ + ':\x20' + (kD + 1) + "px)").matches ? (kD += kM, kM = Math.floor(kM / 2)) : kD -= kM;
        } catch (kK) {
          return 233;
        }
        return kD;
      }
      function Ag() {
        var TU = WV,
          kZ = dR.documentElement;
        return AT(dn.innerWidth || kZ && kZ.clientWidth || dR.body && dR.body.clientWidth, -1);
      }
      // collectScreenInfo：采集 screen/window/viewport/matchMedia 推断尺寸，字段会进入 dK/dh。
      function Au() {
        var Tw = WV,
          kZ,
          kD = dn.screen,
          kM = AT(kD.width, 0),
          kK = AT(kD.height, 0),
          kh = Ag(),
          kL = (kZ = dR.documentElement, AT(dn.innerHeight || kZ && kZ.clientHeight || dR.body && dR.body.clientHeight, -1)),
          kt = dn.screenTop || dn.screenY || 0,
          kU = dn.screenLeft || dn.screenX || 0,
          kw = -1,
          kv = -1,
          ky = AT(dn.outerWidth, -1),
          kX = AT(dn.outerHeight, -1);
        return dt && (kw = AC("min-device-width"), kv = AC("min-device-height")), [kM, kK, kh, kL, kt, kU, kw, kv, ky, kX, AT(dn.pageXOffset, -1), AT(dn.pageYOffset, -1)].join('|');
      }
      // getViewportScale：从 viewport meta 中提取 initial-scale。
      function Ac() {
        var Tv = WV;
        try {
          var kZ = dR.getElementsByName("viewport");
          if (kZ && 1 == kZ.length && kZ[0].content && -1 != kZ[0].content.indexOf("initial-scale")) {
            kZ = kZ[0].content.replace(/\s+/g, '');
            var kD = dn.parseFloat(kZ.split("initial-scale=")[1].split(',')[0]);
            return 0 == kD ? 1 : 1 / kD;
          }
          return 1;
        } catch (kM) {
          return 1;
        }
      }
      function Aa(kZ, kD, kM, kK) {
        var Ty = WV,
          kh = dR.createElement("script");
        return kh.name = "aliyunwaf_6a6f5ea8", kZ && dP ? (kK || (kZ = function (kL) {
          var TX = Ty,
            kt = /<script\sname="aliyunwaf_6a6f5ea8">([\s\S]+)?<\/script>/g.exec(kL);
          return kt ? kt[1] : null;
        }(kZ)), kM && GO(kM, kZ, 43200000), kh.textContent = kZ) : (kh.async = false, kh.defer = true, kh.src = kD), kh;
      }
      function Aj(kZ, kD) {
        var Tb = WV;
        kD || (kD = "renderData");
        var kM;
        if (null !== (kM = new RegExp("<textarea\\s+id=\"" + kD + "\"\\s+style=\"display:none\">([\\s\\S]*?)<\\/textarea>", 'g').exec(kZ))) try {
          return JSON.parse(kM[1]);
        } catch (kK) {
          return {};
        }
      }
      // 服务端下发字段与 ssxmod_itna 之间的本地缓存辅助逻辑。
      const AS = "ssxmod_itna";
      let AO = '';
      const AE = 155520000000;
      function Aq(kZ) {
        var TP = WV;
        return kZ + '_' + AS;
      }
      function Ai(kZ, kD) {
        let kM = function (kK) {
          var x0 = k;
          return Aj(kK, "aliyun_waf_fa9faf9f45");
        }(kZ);
        Ar(kM, kD);
      }
      function AJ(kZ, kD) {
        var x1 = WV;
        try {
          let kM = kZ.split('|');
          kM = {
            '_waf_3d7faf79': kM[0],
            '_waf_698b2709': kM[1] ? parseInt(kM[1]) : 0
          }, Ar(kM, kD);
        } catch (kK) {}
      }
      function Ar(kZ, kD) {
        var x2 = WV;
        if (kZ) {
          let kM = Date.now();
          if (AH(kZ._waf_3d7faf79, kM), kZ._waf_698b2709 && GW(kD, location.href)) GO(Aq(Gd(kD).host), "true", AE);
        }
      }
      function AH(kZ, kD) {
        var x3 = WV;
        if (kZ) {
          let kM = AA();
          kM && -1 != kM.indexOf('1-') || (GO(dI, kZ, AE), dM[0] = kZ), AO = kZ + '|' + kD, GO(dl, AO, AE);
        }
      }
      const AN = Ak(dn, "speechSynthesis.getVoices");
      // collectVoicesFingerprint：speechSynthesis.getVoices 指纹。
      function An() {
        var x4 = WV;
        try {
          if (AN) {
            var kZ = false,
              kD = AN.bind(dn.speechSynthesis)();
            if (kD.length > 0) {
              const kK = [];
              for (var kM = 0; kM < kD.length; ++kM) kK.push(kD[kM].voiceURI + '||' + kD[kM].lang + '||' + kD[kM].name), kD[kM].name.indexOf("Google") > -1 && (kZ = true);
              return kD.length + '|' + dX(dn.JSON.stringify(kK), 0, 1) + '|' + (kZ ? 1 : 0);
            }
            return 0;
          }
          return -1;
        } catch (kh) {
          return -2;
        }
      }
      // detectSpecificResource：检查 performance resource 中是否存在特定资源痕迹。
      function AR() {
        var x5 = WV;
        try {
          if (dn.performance && "function" == typeof dn.performance.getEntriesByType) {
            for (var kZ = dn.performance.getEntriesByType("resource"), kD = 0; kD < kZ.length; kD++) {
              var kM = kZ[kD];
              if ("resource" === kM.entryType && kM.name.indexOf("perplexity.ai") > -1 && kM.name.indexOf("FKGroteskNeue") > -1) return 1;
            }
            return 0;
          }
          return -3;
        } catch (kK) {
          return -3;
        }
      }
      // buildEnvironmentFingerprint：环境/浏览器指纹字段汇总，最终填充 dM/dK/dh/dL。
      function Af() {
        var x6 = WV,
          kZ;
        try {
          kZ = document.getElementById("genspark-float-bar");
        } catch (kD) {}
        return dZ([dn.Object, dn.AICreateMonitor, dn.FELLOU_PARTITION, dn.Array, df.genspark, kZ]);
      }
      if (!dn._waf_async_initialized1) {
        var Ap = "websdk-" + dp;
        dM.push(AA()), dM.push(Ap), dM.push(d), dM.push(0), function () {
          var x7 = WV;
          try {
            let kZ = document && document.getElementById("aliyun_waf_fa9faf9f45");
            kZ && AH(JSON.parse(kZ.innerHTML)._waf_3d7faf79, Date.now());
          } catch (kD) {}
          try {
            dQ[dm] && AJ(dQ[dm], location.href);
          } catch (kM) {}
        }(), dn._waf_async_initialized1 = true, dn.setInterval(function () {
          var x8 = WV;
          dM[8] = Au();
          var kZ = dn.screen.availWidth - dn.outerWidth < 10 | 0;
          dM[21] = kZ;
        }, 5000), G2("mousedown", A5), G2("mouseup", A5), G2("mousemove", A4), G2("touchmove", GL), G2("touchstart", Gt), G2("touchend", Gt), G2("keyup", GQ), void 0 !== dR.hidden ? (AY = "hidden", AI = "visibilitychange") : void 0 !== dR.mozHidden ? (AY = "mozHidden", AI = "mozvisibilitychange") : void 0 !== dR.msHidden ? (AY = "msHidden", AI = "msvisibilitychange") : void 0 !== dR.webkitHidden && (AY = "webkitHidden", AI = "webkitvisibilitychange"), AY && G2(AI, function () {
          var x9 = WV;
          !dR[AY] && dM.length > 20 && (dM[20]++, AG());
        }), G2("compositionend", function (kZ) {
          var xd = WV;
          kZ = GN(kZ), GR += kZ.data.length, ++Gf, AG();
        }), G2("paste", function (kZ) {
          var xG = WV,
            kD = (kZ = GN(kZ)).clipboardData || dn.clipboardData;
          if (++GY, kD) {
            try {
              Gp += kD.getData("text").length;
            } catch (kM) {}
            AG();
          }
        }), G2("click", function (kZ) {
          kZ = GN(kZ), ++Gn, AG();
        }), dn.setInterval(function () {
          ++Gi, AG();
        }, 5000), function () {
          var Sy = {
              dT: 0x25b,
              dx: 0x6b8,
              dC: 0x69b,
              dg: 0x795,
              du: 0x278,
              dc: 0x5e2,
              da: 0x3c2,
              dj: 0x3d4,
              dS: 0x557,
              de: 0x29a,
              dO: 0x467
            },
            SM = {
              dT: 0x6b1,
              dx: 0x7f6,
              dC: 0x6b5,
              dg: 0x194,
              du: 0x2b9,
              dc: 0x23f,
              da: 0x236,
              dj: 0x34b,
              dS: 0x7ad
            },
            SI = {
              dT: 0x380,
              dx: 0x5f9,
              dC: 0x70a,
              dg: 0x40f,
              du: 0x4ef
            },
            Sp = {
              dT: 0x501,
              dx: 0x3f1,
              dC: 0x17e,
              dg: 0x73f,
              du: 0x423,
              dc: 0x1b4,
              da: 0x7f6,
              dj: 0x58a,
              dS: 0x66d,
              de: 0x1b4,
              dO: 0x664,
              dE: 0x175,
              dq: 0x5d1,
              di: 0x1ee,
              dJ: 0x175,
              dr: 0x2a6,
              dH: 0x1bf,
              dN: 0x7ff,
              dn: 0x740,
              dR: 0x1bf,
              df: 0x690,
              dp: 0x3e6,
              dY: 0x38e,
              dI: 0x62f,
              dl: 0x51f,
              dV: 0x745,
              dQ: 0x1bf,
              dz: 0x1cf,
              dm: 0x4ee,
              dF: 0x6b4,
              ds: 0x4bb,
              dB: 0x202,
              dZ: 0x1bf,
              dD: 0x6b1,
              dM: 0x6b1,
              dK: 0x309,
              dh: 0x1bf,
              dL: 0x626,
              dt: 0x286,
              dU: 0x626,
              dw: 0x244,
              dv: 0x1f9,
              dy: 0x4d1,
              dX: 0x251,
              db: 0x4d1,
              dP: 0x1bf,
              G0: 0x3e0
            },
            xA = WV,
            kZ = {
              'rtEHE': "canvas",
              'vNFYW': "Cwm fjordbank glyphs vext quiz, 😃",
              'MTZiy': function (Wr, WH, WN, Wn) {
                var xk = xA;
                return Wr(WH, WN, Wn);
              },
              'CQLQr': "voiceschanged",
              'conUY': function (Wr, WH) {
                return Wr === WH;
              },
              'DzoAR': function (Wr) {
                return Wr();
              },
              'cEcrD': "webdriver",
              'tYofP': "http://127.0.0.1:31460/favicon.png"
            },
            kD = !(!dn.webkitRTCPeerConnection && !Ak(dn, "Element.prototype.webkitMatchesSelector")) | 0;
          kD |= (void 0 !== dn.mozPaintCount) << 1, kD |= (void 0 !== dn.mozInnerScreenX) << 2, kD |= !!dn.Debug << 3, kD |= !!dn.WebKitPlaybackTargetAvailabilityEvent << 4;
          for (var kM = 0, kK = ["zoom", "resize", "text-rendering", "text-align-last", "-webkit-hyphens"], kh = dR.createElement('cc'), kL = 0; kL < kK.length; kL++) kM |= (void 0 !== kh.style[kK[kL]] ? 1 : 0) << kL;
          dM.push(kD + '|' + kM);
          var kt = df.language || df.userLanguage;
          dM.push(kt);
          var kU = new Date().getTimezoneOffset();
          if (dM.push(kU), dn.hasOwnProperty) {
            var kw = "3|5|1|7|10|2|6|4|8|0|9|11".split('|'),
              kv = 0;
            while (!![]) {
              switch (kw[kv++]) {
                case '0':
                  var ky = AW(dn, "Symbol", "species") | 0;
                  continue;
                case '1':
                  var kX = function () {};
                  continue;
                case '2':
                  kb |= !!''.padStart << 9, kb |= AW(dn, "PointerEvent", "getCoalescedEvents", true) << 10, kb |= AW(dn, '', "BudgetService") << 12, kb |= !!Ak(W0, "getAttributeNames") << 13, kb |= !(void 0 === Ak(dn, "performance.timeOrigin")) << 14, kb |= AW(dn, "Intl", "PluralRules") << 15, kb |= dn.hasOwnProperty("getMatchedCSSRules") << 16, kb |= dn.hasOwnProperty("PerformanceServerTiming") << 17, kb |= !![].values << 18, kb |= dn.hasOwnProperty("BigInt") << 19, kb |= (void 0 !== dR.wasDiscarded) << 20, kb |= dt << 21, kb |= (dn.clientInformation === df) << 22;
                  continue;
                case '3':
                  var kb = !![].copyWithin | 0;
                  continue;
                case '4':
                  try {
                    performance.getEntries(dB.src).length > 0 && (kP = 1);
                  } catch (Wr) {}
                  continue;
                case '5':
                  kb |= !![].includes << 1, kb |= dn.hasOwnProperty("Touch") << 2, kb |= dn.hasOwnProperty("Proxy") << 3, kb |= AW(dn, "Symbol", "match") << 4;
                  continue;
                case '6':
                  var kP = 0;
                  continue;
                case '7':
                  kX.a = 1, kb |= !!kX.name << 5, kb |= AW(dn, "Object", "values") << 6, kb |= AW(dn, "OfflineAudioContext", "close", true) << 7;
                  continue;
                case '8':
                  kb |= kP << 23;
                  continue;
                case '9':
                  ky |= dn.hasOwnProperty("Reflect") << 1, ky |= AW(dn, "Symbol", "toPrimitive") << 2, ky |= AW(dn, "WeakMap", "clear", true) << 3, ky |= AW(dn, "DOMTokenList", "replace", true) << 4, ky |= AW(dn, "Symbol", "hasInstance") << 5, ky |= dn.hasOwnProperty("isSecureContext") << 6, ky |= dn.self.hasOwnProperty("origin") << 7, ky |= AW(dn, "PerformanceTiming", "secureConnectionStart", true) << 8, ky |= dn.hasOwnProperty("showModalDialog") << 9, ky |= AW(dn, "HTMLDocument", "getSelection", true) << 10, ky |= AW(dn, "HTMLMediaElement", "mozAutoplayEnabled", true) << 11, ky |= dn.isSecureContext << 12;
                  continue;
                case '10':
                  var W0 = dR.createElement("canvas");
                  continue;
                case '11':
                  var d = kb + '|' + (ky |= (dB ? 1 : 0) << 13);
                  continue;
              }
              break;
            }
          } else d = "0|0";
          dM.push(d), dM.push(Au());
          var W1 = dn.hasOwnProperty && dn.hasOwnProperty("history") ? dn.history.length : -1;
          dM.push(W1);
          var W2 = df.platform;
          dM.push(W2);
          var W3 = df.hardwareConcurrency || 0;
          dM.push(W3);
          var W4 = '';
          if ((W0 = dR.createElement("canvas")).getContext) {
            var W5 = W0.getContext("webgl") || W0.getContext("experimental-webgl");
            if (W5) {
              var W6 = W5.getExtension("WEBGL_debug_renderer_info");
              if (W6) {
                var W7 = W5.getParameter(W6.UNMASKED_VENDOR_WEBGL);
                W4 = W5.getParameter(W6.UNMASKED_RENDERER_WEBGL) + '|' + W7;
              } else W4 = "ns|3";
            } else W4 = "ns|2";
          } else W4 = "ns|1";
          dM.push(W4);
          var W8 = screen.colorDepth + '|' + screen.pixelDepth;
          dM.push(W8);
          var W9 = df.oscpu || 0;
          if (dM.push(W9), dn.hasOwnProperty) {
            var Wd = dn.hasOwnProperty("ApplePaySession") | 0;
            Wd |= dn.hasOwnProperty("ApplePayError") << 1, Wd |= dn.hasOwnProperty("Bluetooth") << 2, Wd |= dn.hasOwnProperty("BluetoothDevice") << 3, Wd |= dn.hasOwnProperty("BluetoothUUID") << 4;
          } else Wd = 0;
          dM.push(Wd);
          var WG = '',
            WA = df.plugins;
          for (kL = 0; WA && kL < WA.length; kL++) {
            WG += WA[kL].name + WA[kL].filename, WA[kL].version && (WG += WA[kL].version + "<br>");
            for (var Wk = 0; Wk < WA[kL].length; Wk++) {
              var WW = WA[kL][Wk],
                WT = 0;
              WW && (WT = WW.type), WT && (WG += WT.substring(12));
            }
          }
          WG = (WA ? WA.length : 0) + '|' + dX(WG, 0, 1), dM.push(WG), dM.push(function () {
            var xW = xA,
              WH = dR.createElement(kZ.rtEHE),
              WN = '';
            if (WH.getContext) {
              var Wn = WH.getContext('2d');
              WH.height = 60, WH.width = 400, WH.style.display = "inline", Wn.textBaseline = "alphabetic", Wn.fillStyle = "#f60", Wn.fillRect(125, 1, 62, 20), Wn.fillStyle = "#069", Wn.font = "11pt no-real-font-123", Wn.fillText(kZ.vNFYW, 2, 15), Wn.fillStyle = "rgba(102, 204, 0, 0.7)", Wn.font = "18pt Arial", Wn.fillText("Cwm fjordbank glyphs vext quiz, 😃", 4, 45), WN = kZ.MTZiy(dX, WN = WH.toDataURL() || '', 0, 1);
            }
            return WN;
          }());
          var Wx = df.userAgent,
            WC = Wx ? dX(Wx, 0, 1) : 0;
          dM.push(WC);
          var Wg = dR.hidden || dR.mozHidden ? 0 : 1;
          dM.push(Wg), dM.push(0);
          var Wu = dn.screen.availWidth - dn.outerWidth < 10 | 0;
          dM.push(Wu);
          var Wc,
            Wa = dy(true);
          dM.push(Wa), dK.push(function () {
            var xT = xA,
              WH = 0;
            if (dw) {
              var WN = new dn.Error(),
                Wn = {};
              Wn.configurable = false, Wn.enumerable = false, Wn.get = function () {
                return WH = 1, '';
              }, dn.Object.defineProperty(WN, "stack", Wn), dw(WN);
            }
            var WR = 0;
            if (dv) try {
              const Wp = {},
                WY = ['a', 'b', 'c', 'd'].entries();
              Object.defineProperty(Wp, "iter", {
                'get': WY.next.bind(WY)
              }), dv(Wp), WR = 1 == WY.next().value[0];
            } catch (WI) {}
            var Wf = [];
            return Wf.push(dn._Selenium_IDE_Recorder), Wf.push(dn.__IE_DEVTOOLBAR_CONSOLE_COMMAND_LINE || "__BROWSERTOOLS_DOMEXPLORER_ADDED" in dn), Wf.push(dn.v_log && dn.v_log.toString().indexOf("v_console_log") > -1), Wf.push(df.hasOwnProperty && df.hasOwnProperty("webdriver")), Wf.push(WH), Wf.push(dn.Object), Wf.push(dR.documentElement && dR.documentElement.getAttribute("selenium")), Wf.push(null != dn.XPathResult || null != dR.XPathResult), Wf.push(dw), Wf.push(WR), dZ(Wf);
          }()), dK.push(df.vendor || df.vendorSub), dK.push(((Wc = []).push("function" == typeof Bun && Bun && "string" == typeof Bun.version), Wc.push("undefined" != typeof process && process.versions && process.versions.node), Wc.push(df.brave && df.brave.isBrave), Wc.push(df.plugins.refresh), dZ(Wc))), dK.push("-1|0|0|0|0");
          const Wj = dK.length - 1;
          dK.push(dX('' + (dB ? dB.src : void 0), 0, 1)), dh.push(dX('' + Ak(dn, "__proto__.__proto__"), 0, 1)), dh.push(GH), dh.push(dZ([dn.chrome, dn.chrome && dn.chrome.runtime, dn.sessionStorage, dn.localStorage, dn.indexedDB, dn.safari])), dL.push('-1');
          const WS = dL.length - 1;
          !function (WH, WN) {
            var xx = xA;
            if (AN) try {
              WH[WN] = An(), dn.speechSynthesis.addEventListener(kZ.CQLQr, function () {
                WH[WN] = An();
              });
            } catch (Wn) {}
          }(dL, WS), dL.push(function () {
            var xC = xA,
              WH = df.userAgentData,
              WN = false,
              Wn = false,
              WR = false;
            if (WH && WH.brands) {
              for (var Wf = 0; Wf < WH.brands.length; Wf++) {
                var Wp = WH.brands[Wf].brand;
                Wp.indexOf("Google Chrome") > -1 && (WN = true), Wp.indexOf("Brave") > -1 && (Wn = true), Wp.indexOf("Chromium") > -1 && (WR = true);
              }
              return dZ([WN, Wn, WR]);
            }
            return -1;
          }()), dL.push(dZ([dn.chrome, dn.braveEthereum, dn.braveSolana, df.brave, df.solana, dn.atomicSolana, dn.atomic])), dL.push(-1);
          const WO = dL.length - 1;
          !function (WH, WN) {
            var Sz = {
                dT: 0x847
              },
              SQ = {
                dT: 0x7fd,
                dx: 0x3a2,
                dC: 0x551
              },
              xg = xA,
              Wn = {
                'mPJgp': function (WR) {
                  return WR();
                }
              };
            try {
              dR.fonts.load("16px \"FKGroteskNeue\"").then(function (WR) {
                var xu = xg;
                kZ.conUY(0, WR.length) ? WH[WN] = 0 : WH[WN] = kZ.DzoAR(AR);
              }).catch(function (WR) {
                var xc = xg;
                WH[WN] = Wn.mPJgp(AR);
              }), setTimeout(function () {
                -1 === WH[WN] && (WH[WN] = 2);
              }, 1000);
            } catch (WR) {
              return -2;
            }
          }(dL, WO), dL.push(Af());
          const WE = dL.length - 1;
          db(function () {
            var SF = {
              dT: 0x3a2,
              dx: 0x1bf,
              dC: 0x557,
              dg: 0x6f6,
              du: 0x3a2,
              dc: 0x313
            };
            dK[Wj] = function () {
              var xa = k;
              for (var WH = [], WN = 0; WN < Ax.length; ++WN) WH.push(dR.getElementsByTagName(Ax[WN]).length);
              return WH.join('|');
            }(), dM[8] = Au(), setTimeout(function () {
              dL[WE] = Af();
            }, 1000);
          }), dL.push(-1);
          const Wq = dL.length - 1;
          !function (WH, WN) {
            var xj = xA;
            if (df.hasOwnProperty(kZ.cEcrD) && Array.isArray(df.plugins)) {
              var Wn = new Image();
              Wn.onload = function () {
                WH[WN] = 1;
              }, Wn.onerror = function () {
                WH[WN] = 0;
              }, Wn.src = kZ.tYofP;
            }
          }(dL, Wq), dL.push(0);
          const Wi = dL.length - 1;
          !function (WH, WN) {
            var Sh = {
                dT: 0x741,
                dx: 0x82b,
                dC: 0x6b4,
                dg: 0x1af,
                du: 0x1e6,
                dc: 0x625
              },
              xS = xA,
              Wn = {};
            Wn.PoKsS = function (Wp, WY) {
              return Wp > WY;
            };
            var WR = Wn;
            try {
              var Wf = Document.prototype.querySelectorAll;
              Wf && (Document.prototype.querySelectorAll = function (Wp) {
                var xe = xS;
                try {
                  "string" == typeof Wp && WR.PoKsS(Wp.indexOf("data-browser-use-"), -1) && (WH[WN] = 1);
                } catch (WY) {}
                return Wf.call(this, Wp);
              });
            } catch (Wp) {}
          }(dL, Wi), dL.push(0);
          const WJ = dL.length - 1;
          !function (WH, WN) {
            var Sv = {
                dT: 0x2b5
              },
              xO = xA;
            dn.MutationObserver || (WH[WN] = -1);
            try {
              var Wn = "claude-agent-stop-container",
                WR = new MutationObserver(function (Wp) {
                  var Sw = {
                      dT: 0x656,
                      dx: 0x2b5,
                      dC: 0x69e,
                      dg: 0x2b5
                    },
                    xE = xO;
                  Wp.forEach(function (WY) {
                    var SU = {
                        dT: 0x467
                      },
                      St = {
                        dT: 0x467
                      },
                      xq = xE;
                    WY.addedNodes.forEach(function (WI) {
                      var xi = xq;
                      WI.id === Wn && (WH[WN] = 1, WR.disconnect());
                    }), WY.removedNodes.forEach(function (WI) {
                      var xJ = xq;
                      WI.id === Wn && (WH[WN] = 1, WR.disconnect());
                    });
                  });
                }),
                Wf = {};
              Wf.childList = true, WR.observe(dR.body, Wf), dR.getElementById(Wn) && (WH[WN] = 1, WR.disconnect());
            } catch (Wp) {}
          }(dL, WJ);
        }(), AG();
      }
      var AY,
        AI,
        Al = "acw_sc__v2";
      function AV(kZ, kD) {
        var xr = WV,
          kM = {
            'sHToN': function (kK, kh) {
              return kK(kh);
            }
          };
        dQ[dY] && GW(kZ, location.href) && function (kK, kh) {
          var xH = xr,
            kL = kM.sHToN(Gd, kK).host;
          GO(AQ(kL), kh);
        }(kZ, kD), GC(Al, kD, 1800000);
      }
      function AQ(kZ) {
        return kZ + '_' + Al;
      }
      const Az = dn.XMLHttpRequest,
        Am = dn.XMLHttpRequest.prototype,
        Ao = Am.send,
        AF = Am.open,
        As = EventTarget.prototype.addEventListener,
        AB = EventTarget.prototype.removeEventListener,
        AZ = Am.setRequestHeader;
      function AD(kZ, kD) {
        var xN = WV;
        let kM,
          kK = 0;
        for (; kZ;) {
          if (kZ.hasOwnProperty(kD)) {
            kM = Object.getOwnPropertyDescriptor(kZ, kD);
            break;
          }
          if (++kK, kK > 10) break;
          kZ = kZ.__proto__;
        }
        return kM;
      }
      const AM = AD(Am, "responseText"),
        AK = AD(Am, "responseType"),
        Ah = AD(Am, "response");
      function AL(kZ, kD, kM) {
        var xn = WV;
        try {
          if (kM) return kZ.getResponseHeader(kD);
          var kK = kZ.getAllResponseHeaders();
          if (kD = kD.toLowerCase(), kK.indexOf(kD) > -1) return kZ.getResponseHeader(kD);
        } catch (kh) {}
      }
      var At = {};
      At.jsclg = 0xf, At.dySig = 0xf, At.dySigV2 = 0xf, At.captchaV2 = 0x3;
      const AU = {},
        Aw = At;
      function Av(kZ) {
        var xR = WV,
          kD = AU[kZ],
          kM = {};
        return kM.E = 0x0, kM.q = 0x0, kM.i = 0x0, kM.J = false, (!kD || Date.now() - kD.E > 60000) && (kD = kM, AU[kZ] = kD), kD;
      }
      function Ay(kZ) {
        var xf = WV,
          kD = Av(kZ);
        kD.i++, kD.E = Date.now(), Aw[kZ] && kD.i >= Aw[kZ] && (kD.J = true), kD.q = Math.min(100 * (kD.i - 1), 4000), kD.q < 0 && (kD.q = 0);
      }
      var AX = {};
      AX._actionCallback = null, AX._actionFailCallback = null, AX.r = {};
      var Ab = {};
      Ab.captchMaskClosable = false, Ab.language = null;
      var AP = AX,
        k0 = Ab,
        k1 = {
          'init': function () {
            var ex = {
                dT: 0x174
              },
              ek = {
                dT: 0x6b4,
                dx: 0x38f,
                dC: 0x2ef
              },
              eA = {
                dT: 0x6b4,
                dx: 0x2ef,
                dC: 0x1b9
              },
              eG = {
                dT: 0x688
              },
              ed = {
                dT: 0x4d6,
                dx: 0x612
              },
              e9 = {
                dT: 0x59e,
                dx: 0x6ca
              },
              e7 = {
                dT: 0x1ee
              },
              xY = WV,
              kZ = {
                'lJytH': function (kD, kM) {
                  return kD(kM);
                },
                'SuwcF': function (kD, kM) {
                  var xp = k;
                  return kD(kM);
                },
                'ZNDSZ': function (kD, kM) {
                  return kD !== kM;
                }
              };
            dn.ALIYUN_WAF || (dn.ALIYUN_WAF = {
              'setActionCallback': function (kD) {
                var xI = xY;
                AP._actionCallback = kD;
              },
              'setActionFailCallback': function (kD) {
                var xl = xY;
                AP._actionFailCallback = kD;
              },
              'on': function (kD, kM, kK) {
                var xQ = xY,
                  kh = {
                    'tXtqN': function (kw, kv) {
                      var xV = k;
                      return kw !== kv;
                    }
                  };
                if ("string" != typeof kD || !kD) throw new TypeError("[ALIYUN_WAF] on() 调用失败：name 必须是非空字符串");
                if (!G8(kM)) throw new TypeError("[ALIYUN_WAF] on() 调用失败：callback 必须是函数");
                var kL,
                  kt = G7(kK) && true === kK.once,
                  kU = AP.r;
                return kU[kD] || (kU[kD] = []), kt ? (kL = function (kw) {
                  var xz = xQ,
                    kv = AP.r[kD];
                  if (kv) {
                    var ky = kv.indexOf(kL);
                    -1 !== ky && kv.splice(ky, 1);
                  }
                  kZ.lJytH(kM, kw);
                }).listener = kM : kL = kM, kU[kD].push(kL), function () {
                  var xm = xQ,
                    kw = AP.r[kD];
                  if (kw) {
                    var kv = kw.indexOf(kL);
                    kh.tXtqN(-1, kv) && kw.splice(kv, 1);
                  }
                };
              },
              'off': function (kD, kM) {
                var xo = xY;
                if (kD) {
                  if (kZ.SuwcF(G8, kM)) {
                    var kK = AP.r[kD];
                    if (kK) {
                      for (var kh = kK.length - 1; kh >= 0; kh--) kZ.ZNDSZ(kK[kh], kM) && kK[kh].listener !== kM || kK.splice(kh, 1);
                    }
                  } else delete AP.r[kD];
                } else AP.r = {};
              },
              'setConfig': function (kD) {
                var xF = xY;
                G7(kD) && Object.assign(k0, kD);
              }
            });
          },
          'H': function (kZ, kD) {
            var xs = WV;
            if (AP[kZ] && G8(AP[kZ])) try {
              AP[kZ](kD);
            } catch (kM) {}
          },
          'N': function (kZ, kD) {
            var xB = WV,
              kM = AP.r[kZ];
            if (kM && 0 !== kM.length) {
              for (var kK = kM.slice(), kh = 0; kh < kK.length; kh++) try {
                kK[kh](kD);
              } catch (kL) {}
            }
          },
          'n': function () {
            var xZ = WV;
            return k0.captchMaskClosable;
          },
          'R': function () {
            var xD = WV;
            if (-1 !== ['cn', 'en'].indexOf(k0.language)) return k0.language;
            try {
              return dn.navigator.language.startsWith('zh') ? 'cn' : 'en';
            } catch (kZ) {
              return 'cn';
            }
          }
        },
        k2 = k1,
        k3 = "acw-sc--v3",
        k4 = "acw_sc__v3";
      function k5(kZ) {
        var xM = WV;
        return kZ + '_' + k4;
      }
      function k6(kZ, kD) {
        var xK = WV;
        if (dQ[dY] && kD) {
          var kM = Gd(kZ);
          kM.host && GW(kZ, location.href) && GO(k5(kM.host), kD);
        }
      }
      var k7 = {};
      k7.html = "<div id=\"waf_nc_block\" style=\"display: none;\">\n    <div class=\"waf-nc-mask\"></div>\n    <div id=\"WAF_NC_WRAPPER\" class=\"waf-nc-wrapper\">\n        <p class=\"waf-nc-title\">访问验证</p>\n        <p class=\"waf-nc-description\">为保证您的正常访问，请进行如下验证。</p>\n        <p id=\"waf-nc-traceid\" class=\"waf-nc-traceid-class\"></p>\n        <div id=\"nocaptcha\"></div>\n    </div>\n</div>\n</div>", k7.css = "#waf_nc_block * {pointer-events: auto;}\n#waf_nc_block{position:fixed;_position:absolute;width:100%;height:100%;top:0;bottom:0;left:0;z-index:2000000000;}\n#waf_nc_block #aliyunCaptcha-sliding-slider{background:#ff6a00!important;font-family:aliyun-captcha-iconfont!important;}\n#waf_nc_block .aliyunCaptcha-show{margin-left: -24px;}\n#waf_nc_block #aliyunCaptcha-window-embed{margin-bottom: 10px!important}\n#waf_nc_block .waf-nc-mask{background:#000;opacity:.5;filter:alpha(opacity=50);width:100%;height:100%}\n#waf_nc_block .waf-nc-wrapper {min-height: 220px;width: 348px;text-align: center;position: absolute;top: 50%;left: 50%;transform: translate(-50%, -50%);background: #fff;box-shadow: 0 0 10px 0 rgba(0, 0, 0, 0.15);}\n#waf_nc_block .waf-nc-title{font-size:24px;font-weight:500;color:#181818;letter-spacing:1.71px;text-align:center}\n#waf_nc_block .waf-nc-description{margin-top:24px;margin-left:24px;font-size:14px;color:#666;text-align:left}\n#waf_nc_block .waf-nc-traceid-class{margin-top:8px;margin-left:24px;font-size:12px;color:#999;text-align:left}\n#nocaptcha{margin-left:24px;margin-top:14px}\n#waf_nc_block .nc_bg{background:#fff3ea!important}\n#waf_nc_block .btn_slide{background:#ff6a00!important;border:0!important;color:#fff!important;width:48px!important;height:48px!important;font-size:30px;font-weight:900!important;line-height:48px!important}\n#waf_nc_block .btn_ok{background:#ff6a00!important;border:0!important;color:#fff!important;width:48px!important;height:48px!important;font-size:30px;font-weight:900!important;line-height:48px!important}\n#waf_nc_block .nc_scale{background:rgba(241,241,242,1)!important;height:48px!important}#waf_nc_block .nc-lang-cnt{height:48px!important;margin-left:10px!important;line-height:48px!important;font-size:14px!important}\n#waf_nc_block .sm-pop-inner{position:relative!important}\n#waf_nc_block .captcha-error{margin-left:34px;color:#e00000;font-size:14px;font-weight:400;text-align:center;border-radius:4px;background-color:#ffeaea;width:280px;height:40px;line-height:40px}", k7.silderWidth = 0x12c, k7.silderHeight = 0x28;
      var k8 = {};
      k8.html = "<div id=\"waf_nc_block\" style=\"display: none\">\n    <div class=\"waf-nc-h5-mask\"></div>\n    <div id=\"WAF_NC_WRAPPER\" class=\"waf-nc-h5-wrapper\">\n        <p class=\"waf-nc-title\">访问验证</p>\n        <div class=\"waf-nc-description\">\n            为了您的操作安全，请完成以下验证\n        </div>\n        <p id=\"waf-nc-traceid\" class=\"waf-nc-traceid-class\"></p>\n        <div id=\"nocaptcha\" data-nc-idx=\"1\"></div>\n    </div>\n</div>", k8.css = "#waf_nc_block * {pointer-events: auto;}\n#waf_nc_block{position:fixed;_position:absolute;width:100%;height:100%;top:0;bottom:0;left:0;z-index:2000000000;}\n#waf_nc_block .waf-nc-h5-mask{background:#000;opacity:.5;filter:alpha(opacity=50);width:100%;height:100%}\n#waf_nc_block #aliyunCaptcha-sliding-wrapper #aliyunCaptcha-sliding-body #aliyunCaptcha-sliding-slider{background:#ff6a00!important;font-size:15px!important}\n#waf_nc_block #aliyunCaptcha-window-embed {margin-bottom: 10px!important;}\n#waf_nc_block #aliyunCaptcha-window-embed * {text-size-adjust: 100% !important;-webkit-text-size-adjust: 100% !important;-ms-text-size-adjust: 100% !important;-moz-text-size-adjust: 100% !important;}\n#waf_nc_block #aliyunCaptcha-sliding-body #aliyunCaptcha-sliding-slider{background:#ff6a00!important;}\n#waf_nc_block #aliyunCaptcha-sliding-wrapper #aliyunCaptcha-sliding-body #aliyunCaptcha-sliding-text-box span {font-size:15px!important}\n#waf_nc_block .waf-nc-h5-wrapper {min-height: 220px;width: var(--aliyunWaf-nc-wrapper-width, 340px);position: absolute;top: 20%;left: 50%;transform: translateX(-50%);background: #fff;border-radius: 9px;box-sizing: border-box;padding-top: 5%;text-align: center;}\n#waf_nc_block .waf-nc-title{margin-top:1px;font-size:16px;font-weight:500;color:#1a1a1a;text-align:center}#waf_nc_block .waf-nc-description{margin-top:24px;font-size:12px;color:#595959;text-align:center}#waf_nc_block .waf-nc-traceid-class{margin-top:8px;font-size:12px;color:#999;text-align:center}#waf_nc_block .nc_bg{background:#fff3ea!important}#waf_nc_block .btn_slide{background:#ff6a00!important;border:0!important;color:#fff!important;width:48px!important;height:48px!important;font-size:30px;font-weight:900!important;line-height:48px!important}#waf_nc_block .btn_ok{background:#ff6a00!important;border:0!important;color:#fff!important;width:48px!important;height:48px!important;font-size:30px;font-weight:900!important;line-height:48px!important}#waf_nc_block .nc_scale{background:rgba(241,241,242,1)!important;height:48px!important}#waf_nc_block .nc-lang-cnt{height:48px!important;margin-left:10px!important;line-height:48px!important;font-size:14px!important}\n#waf_nc_block .nc_wrapper{margin-left: auto;  margin-right: auto;}\n#waf_nc_block #aliyunCaptcha-checkbox-wrapper #aliyunCaptcha-checkbox-body #aliyunCaptcha-checkbox-left #aliyunCaptcha-checkbox-text-box {font-size:14px!important}\n#waf_nc_block #aliyunCaptcha-checkbox-icon{width:20px!important;height:20px!important}\n#waf_nc_block #aliyunCaptcha-checkbox-wrapper #aliyunCaptcha-captcha-fail,#aliyunCaptcha-captcha-refresh{font-size: 14px!important;}\n#waf_nc_block .aliyunCaptcha-checkbox-icon-checked {width:10px!important;height:5px!important;border-left:2px solid #009431 !important;border-bottom: 2px solid #009431 !important;transform:rotate(-45deg);}\n#waf_nc_block .aliyunCaptcha-loader{font-size:2px!important}\n#waf_nc_block .aliyunCaptcha-loader-icon{width:10px!important;height:10px!important;}\n#waf_nc_block .captcha-error{margin-left:34px;color:#e00000;font-size:14px;font-weight:400;text-align:center;border-radius:4px;background-color:#ffeaea;width:280px;height:40px;line-height:40px}\n", k8.silderWidth = 0x12c, k8.silderHeight = 0x28;
      var k9 = {};
      k9["waf-nc-description"] = "为保证您的正常访问,请进行如下验证", k9["waf-nc-title"] = "访问验证";
      var kd = {};
      kd["waf-nc-description"] = "Please slide to verify that you're not a robot", kd["waf-nc-title"] = "Access Verification";
      var kG = {};
      kG.cn = k9, kG.en = kd;
      var kA = {};
      kA.PC = k7, kA.mobile = k8, kA.i18n = kG;
      const kk = kA;
      var kW = false;
      function kT(kZ) {
        var xh = WV;
        try {
          for (var kD = JSON.parse(kZ), kM = dn.Object.keys(kk), kK = 0; kK < kM.length; ++kK) dn.Object.assign(kk[kM[kK]], kD[kM[kK]]);
          return true;
        } catch (kh) {
          return false;
        }
      }
      var kx = void 0;
      function kC(kZ, kD, kM, kK) {
        var eH = {
            dT: 0x4b7,
            dx: 0x2a5,
            dC: 0x722,
            dg: 0x2be,
            du: 0x2be,
            dc: 0x6c4,
            da: 0x589,
            dj: 0x357,
            dS: 0x2dc,
            de: 0x34b,
            dO: 0x754,
            dE: 0x587,
            dq: 0x35a,
            di: 0x7ab,
            dJ: 0x58e,
            dr: 0x80c,
            dH: 0x27f,
            dN: 0x23f,
            dn: 0x5bb,
            dR: 0x3a4,
            df: 0x1be
          },
          eO = {
            dT: 0x793
          };
        setTimeout(function () {
          var er = {
              dT: 0x182,
              dx: 0x790
            },
            eJ = {
              dT: 0x802
            },
            eE = {
              dT: 0x24f
            },
            xU = k,
            kh = {
              'uRkHr': function (W0) {
                var xL = k;
                return W0();
              },
              'onIAz': function (W0, W1) {
                var xt = k;
                return W0 + W1;
              },
              'zImmT': function (W0, W1) {
                return W0 == W1;
              },
              'dlMPT': "//o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js?t=",
              'herAt': function (W0, W1) {
                return W0 in W1;
              }
            };
          if (dR.getElementById("waf_nc_block")) {
            var kL = "4|1|3|2|6|5|0".split('|'),
              kt = 0;
            while (!![]) {
              switch (kL[kt++]) {
                case '0':
                  kb && (kb.innerHTML = ('cn' == kU ? "日志ID: " : "TraceID:") + dn._waf_traceid), false === kK.show_trace_id && kb && kb.parentNode.removeChild(kb), dR.getElementById("waf_nc_block").style.display = "block", kD ? kM() : function (W0, W1) {
                    var xw = xU,
                      W2 = dR.createElement("script"),
                      W3 = new Date(),
                      W4 = kh.onIAz(kh.onIAz(W3.getFullYear() + (W3.getMonth() + 1), W3.getDate()), W3.getHours());
                    W2.src = kh.zImmT(2, W1) ? kh.onIAz(kh.dlMPT, W4) : "//g.alicdn.com/AWSC/AWSC/awsc.js?t=" + W4, W0 && (kh.herAt("onload", W2) ? W2.onload = function () {
                      var xv = xw;
                      kh.uRkHr(W0);
                    } : W2.onreadystatechange = function () {
                      var xy = xw;
                      /loaded|complete/.test(W2.readyState) && W0();
                    }), G1().appendChild(W2);
                  }(kM, kZ);
                  continue;
                case '1':
                  var kU = k2.R(),
                    kw = kk.i18n.cn;
                  continue;
                case '2':
                  if (kK.title) {
                    var kv = (dR.getElementsByClassName("waf-nc-title") || [])[0];
                    kv && (kv.innerHTML = kK.title);
                  }
                  continue;
                case '3':
                  for (var ky in 'en' == kU && (kw = kk.i18n.en), kw) {
                    var kX = dR.getElementsByClassName(ky);
                    kX.length > 0 && (kX[0].innerHTML = kw[ky]);
                  }
                  continue;
                case '4':
                  kx || (kx = G0("body * {pointer-events:auto!important}")), G1().appendChild(kx);
                  continue;
                case '5':
                  var kb = dR.getElementById("waf-nc-traceid");
                  continue;
                case '6':
                  if (kK.description) {
                    var kP = (dR.getElementsByClassName("waf-nc-description") || [])[0];
                    kP && (kP.innerHTML = kK.description);
                  }
                  continue;
              }
              break;
            }
          } else kC(kZ, kD, kM, kK);
        }, 30);
      }
      var kg = kk.PC;
      function ku(kZ, kD) {
        var eQ = {
            dT: 0x54b,
            dx: 0x292,
            dC: 0x54b,
            dg: 0x609,
            du: 0x54b,
            dc: 0x54b,
            da: 0x4fb,
            dj: 0x4fb,
            dS: 0x54b,
            de: 0x568,
            dO: 0x447,
            dE: 0x4b7,
            dq: 0x2a5,
            di: 0x720,
            dJ: 0x4cc,
            dr: 0x3d4,
            dH: 0x1be,
            dN: 0x476,
            dn: 0x1be
          },
          eV = {
            dT: 0x2ab
          },
          el = {
            dT: 0x420,
            dx: 0x27c,
            dC: 0x192,
            dg: 0x196,
            du: 0x199,
            dc: 0x397,
            da: 0x1e0,
            dj: 0x778,
            dS: 0x53e,
            de: 0x216,
            dO: 0x20a,
            dE: 0x610,
            dq: 0x23f,
            di: 0x71d,
            dJ: 0x236,
            dr: 0x438,
            dH: 0x564,
            dN: 0x4cd
          },
          eY = {
            dT: 0x576,
            dx: 0x420
          },
          xX = WV,
          kM = {};
        kM.WRrqW = function (kh, kL) {
          return kh * kL;
        };
        var kK = kM;
        dR.getElementById("waf_nc_block") ? kZ() : function (kh) {
          var xb = xX,
            kL = {};
          kL.fOjEz = function (kX, kb) {
            return kX + kb;
          };
          var kt = kL;
          if (!kW) {
            var kU = dQ[dV];
            if (kU) {
              var kw = GE(dV + '_' + kU);
              if (kw) kT(kw), kh();else try {
                var kv = "https://o.alicdn.com/frontend-lib/captcha-lib/" + kU + ".json",
                  ky = new dn.XMLHttpRequest();
                ky.open("GET", kv), ky.onload = function (kX) {
                  var xP = xb;
                  kT(kw = ky.responseText) && GO(kt.fOjEz(dV, '_') + kU, kw, 43200000), kh();
                }, ky.ontimeout = ky.onerror = function (kX) {
                  kh();
                }, ky.timeout = 5000, ky.send();
              } catch (kX) {
                kh();
              }
            } else kh();
            kW = true;
          }
        }(function () {
          var C0 = xX,
            kh,
            kL;
          if (ds) {
            kg = kk.mobile, kh = kk.mobile.html;
            var kt = Ac();
            kk.mobile.silderWidth = kk.mobile.silderWidth * kt, kk.mobile.silderHeight = kk.mobile.silderHeight * kt, kL = kk.mobile.css, 1 != kt && (kL = kL.replace(/(\d+)px/g, function (kv, ky) {
              var C1 = C0;
              return kK.WRrqW(parseInt(ky, 10), kt) + 'px';
            }));
          } else kh = kk.PC.html, kL = kk.PC.css;
          var kU = dR.createElement("div");
          kU.innerHTML = kh;
          var kw = G0(kL);
          dR.body.appendChild(kU.firstChild), G1().appendChild(kw), kZ();
        });
      }
      function kc() {
        var C2 = WV,
          kZ = dR.getElementById("nocaptcha"),
          kD = dR.getElementById("waf_nc_block");
        kD && (kD.style.display = "none"), kZ && (kZ.innerHTML = '', kZ.className = '');
        try {
          G3(kx);
        } catch (kM) {}
      }
      function ka(kZ, kD, kM, kK) {
        var O0 = {
            dT: 0x4a5,
            dx: 0x7ae,
            dC: 0x2cf,
            dg: 0x81f,
            du: 0x5e9,
            dc: 0x76f,
            da: 0x6a8,
            dj: 0x73d,
            dS: 0x3cd,
            de: 0x688,
            dO: 0x17d,
            dE: 0x530,
            dq: 0x639,
            di: 0x5f3,
            dJ: 0x626,
            dr: 0x286,
            dH: 0x422,
            dN: 0x4d0,
            dn: 0x4c4,
            dR: 0x85d,
            df: 0x841,
            dp: 0x626,
            dY: 0x50f,
            dI: 0x7f6,
            dl: 0x7e2,
            dV: 0x609,
            dQ: 0x47d,
            dz: 0x4fb,
            dm: 0x5b2,
            dF: 0x2d3,
            ds: 0x414,
            dB: 0x75a,
            dZ: 0x189,
            dD: 0x5bc,
            dM: 0x678,
            dK: 0x79e,
            dh: 0x6fa,
            dL: 0x33a,
            dt: 0x6b8,
            dU: 0x379,
            dw: 0x442,
            dv: 0x833,
            dy: 0x46d,
            dX: 0x3a8,
            db: 0x3e7,
            dP: 0x4bf,
            G0: 0x189,
            G1: 0x506,
            G2: 0x61f,
            G3: 0x663,
            G4: 0x7c7,
            G5: 0x6cf,
            G6: 0x594,
            G7: 0x594,
            G8: 0x6ae
          },
          eP = {
            dT: 0x6ae
          },
          eD = {
            dT: 0x199
          },
          eZ = {
            dT: 0x844
          },
          eF = {
            dT: 0x480
          },
          C3 = WV,
          kh = {
            'hsmlT': function (kw) {
              return kw();
            },
            'ZJOqZ': "waf-nc-h5-mask"
          },
          kL = k2.R(),
          kt = kK.requestInfo,
          kU = kK.f;
        ku(function () {
          var ey = {
              dT: 0x577,
              dx: 0x4d6,
              dC: 0x612
            },
            ev = {
              dT: 0x223
            },
            eU = {
              dT: 0x557,
              dx: 0x29a,
              dC: 0x72c,
              dg: 0x317,
              du: 0x4cc,
              dc: 0x723,
              da: 0x800,
              dj: 0x85a,
              dS: 0x6d1,
              de: 0x78b
            },
            et = {
              dT: 0x223,
              dx: 0x317,
              dC: 0x572,
              dg: 0x6e1,
              du: 0x4a5,
              dc: 0x5de,
              da: 0x6dc,
              dj: 0x76d,
              dS: 0x1a4,
              de: 0x7e2,
              dO: 0x639,
              dE: 0x1c9,
              dq: 0x626,
              di: 0x286,
              dJ: 0x422,
              dr: 0x4d0,
              dH: 0x37a,
              dN: 0x557,
              dn: 0x29a,
              dR: 0x338,
              df: 0x746,
              dp: 0x77c,
              dY: 0x47d,
              dI: 0x5b0,
              dl: 0x6b6,
              dV: 0x468,
              dQ: 0x422,
              dz: 0x422,
              dm: 0x22b,
              dF: 0x354,
              ds: 0x7f8,
              dB: 0x2f4,
              dZ: 0x557,
              dD: 0x81f,
              dM: 0x2e0,
              dK: 0x1a1,
              dh: 0x4c7,
              dL: 0x739,
              dt: 0x3e8,
              dU: 0x458
            },
            eL = {
              dT: 0x577,
              dx: 0x577,
              dC: 0x4d6,
              dg: 0x612
            },
            eh = {
              dT: 0x557,
              dx: 0x29a,
              dC: 0x28b,
              dg: 0x38d,
              du: 0x312,
              dc: 0x557,
              da: 0x455,
              dj: 0x70a,
              dS: 0x40f,
              de: 0x5cf
            },
            C5 = C3,
            kw = {
              'qKXHQ': function (W2, W3) {
                var C4 = k;
                return W2(W3);
              },
              'HBOwV': "SLIDING",
              'PTLjL': function (W2, W3) {
                return W2 < W3;
              },
              'dlADG': function (W2, W3) {
                return W2 / W3;
              },
              'iSxRQ': "--aliyun-zoom-ratio",
              'GsUoN': "aliyunCaptcha-window-embed",
              'fspsV': "nocaptcha",
              'DruXp': function (W2, W3) {
                var C6 = C5;
                return W2 > W3;
              },
              'fIiWG': function (W2, W3) {
                var C7 = C5;
                return W2 + W3;
              },
              'ZHMgo': "!important"
            };
          if (2 == kZ) {
            k2.n() && function (W3) {
              var eK = {
                  dT: 0x393,
                  dx: 0x2a7,
                  dC: 0x4f7,
                  dg: 0x5cf
                },
                eM = {
                  dT: 0x675
                },
                C9 = C5,
                W4 = {
                  'yrXFQ': function (W9) {
                    var C8 = k;
                    return kh.hsmlT(W9);
                  }
                },
                W5 = dR.getElementById("waf_nc_block");
              if (W5) {
                var W6 = ds ? kh.ZJOqZ : "waf-nc-mask",
                  W7 = W5.getElementsByClassName(W6)[0];
                if (W7) {
                  var W8 = function () {
                    var Cd = C9;
                    W4.yrXFQ(kc), W3.p(), W7.removeEventListener("click", W8);
                  };
                  W7.addEventListener("click", W8);
                }
              }
            }(kM);
            var kv = 1,
              ky = Ac(),
              kX = Ag();
            kX < 340 || 1 !== ky ? (kv = (kX - 10) / 340, ky > 1 && (kv /= ky), kv = Math.max(0.5, kv), kv = Math.round(100 * kv) / 100, dR.documentElement.style.setProperty("--aliyunWaf-nc-wrapper-width", kX - 6 + 'px')) : dR.documentElement.style.removeProperty("--aliyunWaf-nc-wrapper-width");
            var kb = {};
            kb.width = kg.silderWidth, kb.height = kg.silderHeight;
            var kP = {
              'userId': kt.userId,
              'userUserId': kt.userUserId,
              'SceneId': kt.sceneId,
              'mode': "embed",
              'element': "#nocaptcha",
              'slideStyle': kb,
              'language': kL,
              'immediate': true,
              'success': kD,
              'fail': function (W3) {
                var CG = C5,
                  W4 = {};
                W4.reason = W3;
                var W5 = {};
                W5.reason = W3, k2.N(dH, W4), kM.H("_actionFailCallback", W5);
              },
              'getInstance': function (W3) {
                var CA = C5,
                  W4 = kw.qKXHQ(Av, "captchaV2");
                if (W4.J = false, W4.i = 0, W4.E = 0, W4.q = 0, W3) {
                  var W5 = W3.config.CaptchaType || "SLIDING";
                  if (ds && kw.HBOwV !== W5 && "CHECK_BOX" !== W5) {
                    var W6 = ky;
                    kw.PTLjL(dn.screen.width, 300) && (W6 = Math.round(kw.dlADG(kX, 320) * 100) / 100), dR.documentElement.style.setProperty(kw.iSxRQ, W6);
                    var W7 = dR.getElementById(kw.GsUoN),
                      W8 = dR.getElementById(kw.fspsV),
                      W9 = W7.offsetHeight;
                    W8.style.height = W9 * W6 + 'px';
                    var Wd = "margin";
                    kw.DruXp(ky, 1) && (Wd += "Top"), W7.style[Wd] = (W9 * W6 - W9) / 2 + 'px', W7.style.textAlign = "center";
                  }
                  if (kU.captcha_color) {
                    var WG = dR.getElementById("aliyunCaptcha-sliding-slider");
                    WG && WG.setAttribute("style", kw.fIiWG("background:", kU.captcha_color) + kw.ZHMgo);
                  }
                }
              },
              'verifyType': "1.0",
              'region': kt.region,
              'UserCertifyId': kt.traceid,
              'onError': function (W3) {
                var Ck = C5,
                  W4 = dR.getElementById("nocaptcha"),
                  W5 = Av("captchaV2");
                W4 && W5.J && (W4.innerHTML = "验证码初始化失败，请更换网络访问", W4.className = "captcha-error");
              },
              'onFallback': function () {},
              'rem': kv
            };
            function W2() {
              var CW = C5;
              kw.qKXHQ(initAliyunCaptcha, kP);
            }
            void 0 !== kt.captchaEndpoint && kt.captchaEndpoint instanceof Array && (kP.server = kt.captchaEndpoint), kC(kZ, dn.initAliyunCaptcha, W2, kU);
          } else {
            var W0 = {};
            W0.key1 = "code100", W0.user = "default", W0.aysnc = '1';
            var W1 = {
              'renderTo': "#nocaptcha",
              'appkey': "CF_APP_WAF",
              'scene': ds ? "register_h5" : "register",
              'trans': W0,
              'token': kt.token,
              'language': kL,
              'isEnabled': true,
              'times': 0x3,
              'width': kg.silderWidth,
              'success': kD,
              'foreign': !!kt.foreign,
              'fail': function (W4) {
                var CT = C5,
                  W5 = {};
                W5.reason = W4, executeCallback("_actionFailCallback", W5);
              },
              'error': function (W4) {}
            };
            function W3() {
              var eb = {
                  dT: 0x651
                },
                Cx = C5;
              AWSC.use('nc', function (W4, W5) {
                var CC = Cx;
                dn.nc = W5.init(W1);
              });
            }
            kC(kZ, dn.AWSC && dn.AWSC.use, W3, kU);
          }
        });
      }
      const kj = {};
      function kS(kZ) {
        var Cg = WV;
        if (!dQ[dY] || !GW(kZ, location.href)) return kZ;
        var kD = Gd(kZ),
          kM = {},
          kK = 0;
        for (var kh in kj) {
          var kL = GE(kj[kh](kD.host));
          kL && (kM[kh] = kL, ++kK);
        }
        return GE(Aq(kD.host)) && (++kK, AG(), kM[AS] = A9), 0 == kK ? kZ : (kD.search = GG(kD.search, kM), Gk(kD));
      }
      function kO() {
        var Cu = WV;
        return navigator && navigator.userAgent ? navigator.userAgent.toLowerCase() : '';
      }
      kj[Al] = AQ, kj[k4] = k5;
      const kE = ["type__", "refer__", "ipcity__", "md5__", "decode__", "encode__", "time__", "timestamp__", "type__"],
        kq = {},
        ki = {};
      function kJ(kZ) {
        var Cc = WV,
          kD = kZ.toString(16).toUpperCase();
        return kD.length < 2 && (kD = '0' + kD), kD = '%' + kD;
      }
      for (var kr = 0; kr <= 255; kr++) {
        var kH = String.fromCharCode(kr),
          kN = encodeURIComponent(kH);
        kN.length > 3 ? ki[kr] = kJ(kr) : ki[kr] = kN;
      }
      var kn = 1;
      function kR(kZ) {
        var Ca = WV;
        return kZ + "_dySig";
      }
      const kf = {
          'Y': function (kZ) {
            var Cj = WV;
            return !!GE(kR(kZ.host));
          },
          'I': function (kZ) {
            var CS = WV;
            GO(kR(kZ.host), "true", 43200000);
          },
          'l': function (kZ) {
            var Ce = WV;
            return !(GA(kZ) || kZ.host.match(/(cloudauth-device|captcha-(pro-)?open).*?\.aliyuncs\.com$/) || !kf.Y(kZ));
          },
          'V': function (kZ) {
            var CO = WV,
              kD,
              kM = 0;
            for (kD = 0; kD < kZ.length; kD++) kM = (kM << 7) - kM + 398 + kZ.charCodeAt(kD), kM |= 0;
            return kM;
          },
          'Q': function (kZ, kD, kM) {
            return !!kf.l(kZ) && kf.z(kZ, kD, kM);
          },
          'm': function (kZ) {
            var CE = WV;
            if (kq[kZ]) return kq[kZ];
            for (var kD = 0, kM = 0; kM < kZ.length; kM++) kD += kZ[kM].charCodeAt();
            var kK = kE[kD % kE.length] + kD % 10000;
            return kq[kZ] = kK, kK;
          },
          'o': function (kZ) {
            var Cq = WV,
              kD = Gd(kZ).host;
            return Gx(kZ, kf.m(kD));
          },
          'F': function () {
            var Ok = {
                dT: 0x784
              },
              Ci = WV,
              kZ;
            if (-1 === (kZ = kO()).indexOf("micromessenger") && -1 === kZ.indexOf("miniprogram")) try {
              var kD = dn.location.href,
                kM = kf.o(kD);
              di.forEach(function (kK) {
                var CJ = Ci;
                kM = Gx(kM, kK);
              }), kM !== kD && dn.history.replaceState(null, '', kM);
            } catch (kK) {}
          },
          'z': function (kZ, kD, kM) {
            var Cr = WV;
            kM || (kM = "ANY"), kM = kM.toUpperCase();
            var kK = Gk(kZ, true);
            if (kK = encodeURIComponent(kK), kD && -1 == ["GET", "HEAD"].indexOf(kM)) {
              if (dn.Uint8Array && kD instanceof Uint8Array) {
                for (var kh = '', kL = 0; kL < kD.byteLength; kL++) kh += ki[kD[kL]];
                kK += kh;
              } else kK += encodeURIComponent(kD);
            }
            var kt = kf.V(kK);
            kt = kt + '|' + dy() + '|' + new Date().getTime() + '|1';
            var kU = Gg.x(kt),
              kw = {};
            return kw[kf.m(kZ.host)] = kU, kZ.search = GG(kZ.search, kw), Gk(kZ);
          }
        },
        kp = kf.Q,
        kY = (kf.z, kf.o),
        kI = kf.I,
        kl = kf.m,
        kV = kf.l,
        kQ = kf.F;
      function kz(kZ) {
        kn = kZ;
      }
      var km;
      function ko() {
        var CH = WV;
        try {
          dn.console && window.console.debug && !dn.console.debug._waf_origin_debug && (dn.console.debug._waf_origin_debug = dw);
        } catch (kZ) {}
      }
      function kF(kZ, kD) {
        var Oj = {
            dT: 0x270,
            dx: 0x85b,
            dC: 0x7c6,
            dg: 0x59b,
            du: 0x270
          },
          Og = {
            dT: 0x480
          },
          Cn = WV,
          kM = {
            'CeyxS': function (kK, kh) {
              var CN = k;
              return kK(kh);
            }
          };
        dn._waf_reload_d1534705d = function (kK) {
          var Oa = {
              dT: 0x797,
              dx: 0x5dd
            },
            Ou = {
              dT: 0x47a
            },
            Cf = Cn,
            kh = {
              'Jgfpi': function (kL, kt) {
                var CR = k;
                return kM.CeyxS(kL, kt);
              },
              'LUmGU': "dySigV2"
            };
          !function (kL) {
            km = kL;
          }(kK), delete dn._waf_reload_d1534705d;
          try {
            kZ.remove();
          } catch (kL) {}
          if (kD) {
            const kt = Av("dySigV2");
            setTimeout(function () {
              var Cp = Cf;
              kh.Jgfpi(kD, kh.LUmGU);
            }, kt.q);
          }
        };
        try {
          const kK = G1();
          kK.firstChild ? kK.insertBefore(kZ, kK.firstChild) : kK.appendChild(kZ);
        } catch (kh) {}
      }
      if (GE("_waf_bd8ce2ce37")) {
        kz(2), dn._waf_bd8ce2ce37 = GE("_waf_bd8ce2ce37"), dn._waf_a86dfdc5f2 = GE("_waf_a86dfdc5f2");
        var ks = GE("_waf_a23a0b772");
        kF(Aa(ks, "/elopf3z6/ye5kgn3x/d8hdyctz", 0, true));
      }
      function kB() {
        var CY = WV;
        if (dQ.W) {
          var kZ = GT(location.href, dq);
          kZ && Object.defineProperty(document, "referrer", {
            'get'() {
              return kZ;
            },
            'configurable': true
          });
        }
      }
      !function () {
        var qC = {
            dT: 0x696,
            dx: 0x798,
            dC: 0x3d4
          },
          q8 = {
            dT: 0x4e5
          },
          q7 = {
            dT: 0x763
          },
          Eb = {
            dT: 0x4f8,
            dx: 0x75e,
            dC: 0x634,
            dg: 0x801,
            du: 0x75e,
            dc: 0x75e,
            da: 0x591,
            dj: 0x75e,
            dS: 0x17b,
            de: 0x3fa,
            dO: 0x5d1
          },
          EH = {
            dT: 0x553,
            dx: 0x174,
            dC: 0x651,
            dg: 0x444,
            du: 0x444,
            dc: 0x651
          },
          EJ = {
            dT: 0x371
          },
          EE = {
            dT: 0x812,
            dx: 0x7ca,
            dC: 0x41c,
            dg: 0x6ac,
            du: 0x741,
            dc: 0x6b4,
            da: 0x33b,
            dj: 0x6ab,
            dS: 0x31d,
            de: 0x182,
            dO: 0x844,
            dE: 0x6b4,
            dq: 0x2bb,
            di: 0x358,
            dJ: 0x6b4,
            dr: 0x5c8,
            dH: 0x7ec,
            dN: 0x478,
            dn: 0x6b4,
            dR: 0x81b,
            df: 0x7db,
            dp: 0x2d8,
            dY: 0x4d3,
            dI: 0x6ad,
            dl: 0x596,
            dV: 0x217,
            dQ: 0x1a9,
            dz: 0x7b1,
            dm: 0x809,
            dF: 0x319,
            ds: 0x4d3,
            dB: 0x62c,
            dZ: 0x36e,
            dD: 0x741,
            dM: 0x596,
            dK: 0x70f,
            dh: 0x52b,
            dL: 0x376,
            dt: 0x780,
            dU: 0x37c,
            dw: 0x540,
            dv: 0x3af,
            dy: 0x698,
            dX: 0x7e1,
            db: 0x76c,
            dP: 0x6ef,
            G0: 0x577,
            G1: 0x180,
            G2: 0x80e,
            G3: 0x59e,
            G4: 0x6ca,
            G5: 0x7a7,
            G6: 0x77f,
            G7: 0x3f8,
            G8: 0x270,
            G9: 0x5ad,
            Gd: 0x4d6,
            GG: 0x612,
            GA: 0x577,
            Gk: 0x59e,
            GW: 0x6ca,
            GT: 0x300,
            Gx: 0x3be,
            GC: 0x857,
            Gg: 0x63e,
            Gu: 0x53d,
            Gc: 0x6c3,
            Ga: 0x64f,
            Gj: 0x85b,
            GS: 0x7c6,
            Ge: 0x29c,
            GO: 0x29b,
            GE: 0x29b,
            Gq: 0x5d1,
            Gi: 0x251,
            GJ: 0x577,
            Gr: 0x4d6,
            GH: 0x295,
            GN: 0x4c8,
            Gn: 0x37c,
            GR: 0x5e7,
            Gf: 0x19f,
            Gp: 0x39c,
            GY: 0x3a2,
            GI: 0x744,
            Gl: 0x5d1,
            GV: 0x786,
            GQ: 0x4e0,
            Gz: 0x1ad,
            Gm: 0x285,
            Go: 0x285,
            GF: 0x276,
            Gs: 0x51c,
            GB: 0x1be,
            GZ: 0x4d3,
            GD: 0x4f2,
            GM: 0x6b2,
            GK: 0x59c,
            Gh: 0x238,
            GL: 0x62a,
            Gt: 0x273,
            GU: 0x590,
            Gw: 0x4ce,
            Gv: 0x7c7,
            Gy: 0x686,
            GX: 0x5f4,
            Gb: 0x277,
            GP: 0x3a2,
            A0: 0x6ac,
            A1: 0x324,
            A2: 0x678,
            A3: 0x79e,
            A4: 0x83d,
            A5: 0x79e,
            A6: 0x83d,
            A7: 0x61a,
            A8: 0x331,
            A9: 0x331,
            Ad: 0x1bf,
            AG: 0x58f,
            AA: 0x6b4,
            Ak: 0x788,
            AW: 0x541,
            AT: 0x7b5,
            Ax: 0x6cf,
            AC: 0x1cd
          },
          Ej = {
            dT: 0x6b4,
            dx: 0x671,
            dC: 0x6ab,
            dg: 0x387,
            du: 0x65f,
            dc: 0x776,
            da: 0x6ab,
            dj: 0x41b,
            dS: 0x366,
            de: 0x522,
            dO: 0x6ab,
            dE: 0x1d6,
            dq: 0x403,
            di: 0x69f,
            dJ: 0x6b4,
            dr: 0x408,
            dH: 0x33e,
            dN: 0x298,
            dn: 0x1f0,
            dR: 0x6b4,
            df: 0x346,
            dp: 0x6ab,
            dY: 0x18e,
            dI: 0x6b4,
            dl: 0x299,
            dV: 0x64c,
            dQ: 0x6ab,
            dz: 0x2af,
            dm: 0x181,
            dF: 0x85f,
            ds: 0x6b4,
            dB: 0x1e3,
            dZ: 0x6ab,
            dD: 0x6cd,
            dM: 0x38c,
            dK: 0x6ab,
            dh: 0x783,
            dL: 0x64e,
            dt: 0x258
          },
          Eg = {
            dT: 0x80d,
            dx: 0x1ec,
            dC: 0x452,
            dg: 0x625,
            du: 0x774,
            dc: 0x1aa
          },
          Ex = {
            dT: 0x2c1,
            dx: 0x625,
            dC: 0x66e,
            dg: 0x3a2,
            du: 0x3bf,
            dc: 0x2ef
          },
          ET = {
            dT: 0x625,
            dx: 0x66e,
            dC: 0x828,
            dg: 0x625,
            du: 0x1bf
          },
          E0 = {
            dT: 0x511,
            dx: 0x54f,
            dC: 0x511,
            dg: 0x625,
            du: 0x511
          },
          OP = {
            dT: 0x1b4,
            dx: 0x7f6
          },
          Oy = {
            dT: 0x225,
            dx: 0x5d1,
            dC: 0x4ec,
            dg: 0x7fa,
            du: 0x630,
            dc: 0x7cd,
            da: 0x629,
            dj: 0x5c6,
            dS: 0x375,
            de: 0x375,
            dO: 0x375,
            dE: 0x744,
            dq: 0x53e,
            di: 0x216,
            dJ: 0x591,
            dr: 0x53e,
            dH: 0x216,
            dN: 0x591,
            dn: 0x57a
          },
          OK = {
            dT: 0x251
          },
          OB = {
            dT: 0x4cd
          },
          Oo = {
            dT: 0x7a7
          },
          OQ = {
            dT: 0x511,
            dx: 0x54f,
            dC: 0x436,
            dg: 0x375,
            du: 0x436,
            dc: 0x625
          },
          OV = {
            dT: 0x76e,
            dx: 0x780,
            dC: 0x1bf,
            dg: 0x62c,
            du: 0x1bf,
            dc: 0x53d
          },
          Ol = {
            dT: 0x174,
            dx: 0x5a9,
            dC: 0x20f
          },
          On = {
            dT: 0x5fc
          },
          OE = {
            dT: 0x5fc
          },
          Cl = WV,
          kZ = {
            'Wvhpi': function (kM, kK) {
              var CI = k;
              return kM instanceof kK;
            },
            'bAbmW': function (kM, kK) {
              return kM == kK;
            },
            'QCFye': "json",
            'SlSNf': function (kM, kK) {
              return kM > kK;
            },
            'hirSH': "b63e746d3d0",
            'BfJfI': "sigchl",
            'JzgvC': "var",
            'TytyO': "function r(a",
            'xspMW': "6l9vPJp1BwS5GC",
            'QpiHt': function (kM, kK) {
              var CV = Cl;
              return kM(kK);
            },
            'ndXUt': "_waf_a86dfdc5f2",
            'IQffZ': function (kM, kK) {
              return kM < kK;
            },
            'YvWtA': function (kM, kK, kh) {
              return kM(kK, kh);
            },
            'KrcUp': function (kM, kK, kh) {
              return kM(kK, kh);
            },
            'KNxEx': function (kM, kK) {
              var CQ = Cl;
              return kM instanceof kK;
            },
            'HXzZh': function (kM, kK) {
              return kM == kK;
            },
            'NHwvy': "same-origin",
            'GTAmf': function (kM, kK, kh) {
              return kM(kK, kh);
            },
            'ufrzW': function (kM, kK) {
              return kM === kK;
            },
            'EIYhA': function (kM, kK) {
              return kM != kK;
            },
            'uYuGz': function (kM, kK) {
              return kM(kK);
            },
            'ZLVnl': "object",
            'umwMp': "dySigV2"
          };
        if (!dn._waf_async_initialized) {
          dn._waf_traceid = '', dn._waf_nc_width = 300, dn._waf_websdk_version = dp, dn._waf_async_initialized = true, k2.init();
          var kD = {
            's': [],
            'B': [],
            'Z': [],
            'D': void 0,
            'M': void 0,
            'K': void 0,
            'h': void 0,
            'L': void 0,
            't': false,
            'U': {},
            'H': function (kM, kK) {
              var Cz = Cl;
              kK && (this.U = Object.assign(this.U, kK)), this.U.timestamp = Date.now(), k2.H(kM, this.U);
            },
            'w': function (kM) {
              var Cm = Cl;
              if (kM) switch (kM.which) {
                case "jsclg":
                  this.B.push(kM);
                  break;
                case "captcha":
                  this.s.push(kM);
                  break;
                case "dySigV2":
                  this.Z.push(kM);
              }
            },
            'v': false,
            'y': 0x0,
            'X': function (kM, kK) {
              var Co = Cl,
                kh = kM.__send_headers;
              for (var kL in kK ? kD.M.apply(kM, kM.openArgs) : AF.apply(kM, kM.openArgs), kM.__send_headers = kh, kh) AZ.call(kM, kL, kh[kL]);
            },
            'b': function () {
              var Ec = {
                  dT: 0x648,
                  dx: 0x80d,
                  dC: 0x1ec,
                  dg: 0x73f,
                  du: 0x625,
                  dc: 0x1b1,
                  da: 0x491,
                  dj: 0x5e1,
                  dS: 0x505,
                  de: 0x348,
                  dO: 0x6c5,
                  dE: 0x3fd,
                  dq: 0x237,
                  di: 0x1ea
                },
                Eu = {
                  dT: 0x367,
                  dx: 0x648,
                  dC: 0x80d,
                  dg: 0x1ec,
                  du: 0x73f,
                  dc: 0x625,
                  da: 0x277,
                  dj: 0x625
                },
                EC = {
                  dT: 0x648,
                  dx: 0x80d,
                  dC: 0x1ec,
                  dg: 0x73f,
                  du: 0x625,
                  dc: 0x774
                },
                E4 = {
                  dT: 0x700
                },
                E3 = {
                  dT: 0x1d3
                },
                E1 = {
                  dT: 0x225,
                  dx: 0x511,
                  dC: 0x54f,
                  dg: 0x375,
                  du: 0x436
                },
                Ob = {
                  dT: 0x625,
                  dx: 0x625
                },
                Ow = {
                  dT: 0x629
                },
                OD = {
                  dT: 0x4a4
                },
                OF = {
                  dT: 0x84c
                },
                Om = {
                  dT: 0x84c
                },
                CM = Cl,
                kM = {
                  'oBqyx': function (kh) {
                    return kh();
                  },
                  'wjohJ': function (kh, kL) {
                    var CF = k;
                    return kh(kL);
                  },
                  'GkdmP': function (kh, kL) {
                    var Cs = k;
                    return kh(kL);
                  },
                  'WxUxa': function (kh, kL) {
                    var CB = k;
                    return kh(kL);
                  },
                  'bmkEo': function (kh, kL) {
                    return kh(kL);
                  },
                  'dFYNf': function (kh) {
                    var CZ = k;
                    return kh();
                  },
                  'iDLkm': function (kh, kL) {
                    return kh(kL);
                  },
                  'JzOhd': function (kh, kL, kt) {
                    var CD = k;
                    return kh(kL, kt);
                  },
                  'WVeuS': function (kh, kL) {
                    return kh > kL;
                  },
                  'pPmAs': "readystatechange",
                  'DBYfm': function (kh, kL) {
                    var CK = CM;
                    return kh != kL;
                  }
                };
              if (dn.XMLHttpRequest) {
                function send(kt) {
                  var Ov = {
                      dT: 0x5a2,
                      dx: 0x555,
                      dC: 0x744
                    },
                    OU = {
                      dT: 0x4db,
                      dx: 0x5e7,
                      dC: 0x555,
                      dg: 0x629,
                      du: 0x45d,
                      dc: 0x375,
                      da: 0x483,
                      dj: 0x375,
                      dS: 0x375,
                      de: 0x744,
                      dO: 0x53e,
                      dE: 0x216,
                      dq: 0x591,
                      di: 0x53e
                    },
                    Ot = {
                      dT: 0x744
                    },
                    OL = {
                      dT: 0x555,
                      dx: 0x66e,
                      dC: 0x30e,
                      dg: 0x44f,
                      du: 0x3a2,
                      dc: 0x625
                    },
                    CL = CM;
                  function kU() {
                    var Ch = k;
                    kM.oBqyx(AG), this.ori_event && this.ori_event.readystatechange && this.ori_event.readystatechange.length > 0 || kD.K.call(this, "readystatechange", function () {}), Ao.call(this, kt);
                  }
                  if (this.scene && delete this.scene, kU = kU.bind(this), dn.Blob && kt instanceof Blob) {
                    var kw = this;
                    kt.arrayBuffer().then(function (kb) {
                      var Ct = CL,
                        kP = "0|2|3|4|1".split('|'),
                        W0 = 0;
                      while (!![]) {
                        switch (kP[W0++]) {
                          case '0':
                            var W1 = new Uint8Array(kb);
                            continue;
                          case '1':
                            kM.oBqyx(kU);
                            continue;
                          case '2':
                            kw.sendBody = W1;
                            continue;
                          case '3':
                            var W2 = kM.wjohJ(Gd, kY(kw.openArgs[1]));
                            continue;
                          case '4':
                            if (kM.GkdmP(kV, W2)) {
                              if (1 == kn) {
                                var W3 = kp(W2, W1, kw.openArgs[0]);
                                kw.openArgs[1] = W3;
                              } else {
                                if (!km) {
                                  var W4 = 0;
                                  return void dn.setTimeout(function send() {
                                    var CU = Ct;
                                    W4 <= 15 ? km ? (km && km(kw), kD.X(kw), kU()) : dn.setTimeout(send, 10) : (kz(1), kU()), W4++;
                                  }, 10);
                                }
                                dn.XMLHttpRequest._waf_hook || (dn.XMLHttpRequest._waf_hook = true), ko(), kM.GkdmP(km, kw);
                              }
                              kD.X(kw);
                            }
                            continue;
                        }
                        break;
                      }
                    }).catch(function (kb) {
                      var Cw = CL;
                      kw.sendBody = kt, kU();
                    });
                  } else {
                    this.sendBody = kt;
                    var kv = kM.bmkEo(Gd, kY(this.openArgs[1]));
                    if (kV(kv)) {
                      if (1 == kn) {
                        var ky = kp(kv, kt, this.openArgs[0]);
                        this.openArgs[1] = ky;
                      } else {
                        if (!km) {
                          kw = this;
                          var kX = 0;
                          return void dn.setTimeout(function send() {
                            var Cv = CL;
                            kX <= 15 ? km ? (km && kM.WxUxa(km, kw), kD.X(kw), kM.oBqyx(kU)) : dn.setTimeout(send, 10) : (kz(1), kU()), kX++;
                          }, 10);
                        }
                        dn.XMLHttpRequest._waf_hook || (dn.XMLHttpRequest._waf_hook = true), ko(), km(this);
                      }
                      kD.X(this);
                    }
                    kM.dFYNf(kU);
                  }
                }
                function kh(kt) {
                  var Cy = CM;
                  Object.defineProperty(Am, 'on' + kt, {
                    'get': function () {
                      return this.P ? this.P['on' + kt] : void 0;
                    },
                    'set': function (kU) {
                      var CX = Cy;
                      this.P || (this.P = {}), this.P['on' + kt] && (kD.h.call(this, kt, this.P['on' + kt]), delete this.P['on' + kt]), kU && (kD.K.call(this, kt, kU), this.P['on' + kt] = kU);
                    },
                    'configurable': true
                  });
                }
                Am.setRequestHeader = function (kt, kU) {
                  var Cb = CM;
                  this.__send_headers || (this.__send_headers = {}), AZ.call(this, kt, kU), this.__send_headers[kt] = kU;
                }, kD.M = Am.open = function () {
                  var CP = CM;
                  this.scene = void 0, this.__send_headers = {};
                  var kt = arguments[1];
                  kt = kS(kt), arguments[1] = kt, this.openArgs = arguments, AF.apply(this, arguments);
                }, Am.send = send, kD.D = send, kD.K = dn.EventTarget.prototype.addEventListener = function (kt, kU, kw) {
                  var EW = {
                      dT: 0x698,
                      dx: 0x1c8,
                      dC: 0x260
                    },
                    Ek = {
                      dT: 0x225,
                      dx: 0x375,
                      dC: 0x790,
                      dg: 0x575,
                      du: 0x4d5,
                      dc: 0x790,
                      da: 0x37f,
                      dj: 0x2a2,
                      dS: 0x4c1,
                      de: 0x439,
                      dO: 0x3f2,
                      dE: 0x482,
                      dq: 0x61c,
                      di: 0x6b4,
                      dJ: 0x343,
                      dr: 0x2c8,
                      dH: 0x7c5,
                      dN: 0x5fd,
                      dn: 0x73f,
                      dR: 0x625,
                      df: 0x7fc,
                      dp: 0x375,
                      dY: 0x625
                    },
                    Ed = {
                      dT: 0x33c
                    },
                    E2 = {
                      dT: 0x4a7
                    },
                    g3 = CM,
                    kv = {
                      'vVeLK': function (kX, kb) {
                        var g0 = k;
                        return kM.iDLkm(kX, kb);
                      },
                      'cilqE': function (kX, kb, kP) {
                        var g1 = k;
                        return kM.JzOhd(kX, kb, kP);
                      },
                      'AIDqC': function (kX, kb) {
                        var g2 = k;
                        return kM.WVeuS(kX, kb);
                      }
                    };
                  if (!(this instanceof Az)) return As.call(this, kt, kU, kw);
                  this.ori_event || (this.ori_event = {});
                  var ky = kU;
                  kU = kM.pPmAs != kt ? function (kX) {
                    var E5 = {
                      dT: 0x225,
                      dx: 0x625
                    };
                    return function (kb) {
                      var g4 = k;
                      !this.scene && kX && kX.call(this, kb);
                    };
                  }(kU) : function (kX) {
                    var EA = {
                        dT: 0x225,
                        dx: 0x3ad,
                        dC: 0x607,
                        dg: 0x672,
                        du: 0x744,
                        dc: 0x7f0,
                        da: 0x607
                      },
                      E9 = {
                        dT: 0x516
                      },
                      E8 = {
                        dT: 0x61b
                      },
                      g5 = g3,
                      kb = {
                        'QxQsa': function (kP, W0) {
                          return kP != W0;
                        },
                        'UmRth': "dySig",
                        'wurev': "xhr",
                        'IwOTL': function (kP, W0) {
                          var g6 = g5;
                          return kv.vVeLK(kP, W0);
                        },
                        'xVVba': function (kP, W0, W1) {
                          var g7 = g5;
                          return kv.cilqE(kP, W0, W1);
                        },
                        'ZmgKh': function (kP, W0) {
                          var g8 = g5;
                          return kv.AIDqC(kP, W0);
                        },
                        'aSCzW': "utf-8"
                      };
                    return function (kP) {
                      var EG = {
                          dT: 0x625,
                          dx: 0x629
                        },
                        g9 = g5;
                      if (!this.scene) {
                        var W0 = this.openArgs[1];
                        if (4 === this.readyState) {
                          let W5 = kb.xVVba(AL, this, dz);
                          W5 && AJ(W5, W0);
                        }
                        if (4 === this.readyState && this.d0 && GW(W0, location.href)) {
                          var W1 = AL(this, k3, true);
                          W1 && (this.d0 = false, k6(W0, W1));
                        }
                        if (4 === this.readyState && kD.d1(this.status, this.getResponseHeader("Content-Type"))) {
                          var W2 = '';
                          try {
                            W2 = kb.ZmgKh(this.responseType.toLowerCase().indexOf("arraybuffer"), -1) ? new TextDecoder(kb.aSCzW).decode(this.response) : AM.get.call(this);
                          } catch (W7) {}
                          var W3 = this;
                          function W6(W8) {
                            var gd = g9;
                            W3.scene = W8, kb.QxQsa(kb.UmRth, W8) ? kD.w({
                              'type': kb.wurev,
                              'which': W8,
                              'd2': W3
                            }) : dn.setTimeout(function () {
                              var gG = gd;
                              kD.X(W3), kD.D.call(W3, W3.sendBody);
                            }, kb.IwOTL(Av, kb.UmRth).q);
                          }
                          var W4 = AL(this, "Punish-Type");
                          kD.d3(W2, W6, this.openArgs[1], false === this.openArgs[2], W4);
                        }
                        kX && !this.scene && kX.call(this, kP);
                      }
                    };
                  }(kU), As.call(this, kt, kU, kw), this.ori_event[kt] || (this.ori_event[kt] = []), this.ori_event[kt].push([ky, kU]);
                }, kD.h = dn.EventTarget.prototype.removeEventListener = function (kt, kU, kw) {
                  var gA = CM;
                  if (!kZ.Wvhpi(this, Az)) return AB.call(this, kt, kU, kw);
                  if (this.ori_event) {
                    for (var kv = this.ori_event[kt], ky = kU, kX = 0; kX < kv.length; ++kX) if (kZ.bAbmW(kv[kX][0], kU)) {
                      ky = kv[kX][1], kv.splice(kX, 1);
                      break;
                    }
                    AB.call(this, kt, ky, kw);
                  }
                };
                const kL = ["abort", "error", "load", "loadend", "loadstart", "progress", "timeout", "readystatechange"];
                for (var kK = 0; kK < kL.length; ++kK) kh(kL[kK]);
                Object.defineProperty(Am, "responseType", {
                  'get': function () {
                    var gk = CM;
                    return "json" != this.__real_responseType ? AK.get.call(this) : kZ.QCFye;
                  },
                  'set': function (kt) {
                    var gW = CM;
                    this.__real_responseType = kt, AK.set.call(this, kZ.QCFye == kt ? "text" : kt);
                  },
                  'configurable': true
                }), Object.defineProperty(Am, "response", {
                  'get': function () {
                    var gT = CM;
                    if (kM.DBYfm("json", this.__real_responseType)) return Ah.get.call(this);
                    try {
                      return JSON.parse(AM.get.call(this));
                    } catch (kt) {
                      return null;
                    }
                  },
                  'configurable': true
                }), Object.defineProperty(Am, "responseText", {
                  'get': function () {
                    var gx = CM;
                    if ("json" != this.__real_responseType) return AM.get.call(this);
                    throw new Error("The value is only accessible if the object's 'responseType' is '' or 'text' (was 'json')");
                  },
                  'configurable': true
                }), dn.XMLHttpRequest._waf_hook = true;
              }
            },
            'd3': function (kM, kK, kh, kL, kt) {
              var EO = {
                  dT: 0x285,
                  dx: 0x276,
                  dC: 0x51c,
                  dg: 0x744,
                  du: 0x5d1
                },
                Ee = {
                  dT: 0x277,
                  dx: 0x5c2,
                  dC: 0x33d,
                  dg: 0x6d9,
                  du: 0x2b4,
                  dc: 0x451,
                  da: 0x5df,
                  dj: 0x322,
                  dS: 0x5ba,
                  de: 0x691,
                  dO: 0x25e,
                  dE: 0x4d2,
                  dq: 0x642,
                  di: 0x751,
                  dJ: 0x1e1,
                  dr: 0x5fe,
                  dH: 0x772,
                  dN: 0x668,
                  dn: 0x816,
                  dR: 0x49d,
                  df: 0x3a2,
                  dp: 0x3a2,
                  dY: 0x313,
                  dI: 0x2fd,
                  dl: 0x210,
                  dV: 0x836,
                  dQ: 0x479,
                  dz: 0x836,
                  dm: 0x4ee
                },
                ES = {
                  dT: 0x29c,
                  dx: 0x29b,
                  dC: 0x3c4,
                  dg: 0x7ea,
                  du: 0x3c4,
                  dc: 0x857,
                  da: 0x63e,
                  dj: 0x29c,
                  dS: 0x49a,
                  de: 0x3ed,
                  dO: 0x85b,
                  dE: 0x7c6
                },
                gC = Cl,
                kU = Gd(kh),
                kw = '',
                kv = '',
                ky = {};
              ky.type = '', ky.url = kh;
              if (kD.U = ky, GA(kU)) return false;
              if (kM && "string" == typeof kM && (kM.indexOf("initAli".concat("yunCaptcha")) > -1 && /userUserId: ?requestInfo.userUserId/.test(kM) && kM.indexOf("window._w".concat("af_is_mobile")) > -1 || kM.indexOf("ff926c7f07e45e2e487a29a6197d3460") > -1 && kM.indexOf("eade71455e2ad9c6d08b82bc7d98df8c") > -1)) kw = "captcha", kv = '2', kD.U.type = "captcha";else {
                if (kM && "string" == typeof kM && kM.indexOf("appkey:".concat(" \"CF_APP_WAF\", // 应用")) > -1 && kM.indexOf("waf-nc-h5-mask") > -1) kw = "captcha", kD.U.type = "captcha";else {
                  if (kM && "string" == typeof kM && kM.indexOf("acw_s".concat("c__v2")) > -1 && kM.indexOf("var arg1") > -1) kw = "jsclg", kD.U.type = "jsclg";else {
                    if ("string" == typeof kM) {
                      const WA = function (Wk, WW) {
                        var gg = gC,
                          WT = 0;
                        return Wk.indexOf("aliyun_".concat("waf_")) > -1 && kZ.SlSNf(Wk.indexOf("371ac51ab53".concat("fc53eb6bf9aa462a72e9f")), -1) && Wk.indexOf(kZ.hirSH.concat("f33fa6ce3709868ba5f8b")) > -1 ? WT = 2 : (kZ.BfJfI == WW || kZ.SlSNf(Wk.indexOf(kZ.JzgvC.concat(" _0x2576")), -1) && Wk.indexOf("duCiQ',".concat("'MOvsy")) > -1 || Wk.indexOf(kZ.TytyO.concat(",J)")) > -1 && Wk.indexOf("IunBRbfp7MLmwv6AckTt".concat("iY1jgrHZxGhlzW3aVPqEFN5J")) > -1 || Wk.indexOf("function e(l".concat(",m)")) > -1 && kZ.SlSNf(Wk.indexOf(kZ.xspMW.concat("Ae8L70NoszbtVcuhx3igmdrFf")), -1)) && (WT = 1), WT;
                      }(kM, kt);
                      if (Ai(kM, kh), WA > 0) {
                        kD.U.type = "dySig", kI(kU), kh.indexOf(kl(kU.host)) > -1 && Ay("dySig");
                        if (Av("dySig").J) return kD.U.reason = "throttled", kD.H("_actionFailCallback"), false;
                        if (function () {
                          var gu = gC;
                          try {
                            Gq("_waf_bd8ce2ce37"), kZ.QpiHt(Gq, kZ.ndXUt), kZ.QpiHt(Gq, "_waf_a23a0b772"), delete dn._waf_bd8ce2ce37, delete dn._waf_a86dfdc5f2, delete dn._waf_reload_d1534705d;
                          } catch (Wk) {}
                        }(), 1 == WA) return delete kD.U.reason, kD.H("_actionCallback"), kz(1), kK("dySig"), true;
                        if (2 == WA) {
                          if (Av("dySigV2").J) return kD.U.reason = "throttled", kD.H("_actionFailCallback"), false;
                          delete kD.U.reason, kD.H("_actionCallback");
                          var kX = Aa(kM, "/elopf3z6/ye5kgn3x/d8hdyctz", "_waf_a23a0b772");
                          kz(2), Ay("dySigV2"), kK("dySigV2");
                          const Wk = Aj(kM);
                          return dn._waf_reload_d1534705d || (Wk._waf_bd8ce2ce37 && (dn._waf_bd8ce2ce37 = Wk._waf_bd8ce2ce37), kF(kX, kD.d4.bind(kD))), true;
                        }
                      }
                    }
                  }
                }
              }
              if ('' != kw) {
                Ai(kM, kh), Ay(kw);
                const WW = Av(kw);
                if (WW.J && !kD.t) return kD.t = true, kD.U.reason = "throttled", kD.H("_actionFailCallback"), false;
                if (WW.J) return false;
                switch (delete kD.U.reason, kD.H("_actionCallback"), kK(kw), kw) {
                  case "jsclg":
                    var kb = kM.split("var arg1='")[1].split('\x27;')[0];
                    if (40 === kb.length) !function (WT, Wx) {
                      var gc = gC;
                      for (var WC = JSON.parse("[15, 35, 29, 24, 33, 16, 1, 38, 10, 9, 19, 31, 40, 27, 22, 23, 25, 13, 6, 11,39,18,20,8, 14, 21, 32, 26, 2, 30, 7, 4, 17, 5, 3, 28, 34, 37, 12, 36]"), Wg = "3000176000856006061501533003690027800375", Wu = [], Wc = '', Wa = '', Wj = 0; Wj < WT.length; Wj++) for (var WS = WT[Wj], WO = 0; WO < WC.length; WO++) WC[WO] == Wj + 1 && (Wu[WO] = WS);
                      for (Wc = Wu.join(''), Wj = 0; kZ.IQffZ(Wj, Wc.length) && Wj < 40; Wj += 2) {
                        var WE = (kZ.YvWtA(parseInt, Wc.slice(Wj, Wj + 2), 16) ^ kZ.KrcUp(parseInt, Wg.slice(Wj, Wj + 2), 16)).toString(16);
                        1 == WE.length && (WE = '0' + WE), Wa += WE;
                      }
                      AV(Wx, Wa);
                    }(kb, kh), kL ? kD.d4() : dn.setTimeout(kD.d4.bind(kD), WW.q);else {
                      kX = Aa(kM, "/nfb8ouq4/om6lhs71/109xfjkc");
                      var kP = dn.arg1;
                      dn.arg1 = kb, dn.nothing2reload10ba = function (WT) {
                        var ga = gC;
                        dn.arg1 = kP, AV(kh, WT);
                        try {
                          G3(kX);
                        } catch (Wx) {}
                        delete dn.nothing2reload10ba, kL ? kD.d4() : dn.setTimeout(kD.d4.bind(kD), WW.q);
                      };
                      try {
                        G1().appendChild(kX);
                      } catch (WT) {}
                    }
                    return true;
                  case "captcha":
                    var W0 = "0b72f618-4c1-4aba-9a78-f" + new Date().getTime() + 'ba',
                      d = {},
                      W1 = /var requestInfo = ({[\s\S]*?});/g.exec(kM);
                    null !== W1 ? W0 = (d = new Function("return " + W1[1])()).token : d.token = W0;
                    var W2 = {};
                    try {
                      for (var W3 = kM.match(/<textarea id="styleData"[^>]*>([\s\S]*?)<\/textarea>/i), W4 = W3 ? W3[1].trim() : '[]', W5 = k2.R(), W6 = JSON.parse(W4) || [], W7 = 0; W7 < W6.length; W7++) if (W6[W7].language == W5) {
                        W2 = W6[W7];
                        break;
                      }
                    } catch (Wx) {}
                    if ('2' === kv) d.region || d.region, d.traceid ? dn._waf_traceid = d.traceid : dn._waf_traceid = kD.d5(kM);else {
                      if (dn._waf_traceid = kD.d5(kM), !kD.v) {
                        var W8,
                          W9 = /window.(aliyun_captcha(id|trace)_[0-9a-f]{4}) ='([0-9a-f]+)';/gm;
                        for (d.d6 = []; null !== (W8 = W9.exec(kM));) W8.index === W9.lastIndex && W9.lastIndex++, d.d6.push(W8[1]), W8[1] && W8[3] && (dn[W8[1]] = W8[3]);
                      }
                      (kM.indexOf("language: \"en\",//语言包，默认中文") > -1 || kM.indexOf("language: \"en\", //语言包，默认中文") > -1) && (d.foreign = true);
                    }
                    var Wd = {};
                    Wd.requestInfo = d, Wd.f = W2;
                    var WG = Wd;
                    return kD.d7(W0, kv, WG), true;
                }
              }
              return false;
            },
            'p': function () {
              this.v = false, this.s = [], k2.N(dJ, {});
            },
            'd8': function () {
              var EX = {
                  dT: 0x7a1,
                  dx: 0x7fc,
                  dC: 0x5ed,
                  dg: 0x2b5,
                  du: 0x444,
                  dc: 0x651,
                  da: 0x5ed,
                  dj: 0x2cb,
                  dS: 0x73c,
                  de: 0x2cb,
                  dO: 0x4d5,
                  dE: 0x5f2,
                  dq: 0x72e,
                  di: 0x48f,
                  dJ: 0x4f0,
                  dr: 0x4ec,
                  dH: 0x3d4,
                  dN: 0x73c,
                  dn: 0x7fa,
                  dR: 0x630,
                  df: 0x5d1,
                  dp: 0x7cd,
                  dY: 0x5d1,
                  dI: 0x3d4,
                  dl: 0x3f3,
                  dV: 0x3f3,
                  dQ: 0x4f8,
                  dz: 0x625,
                  dm: 0x3d4,
                  dF: 0x3d4,
                  ds: 0x3d4,
                  dB: 0x630,
                  dZ: 0x7cd,
                  dD: 0x5d1,
                  dM: 0x19a,
                  dK: 0x625,
                  dh: 0x630,
                  dL: 0x7cd
                },
                Ey = {
                  dT: 0x4a1
                },
                Ev = {
                  dT: 0x779
                },
                Ez = {
                  dT: 0x3d4,
                  dx: 0x3f3,
                  dC: 0x4f8,
                  dg: 0x625
                },
                EQ = {
                  dT: 0x174,
                  dx: 0x3d4,
                  dC: 0x45f,
                  dg: 0x3f3,
                  du: 0x3f3,
                  dc: 0x30b,
                  da: 0x625
                },
                En = {
                  dT: 0x3c4
                },
                Er = {
                  dT: 0x7f9
                },
                gS = Cl,
                kM = {
                  'iYyjH': function (kL, kt) {
                    return kL instanceof kt;
                  },
                  'fxbAk': function (kL, kt, kU, kw) {
                    var gj = k;
                    return kL(kt, kU, kw);
                  },
                  'HXdIS': "GET",
                  'buZuZ': function (kL, kt, kU) {
                    var ge = gS;
                    return kL(kt, kU);
                  }
                };
              if (dn.fetch) {
                var kK = Request;
                dn.Request = function (kL, kt) {
                  var gO = gS,
                    kU = new kK(kL, kt);
                  return kM.iYyjH(kL, kK) && (kt = Object.assign(kL.init ? Object.assign({}, kL.init) : {}, kt), kL = kL.input), kU.input = kL, kU.init = kt, kU;
                };
                try {
                  dn.Request.prototype = kK.prototype;
                } catch (kL) {}
                var kh = fetch;
                dn.fetch = function fetch() {
                  var EF = {
                      dT: 0x5d0
                    },
                    Eo = {
                      dT: 0x7bf
                    },
                    Em = {
                      dT: 0x174,
                      dx: 0x3d4
                    },
                    EV = {
                      dT: 0x444,
                      dx: 0x651,
                      dC: 0x75e,
                      dg: 0x17b,
                      du: 0x3fa,
                      dc: 0x5d1,
                      da: 0x591
                    },
                    El = {
                      dT: 0x744
                    },
                    Ef = {
                      dT: 0x345,
                      dx: 0x61c,
                      dC: 0x687,
                      dg: 0x6b4,
                      du: 0x264,
                      dc: 0x284
                    },
                    gE = gS,
                    kt = {
                      'vfbEk': "content-type",
                      'kUSRV': function (kP, W0) {
                        return kP > W0;
                      },
                      'bepot': function (kP, W0) {
                        var gq = gE;
                        return kZ.QpiHt(kP, W0);
                      },
                      'xSxZh': function (kP, W0, W1) {
                        return kP(W0, W1);
                      },
                      'yarxk': "Punish-Type"
                    },
                    kU = arguments[0],
                    kw = arguments[1];
                  if (kU instanceof kK) {
                    var kv = {};
                    kU.headers.forEach(function (kP, W0) {
                      var gi = gE;
                      kt.vfbEk === W0.toLowerCase() && kt.kUSRV(kP.indexOf("multipart/form-data;"), -1) || (kv[W0] = kP);
                    }), kU = arguments[0].input, (kw = arguments[0].init) || (kw = {}), kw.headers = kv;
                  }
                  try {
                    dn.URL && kZ.KNxEx(kU, dn.URL) && (kU = kU.href);
                  } catch (kP) {}
                  kZ.HXzZh(null, kw) ? kw = {
                    'credentials': kZ.NHwvy
                  } : kw.credentials || (kw.credentials = "same-origin");
                  var ky,
                    kX = Gd(kU = kS(kU = kY(kU)));
                  function kb(W0, W1) {
                    var EY = {
                        dT: 0x3c9
                      },
                      gJ = gE,
                      W2 = {
                        'ouTlG': function (W4, W5) {
                          return W4(W5);
                        }
                      },
                      W3 = {};
                    return W3.input = W0, W3.init = W1, km ? (dn.fetch._waf_oriFetch || (dn.fetch._waf_oriFetch = kh.bind(dn), dn.fetch._waf_hook = true), km(W3)) : new Promise(function (W4) {
                      var EI = {
                          dT: 0x444,
                          dx: 0x651,
                          dC: 0x744,
                          dg: 0x262
                        },
                        gH = gJ,
                        W5 = {
                          'TcbVr': function (W7, W8) {
                            var gr = k;
                            return W2.ouTlG(W7, W8);
                          }
                        },
                        W6 = 0;
                      dn.setTimeout(function fetch() {
                        var gN = gH,
                          W7 = {};
                        W7.input = W0, W7.init = W1, W6 <= 15 ? km ? W4(km(W7)) : dn.setTimeout(fetch, 10) : (W5.TcbVr(kz, 1), W4(kh(W0, W1))), W6++;
                      }, 10);
                    });
                  }
                  return AG(), kV(kX) ? 1 == kn ? dn.Blob && kw.body && kZ.KNxEx(kw.body, Blob) ? ky = kw.body.arrayBuffer().then(function (W0) {
                    var gn = gE,
                      W1 = new Uint8Array(W0),
                      W2 = Object.assign({}, kw);
                    W2.body = W1;
                    var W3 = kM.fxbAk(kp, kX, W1, kw.method ? kw.method : kM.HXdIS);
                    return kh.call(this, W3, W2);
                  }.bind(this)).catch(function (W0) {
                    var gR = gE,
                      W1 = kp(kX, kw.body, kw.method ? kw.method : "GET");
                    return kh.call(this, W1, kw);
                  }.bind(this)) : (kU = kp(kX, kw.body, kw.method ? kw.method : "GET"), ky = kh.call(this, kU, kw)) : (ko(), ky = dn.Blob && kw.body && kw.body instanceof Blob ? kw.body.arrayBuffer().then(function (W0) {
                    var gf = gE,
                      W1 = new Uint8Array(W0),
                      W2 = Object.assign({}, kw);
                    return W2.body = W1, kb(kU, W2);
                  }.bind(this)).catch(function (W0) {
                    var gp = gE;
                    return kM.buZuZ(kb, kU, kw);
                  }.bind(this)) : kZ.GTAmf(kb, kU, kw)) : ky = kh.call(this, kU, kw), ky.then(function (W0) {
                    var Ew = {
                        dT: 0x2e3,
                        dx: 0x5ed,
                        dC: 0x73f,
                        dg: 0x5ed,
                        du: 0x73f,
                        dc: 0x37f,
                        da: 0x5ed,
                        dj: 0x439,
                        dS: 0x413,
                        de: 0x695,
                        dO: 0x1aa,
                        dE: 0x630,
                        dq: 0x7cd
                      },
                      Et = {
                        dT: 0x75e,
                        dx: 0x51b
                      },
                      Es = {
                        dT: 0x4aa
                      },
                      gl = gE,
                      W1 = {
                        'nCvxL': function (W2, W3) {
                          var gY = k;
                          return kt.bepot(W2, W3);
                        },
                        'ghUfV': function (W2, W3, W4) {
                          var gI = k;
                          return kt.xSxZh(W2, W3, W4);
                        },
                        'LTxSz': kt.yarxk
                      };
                    return new Promise(function (W2, W3) {
                      var EB = {
                          dT: 0x242
                        },
                        gQ = gl,
                        W4 = {
                          'rePcG': function (W8, W9) {
                            var gV = k;
                            return W1.nCvxL(W8, W9);
                          }
                        };
                      W1.ghUfV(k6, kU, W0.headers.get(k3));
                      let W5 = W0.headers.get(dz);
                      if (W5 && AJ(W5, kU), !kD.d1(W0.status, W0.headers.get("Content-Type"))) return void W2(W0);
                      const W6 = W0.clone();
                      var W7 = '';
                      try {
                        W7 = W0.headers.get(W1.LTxSz);
                      } catch (W8) {}
                      W6.text().then(function (W9) {
                        var EL = {
                            dT: 0x698,
                            dx: 0x4b1,
                            dC: 0x630,
                            dg: 0x7cd
                          },
                          ED = {
                            dT: 0x406
                          },
                          EZ = {
                            dT: 0x51b
                          },
                          gm = gQ,
                          Wd = {
                            'wEJYs': function (WG, WA) {
                              var gz = k;
                              return W4.rePcG(WG, WA);
                            },
                            'UECWm': "fetch"
                          };
                        kD.d3(W9, function (WG) {
                          var EK = {
                              dT: 0x68f
                            },
                            gF = gm,
                            WA = {
                              'CzrTM': function (Wk, WW) {
                                var go = k;
                                return Wd.wEJYs(Wk, WW);
                              }
                            };
                          "dySig" != WG ? kD.w({
                            'type': Wd.UECWm,
                            'which': WG,
                            'd9': kU,
                            'dd': kw,
                            'dG': function (Wk) {
                              W2(Wk);
                            },
                            'reject': W3
                          }) : fetch(kU, kw).then(function (Wk) {
                            var gs = gF;
                            WA.CzrTM(W2, Wk);
                          }).catch(function (Wk) {
                            W3(Wk);
                          });
                        }, kU, false, W7) || W4.rePcG(W2, W0);
                      }).catch(function (W9) {
                        W2(W0);
                      });
                    });
                  }).catch(function (W0) {
                    var gB = gE;
                    return Promise.reject(W0);
                  });
                }, dn.fetch._waf_hook = true, dn.fetch._waf_oriFetch = kh.bind(dn);
              }
            },
            'd1': function (kM, kK) {
              var gZ = Cl;
              return 200 == kM && kK && kK.indexOf("text/html") > -1;
            },
            'd7': function (kM, kK, kh) {
              var q4 = {
                  dT: 0x5d3,
                  dx: 0x7c7,
                  dC: 0x3a2,
                  dg: 0x486,
                  du: 0x7c7,
                  dc: 0x22a,
                  da: 0x6c7,
                  dj: 0x55e,
                  dS: 0x585
                },
                q3 = {
                  dT: 0x79f
                },
                q2 = {
                  dT: 0x813,
                  dx: 0x866,
                  dC: 0x454,
                  dg: 0x356,
                  du: 0x579,
                  dc: 0x3a2,
                  da: 0x7c7,
                  dj: 0x6c6
                },
                gD = Cl,
                kL = {
                  'ZtYPc': "string",
                  'OAWKU': function (ky, kX) {
                    return ky <= kX;
                  },
                  'cgmFH': function (ky, kX, kb, kP, W0) {
                    return ky(kX, kb, kP, W0);
                  }
                },
                kt = this;
              if (!kt.v) {
                kt.v = true;
                var kU = kh.requestInfo;
                if (2 == kK) {
                  Ay("captchaV2");
                  var kw = Av("captchaV2"),
                    kv = function () {
                      var gM = gD;
                      kL.cgmFH(ka, kK, function (ky) {
                        var gK = gM;
                        ("function" != typeof window.AliyunCaptcha || kL.ZtYPc == typeof ky && kL.OAWKU(ky.length, 5)) && kw.J || (k2.N(dr, {
                          'dA': ky
                        }), kt.d4({
                          'u_atoken': kU.token,
                          'u_asig': ky,
                          'u_aref': kU.refer
                        }));
                      }, kD, kh);
                    };
                  kw.q > 0 ? dn.setTimeout(kv, kw.q) : kv();
                } else ka(kK, function (ky) {
                  var gh = gD;
                  if (kZ.ufrzW(void 0, ky.token) && (ky.token = kM), kU.d6) {
                    for (var kX = 0; kX < kU.d6.length; ++kX) delete dn[kU.d6[kX]];
                  }
                  var kb = {};
                  kb.u_atoken = ky.token, kb.u_asession = ky.sessionId, kb.u_asig = ky.sig, kt.d4(kb);
                }, kD, kh);
              }
            },
            'd4': function (kM) {
              var qW = {
                  dT: 0x83a,
                  dx: 0x3a2,
                  dC: 0x2ef,
                  dg: 0x2ff,
                  du: 0x7ca,
                  dc: 0x375,
                  da: 0x629,
                  dj: 0x5f5,
                  dS: 0x76e,
                  de: 0x755,
                  dO: 0x21d,
                  dE: 0x70a,
                  dq: 0x40f,
                  di: 0x30e,
                  dJ: 0x44f,
                  dr: 0x625,
                  dH: 0x707,
                  dN: 0x503,
                  dn: 0x7ca,
                  dR: 0x274,
                  df: 0x41c,
                  dp: 0x4d3,
                  dY: 0x76e,
                  dI: 0x1f1,
                  dl: 0x630,
                  dV: 0x7cd
                },
                qk = {
                  dT: 0x4a1
                },
                qA = {
                  dT: 0x4eb
                },
                qG = {
                  dT: 0x790
                },
                q6 = {
                  dT: 0x3c4
                },
                gU = Cl,
                kK = {
                  'dIegc': function (kL, kt) {
                    var gL = k;
                    return kZ.QpiHt(kL, kt);
                  },
                  'NLPDd': function (kL, kt) {
                    var gt = k;
                    return kZ.EIYhA(kL, kt);
                  },
                  'SfCvg': "xhr",
                  'jXvRv': "captcha",
                  'kmEFy': function (kL, kt) {
                    var gw = gU;
                    return kZ.uYuGz(kL, kt);
                  },
                  'awESi': function (kL, kt) {
                    return kL === kt;
                  },
                  'ghFPA': "fetch",
                  'enARC': kZ.ZLVnl,
                  'GwQdn': function (kL, kt, kU) {
                    return kL(kt, kU);
                  }
                },
                kh;
              kM ? (kc(), this.v = false) : this.y += 1, (kh = kZ.umwMp === kM ? this.Z : kM ? this.s : this.B) && kh[0] && (kh[0].dk = true), function kL(kt) {
                var gv = gU;
                if (kK.NLPDd(0, kt.length)) {
                  var kU = kt[0];
                  if (kt.splice(0, 1), "xhr" === kU.type) {
                    var kw = kU.d2,
                      kv = kU.d2,
                      ky = kv.openArgs,
                      kX = kv.sendBody,
                      kb = ky[1];
                    if ("captcha" === kU.which && kU.dk) (kP = kK.kmEFy(Gd, kb)).search = GG(kP.search, kM), ky[1] = Gk(kP), kw.d0 = true;
                    kD.X(kv, true), kw.addEventListener("readystatechange", function (W1) {
                      var gy = gv;
                      4 === kw.readyState && kL(kt);
                    }), kD.D.call(kw, kX);
                  } else {
                    if ("fetch" === kU.type) {
                      kb = kU.d9;
                      var kP,
                        W0 = kU.dd;
                      if (kK.enARC == typeof kb && kb.url && kU.dW) kb = kU.dW;else {
                        if ("captcha" === kU.which && kU.dk) (kP = kK.kmEFy(Gd, kb)).search = GG(kP.search, kM), kb = kK.kmEFy(Gk, kP);
                      }
                      fetch(kb, W0).then(function (W1) {
                        var gX = gv;
                        kU.dG(W1), kK.dIegc(kL, kt);
                      }).catch(function (W1) {
                        var gb = gv;
                        kU.reject(W1);
                      });
                    }
                  }
                }
              }(kh);
            },
            'd5': function (kM) {
              var gP = Cl,
                kK = "2|3|4|1|0".split('|'),
                kh = 0;
              while (!![]) {
                switch (kK[kh++]) {
                  case '0':
                    return kM.substring(kt + 2, kL);
                  case '1':
                    var kL = kM.indexOf("</div>", kt);
                    continue;
                  case '2':
                    var kt = kM.indexOf("id=\"traceid\"");
                    continue;
                  case '3':
                    if (-1 == kt) return '';
                    continue;
                  case '4':
                    kt = kM.indexOf(':\x20', kt);
                    continue;
                }
                break;
              }
            }
          };
          kD.b(), kD.d8(), kB(), kQ(), db(function () {
            var u0 = Cl;
            dn._waf_body_copy = dR.body;
          });
        }
      }();
    }();
  })();
