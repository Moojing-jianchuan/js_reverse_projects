/**
 * generate_decode_1174_full.js
 *
 * pzds.com 阿里云 WAF decode__1174 完整离线生成脚本 (2026-05-25 更新)
 *
 * 公式: decode__1174 = "214d4f07715-" + O(ag)
 *   ag = [a2(a0(ao)), a2(a0(aI)), w(), timestamp, waf_token, waf_ts, M()].join("|")
 *   ao = encodeURIComponent(waf_token + method + "214d4f07715" + url_path + body)
 *   aI = encodeURIComponent(waf_token + method + "214d4f07715" + url_path)
 */

// ============================================================
// 第一部分: 常量
// ============================================================
var PREFIX = "214d4f07715-";
var Q = "TXiPqC/jvmu_y61N2At0c=ezZwknOK4bfxJsWl8SGQFLhHgM9YDI7pVUoBaRd53Er";
var go = 790;
var R = ["0","1","2","3","4","5","6","7","8","9","A","B","C","D","E","F"];

// ============================================================
// 第二部分: az mock 表 (2026-05-25 更新, 包含 P 函数所需条目)
// ============================================================
var _az = {
  444:"GCUyK",448:"UGWZl",451:"LsFmD",452:"qzDla",454:"map",455:"zSUuC",457:"zCkrT",
  458:"SGWRp",460:"name",461:"RQAjw",464:"AdMan",465:"RQrvL",466:"QtFra",471:"pow",
  472:"indexOf",474:"IMyeb",476:"ETQOF",478:"Date",479:"xXjJD",482:"_waf_a86df",
  484:"iIAJF",485:"PyswL",486:"decodeURIC",487:"aJLfp",488:"gNRda",495:"omponent",
  500:"SVGAnimate",502:"EqsOC",503:"NWKPn",504:"wvYez",505:"SVwxy",506:"KADHj",
  510:"qxPKM",514:"WNLve",516:"charAt",517:"RMnHf",520:"ESjZn",523:"xWOsP",524:"length",
  525:"getItem",528:"RpWAF",533:"constructo",535:"match",536:"gOrSm",537:"hDFtW",
  538:"yVykg",539:"Kxeuo",541:"CAtqy",545:"hasOwnProp",546:"FXDgl",547:"iPySQ",
  550:"JSON",552:"RyYKO",555:"filter",559:"WSaNg",563:"ENaet",564:"yhfpq",565:"nhWKM",
  566:"hXebv",567:"now",568:"LPFPg",570:"Mgmzx",572:"ptEau",576:"call",577:"rVFAP",
  579:"oJoiF",584:"RBpUf",586:"WViGH",587:"uiwTP",591:"VAyrq",595:"BBXfc",597:"charCodeAt",
  598:"gESDc",601:"Rwujw",605:"CGKox",606:"XGNFC",607:"rHPJu",608:"JDgTO",610:"push",
  612:"test",613:"WGXmV",614:"esdxp",615:"ItvWa",618:"AmEQk",620:"FZexk",621:"cOllC",
  622:"TNBNC",625:"NPZwW",628:"XaAWn",630:"stack",631:"parseInt",632:"stackTrace",
  633:"HkTVe",634:"SRwtQ",635:"prototype",639:"Object",640:"tmFvY",642:"pYuYh",
  645:"Math",646:"hkkxk",647:"gCINr",648:"XQdTt",651:"AMKri",652:"rIScW",661:"RpJkL",
  663:"tuVBR",665:"apVtw",667:"KGZYq",668:"tVXLz",669:"hHjJY",670:"IxIHm",673:"dc5f2",
  675:"PeGhO",676:"dmakK",678:"QGUCW",679:"nxxAo",684:"icMwV",687:"getTime",691:"lyMBh",
  694:"zllpQ",696:"PyZjr",701:"dioAu",707:"VqOos",709:"FcOAh",710:"soiWb",713:"toLowerCas",
  715:"GoMKY",716:"HOuuL",717:"setItem",719:"encodeURIC",720:"DQWgQ",725:"DhXHJ",
  726:"xlzMa",728:"LLlGU",730:"random",732:"PisRE",735:"Dupjy",736:"CAToZ",740:"split",
  743:"xojNE",744:"stringify",747:"uDwaQ",753:"wwucz",754:"host",757:"search",
  758:"uEKjE",759:"ZniqX",761:"removeItem",764:"WuRmw",765:"dKFwb",766:"tDeqv",
  768:"zSKBU",772:"iZetl",775:"KGMuQ",776:"tKEGv",777:"abVXe",779:"2ce37",780:"floor",
  783:"localStora",787:"mRwmX",790:"GSgWz",791:"DaeRE",793:"AiNtA",795:"NgMci",
  800:"join",803:"hfqdW",805:"TXqGb",807:"tHmha",808:"sqKAK",811:"oNDhh",813:"storage",
  818:"dlgoE",819:"IDoGx",820:"toString",823:"byteLength",824:"LoOIk",826:"wbErm",
  827:"_waf_bd8ce",828:"fwaVp",833:"tzAbH",834:"cdZuG",835:"erty",837:"qRiIi",
  840:"vnfez",842:"RegExp",844:"Uint8Array",845:"vtnmd",846:"eDGtf",853:"MuEaF",
  854:"pHZpI",859:"wbqOD",860:"HteUk",861:"VtDXP",862:"concat",865:"lrJHr",866:"String",
  867:"DILqF",870:"PgBQs",872:"oPpin",875:"RPlfp",877:"Limit"
};
function az(idx) { return _az[idx] || ""; }

// ============================================================
// 第三部分: Y 查找表
// ============================================================
var Y = {};
// --- 算术 ---
Y.uiwTP=function(a,b){return a+b;}; Y.AiNtA=function(a,b){return a+b;};
Y.xlzMa=function(a,b){return a+b;}; Y.FZexk=function(a,b){return a+b;};
Y.HkTVe=function(a,b){return a+b;}; Y.Mgmzx=function(a,b){return a+b;};
Y.RQrvL=function(a,b){return a+b;}; Y.SVwxy=function(a,b){return a+b;};
Y.WGXmV=function(a,b){return a+b;}; Y.VtDXP=function(a,b){return a+b;};
Y.iZetl=function(a,b){return a%b;}; Y.RpWAF=function(a,b){return a%b;};
Y.tDeqv=function(a,b){return a%b;}; Y.AdMan=function(a,b){return a%b;};
Y.abVXe=function(a,b){return a*b;}; Y.wwucz=function(a,b){return a*b;};
Y.PyZjr=function(a,b){return a*b;}; Y.KADHj=function(a,b){return a*b;};
Y.DhXHJ=function(a,b){return a/b;};
Y.zjxWr=function(a,b){return a+b;}; Y.yFUBe=function(a,b){return a+b;};
Y.gNRda=function(a,b){return a+b;}; Y.yhfpq=function(a,b){return a+b;};
Y.iPySQ=function(a,b){return a+b;}; Y.LoOIk=function(a,b){return a+b;};
Y.dlgoE=function(a,b){return a-b;}; Y.nhWKM=function(a,b){return a-b;};
Y.hHjJY=function(a,b){return a-b;}; Y.MuEaF=function(a,b){return a-b;};
Y.mRwmX=function(a,b){return a-b;};
// P 函数算术
Y.DaeRE=function(a,b){return a+b;}; Y.tzAbH=function(a,b){return a+b;};
Y.NgMci=function(a,b){return a+b;}; Y.qzDla=function(a,b){return a+b;};
Y.EqsOC=function(a,b){return a+b;};
Y.dioAu=function(a,b){return a*b;}; Y.KGZYq=function(a,b){return a*b;};
Y.oNDhh=function(a,b){return a*b;}; Y.SGWRp=function(a,b){return a*b;};
Y.vtnmd=function(a,b){return a*b;};
// --- 位移 ---
Y.NPZwW=function(a,b){return a<<b;}; Y.wbErm=function(a,b){return a<<b;};
Y.soiWb=function(a,b){return a<<b;}; Y.cOllC=function(a,b){return a<<b;};
Y.WuRmw=function(a,b){return a<<b;}; Y.ZniqX=function(a,b){return a<<b;};
Y.rIScW=function(a,b){return a<<b;}; Y.GCUyK=function(a,b){return a<<b;};
Y.CGKox=function(a,b){return a<<b;};
Y.pHZpI=function(a,b){return a>>>b;};
Y.gOrSm=function(a,b){return a>>>b;}; Y.lyMBh=function(a,b){return a>>>b;};
Y.XGNFC=function(a,b){return a>>>b;}; Y.yVykg=function(a,b){return a>>>b;};
// --- 位运算 ---
Y.iIAJF=function(a,b){return a|b;}; Y.UGWZl=function(a,b){return a|b;};
Y.eDGtf=function(a,b){return a|b;}; Y.FcOAh=function(a,b){return a|b;};
Y.ETQOF=function(a,b){return a|b;}; Y.Rwujw=function(a,b){return a|b;};
Y.ESjZn=function(a,b){return a&b;}; Y.tHmha=function(a,b){return a&b;};
Y.ENaet=function(a,b){return a&b;};
Y.WNLve=function(a,b){return a&b;}; Y.PgBQs=function(a,b){return a&b;};
Y.apVtw=function(a,b){return a&b;}; Y.oPpin=function(a,b){return a&b;};
Y.uEKjE=function(a,b){return a&b;}; Y.icMwV=function(a,b){return a&b;};
Y.tmFvY=function(a,b){return a&b;}; Y.LLlGU=function(a,b){return a&b;};
Y.rHPJu=function(a,b){return a&b;}; Y.wvYez=function(a,b){return a&b;};
Y.pYuYh=function(a,b){return a&b;}; Y.IxIHm=function(a,b){return a&b;};
Y.dKFwb=function(a,b){return a|b;};
Y.gESDc=function(a,b){return a^b;}; Y.WSaNg=function(a,b){return a^b;};
// --- 比较 ---
Y.lrJHr=function(a,b){return a==b;}; Y.oJoiF=function(a,b){return a==b;};
Y.ItvWa=function(a,b){return a==b;}; Y.tuVBR=function(a,b){return a==b;};
Y.tVXLz=function(a,b){return a==b;}; Y.PeGhO=function(a,b){return a==b;};
Y.nxxAo=function(a,b){return a==b;}; Y.gCINr=function(a,b){return a==b;};
Y.RMnHf=function(a,b){return a==b;}; Y.AmEQk=function(a,b){return a==b;};
Y.LPFPg=function(a,b){return a===b;}; Y.RpJkL=function(a,b){return a!==b;};
Y.GoMKY=function(a,b){return a<b;}; Y.TXqGb=function(a,b){return a<b;};
Y.Kxeuo=function(a,b){return a<b;}; Y.xojNE=function(a,b){return a<b;};
Y.zSKBU=function(a,b){return a<b;}; Y.vnfez=function(a,b){return a<b;};
Y.hfqdW=function(a,b){return a<b;}; Y.VqOos=function(a,b){return a<b;};
Y.wbqOD=function(a,b){return a<b;}; Y.dmakK=function(a,b){return a<b;};
Y.QGUCW=function(a,b){return a<b;}; Y.cdZuG=function(a,b){return a<b;};
Y.Dupjy=function(a,b){return a>b;}; Y.hXebv=function(a,b){return a>b;};
Y.IDoGx=function(a,b){return a>b;}; Y.PyswL=function(a,b){return a>=b;};
Y.DILqF=function(a,b){return a==b;}; Y.BBXfc=function(a,b){return a==b;};
Y.qRiIi=function(a,b){return a==b;}; Y.WViGH=function(a,b){return a>b;};
Y.hkkxk=function(a,b){return a>=b;}; Y.LsFmD=function(a,b){return a<b;};
// --- 调用器 ---
Y.uDwaQ=function(a,b){return a(b);}; Y.xWOsP=function(a,b){return a(b);};
Y.zllpQ=function(a,b){return a(b);}; Y.fwaVp=function(a,b){return a(b);};
Y.zCkrT=function(a,b){return a(b);}; Y.TNBNC=function(a,b){return a(b);};
Y.XaAWn=function(a,b){return a(b);}; Y.RQAjw=function(a,b){return a(b);};
Y.CAToZ=function(a,b){return a(b);}; Y.DQWgQ=function(a,b){return a(b);};
Y.ltWxy=function(a,b){return a(b);}; Y.ormjH=function(a,b){return a(b);};
Y.esdxp=function(a,b){return a(b);}; Y.QtFra=function(a,b){return a(b);};
Y.AMKri=function(a,b){return a(b);}; Y.XQdTt=function(a,b){return a(b);};
Y.tKEGv=function(a,b,c,d){return a(b,c,d);}; Y.RPlfp=function(a,b,c){return a(b,c);};
// --- 执行器 ---
Y.ptEau=function(a){return a();}; Y.RBpUf=function(a){return a();};
Y.JDgTO=function(a){return a();}; Y.GSgWz=function(a){return a();};
Y.SRwtQ=function(a){return a();}; Y.NWKPn=function(){return"";};
// --- 内置 ---
Y.Math=Math; Y.floor=Math.floor; Y.random=Math.random;
Y.Date=Date; Y.now=Date.now; Y.getTime=Date.prototype.getTime;
Y.parseInt=parseInt;
Y.hDFtW="__00b204e9800998__";
Y.split=String.prototype.split; Y.push=Array.prototype.push;
Y.ZAHIA="214d4f07715-"; Y.SyFNW="6|10|7|12|11|1|2|9|4|3|8|0|5";
Y.FXDgl="3|4|1|2|0";

// ============================================================
// 第四部分: v 栈 / N
// ============================================================
var v = [175, 175];
var N = { r: typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : global) };

// ============================================================
// 第五部分: O 函数（已回滚为等价干净实现）
// ============================================================
// 说明：
// 原始 O(a8) 本质是 LZ-string _compress(input, 6, alphabet[index])。
// alphabet = Q。
// 之前多次替换 O_BODY 内部的 Y[az(...)] 调度，容易导致：
//   1. Y[aJ(...)] is not a function
//   2. 输出大量 T，长度异常
// 因此这里不要再改写 O_BODY 内部调度，直接使用干净等价实现。
// 自测应满足：
//   O('a')    === 'vwT'
//   O('ab')   === 'vZvDT'
//   O('test') === 'ioc9Ih2'
function O(input) {
    if (input == null) return "";

    var context_dictionary = Object.create(null);
    var context_dictionaryToCreate = Object.create(null);
    var context_c = "";
    var context_wc = "";
    var context_w = "";
    var context_enlargeIn = 2;
    var context_dictSize = 3;
    var context_numBits = 2;
    var context_data = [];
    var context_data_val = 0;
    var context_data_position = 0;
    var i, value;

    function writeBit(bit) {
        context_data_val = (context_data_val << 1) | bit;
        if (context_data_position === 5) { // bitsPerChar = 6
            context_data_position = 0;
            context_data.push(Q.charAt(context_data_val));
            context_data_val = 0;
        } else {
            context_data_position++;
        }
    }

    function writeBits(numBits, val) {
        for (var j = 0; j < numBits; j++) {
            writeBit(val & 1);
            val >>= 1;
        }
    }

    for (var ii = 0; ii < input.length; ii++) {
        context_c = input.charAt(ii);

        if (!Object.prototype.hasOwnProperty.call(context_dictionary, context_c)) {
            context_dictionary[context_c] = context_dictSize++;
            context_dictionaryToCreate[context_c] = true;
        }

        context_wc = context_w + context_c;
        if (Object.prototype.hasOwnProperty.call(context_dictionary, context_wc)) {
            context_w = context_wc;
        } else {
            if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate, context_w)) {
                if (context_w.charCodeAt(0) < 256) {
                    writeBits(context_numBits, 0);
                    writeBits(8, context_w.charCodeAt(0));
                } else {
                    writeBits(context_numBits, 1);
                    writeBits(16, context_w.charCodeAt(0));
                }
                context_enlargeIn--;
                if (context_enlargeIn === 0) {
                    context_enlargeIn = Math.pow(2, context_numBits);
                    context_numBits++;
                }
                delete context_dictionaryToCreate[context_w];
            } else {
                writeBits(context_numBits, context_dictionary[context_w]);
            }

            context_enlargeIn--;
            if (context_enlargeIn === 0) {
                context_enlargeIn = Math.pow(2, context_numBits);
                context_numBits++;
            }

            context_dictionary[context_wc] = context_dictSize++;
            context_w = String(context_c);
        }
    }

    if (context_w !== "") {
        if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate, context_w)) {
            if (context_w.charCodeAt(0) < 256) {
                writeBits(context_numBits, 0);
                writeBits(8, context_w.charCodeAt(0));
            } else {
                writeBits(context_numBits, 1);
                writeBits(16, context_w.charCodeAt(0));
            }
            context_enlargeIn--;
            if (context_enlargeIn === 0) {
                context_enlargeIn = Math.pow(2, context_numBits);
                context_numBits++;
            }
            delete context_dictionaryToCreate[context_w];
        } else {
            writeBits(context_numBits, context_dictionary[context_w]);
        }

        context_enlargeIn--;
        if (context_enlargeIn === 0) {
            context_enlargeIn = Math.pow(2, context_numBits);
            context_numBits++;
        }
    }

    // EOF marker = 2
    writeBits(context_numBits, 2);

    // Flush remaining bits
    while (true) {
        context_data_val <<= 1;
        if (context_data_position === 5) {
            context_data.push(Q.charAt(context_data_val));
            break;
        }
        context_data_position++;
    }

    return context_data.join("");
}

// ============================================================
// 第六部分: a2 和 K
// ============================================================
function makeK() {
    // 浏览器：a2 直接引用 D(l) 实例，不走 Math.random
    // w() 才走 Math.random（两者共享同一个 LCG）
    var lcg = _globalLCG || Math.random;
    return function K(input) {
        var aa = Math.floor(1 + ((26 * lcg()) % 7));
        var a9;
        for (var i = 0; i < aa; i++) {
            a9 = Math.floor(1 + ((26 * lcg()) % 7));
        }
        var result = [];
        for (var j = 0; j < input.length; j++) {
            var hexVal = parseInt(input[j], 16);
            if (!isNaN(hexVal)) {
                result.push(R[(hexVal + a9) % 16]);
            } else {
                result.push(input[j]);
            }
        }
        return result;
    };
}
function makeA2() {
    var K = makeK();
    return function a2(input) {
        var a8 = K(input);
        return a8.join("").toLowerCase();
    };
}

// ============================================================
// 第七部分: w (PRNG)
// ============================================================
// D(l) PRNG: 浏览器 SDK 的确定性伪随机数生成器 (LCG)
// T_next = (a * T + c) % m
// 参数逐会话不同，由 JSVM 动态生成
var _Dl_a = 1436544n;
var _Dl_m = 3074446023n;

// 默认值（浏览器 JSVM 闭包实测，跨会话不变）
var _Dl_T0 = 2124388304n;
var _Dl_c = 1051861197n;

function createSeededRandom(seed) {
    var skip = (seed || 0) % 100000;
    var T = _Dl_T0;
    for (var i = 0; i < skip; i++) {
        T = (_Dl_a * T + _Dl_c) % _Dl_m;
    }
    return function () {
        T = (_Dl_a * T + _Dl_c) % _Dl_m;
        return Number(T) / Number(_Dl_m);
    };
}

// 全局 LCG 安装：模拟浏览器 case '11' Math.random = D(l)
// l 即增量参数 c, 由浏览器运行时传入; T0 也接受外部覆盖
var _globalLCG = null;
var _globalLCG_T_before = 2124388304n;
var _globalLCG_callCount = 0;
var _nativeRandom = null;  // 浏览器 bit0/bit3 用原生 random, 不消耗 LCG

function installGlobalLCG(opts) {
    // opts: { seed, l, T0 } — l=增量c, T0=初始状态, seed=兼容旧调用
    var seed = 0, l = null, T0 = null;
    if (typeof opts === 'number') { seed = opts; }
    else if (opts) { seed = opts.seed || 0; l = opts.l; T0 = opts.T0; }

    if (l != null) _Dl_c = BigInt(l);
    if (T0 != null) _Dl_T0 = BigInt(T0);
    // 如果是 number 调用（兼容旧接口），保留已设置的 _Dl_c / _Dl_T0 不变

    _globalLCG_callCount = 0;
    var skip = (seed || 0) % 100000;
    _globalLCG_T_before = _Dl_T0;
    for (var i = 0; i < skip; i++) {
        _globalLCG_T_before = (_Dl_a * _globalLCG_T_before + _Dl_c) % _Dl_m;
    }
    var T = _globalLCG_T_before;
    _globalLCG = function () {
        _globalLCG_callCount++;
        T = (_Dl_a * T + _Dl_c) % _Dl_m;
        return Number(T) / Number(_Dl_m);
    };
    _globalLCG.getT = function () { return T; };
    _globalLCG.getCallCount = function () { return _globalLCG_callCount; };
    if (!_nativeRandom) {
        _nativeRandom = Math.random;
    }
    Math.random = _globalLCG;
    return _globalLCG;
}

function getLCGState() {
    return {
        callCount: _globalLCG_callCount,
        T_before: String(_globalLCG_T_before),
        c: String(_Dl_c),
        T0: String(_Dl_T0),
        active: _globalLCG !== null
    };
}
// H(): 浏览器栈特征检测。返回整数哈希数组。
// Chrome 期望 e 数组 8 个 hash 全部命中。直接返回包含它们的数组。
var _H_cache = null;
function H() {
    // 浏览器实测: 8 个 Chrome 期望 hash 中仅命中 index 3,4 两个
    // e[3]=2887643941, e[4]=918569231, 其余不命中 → features=[0,0,0,1,1,0,0,0]
    if (_H_cache) return _H_cache;
    _H_cache = [2887643941, 918569231, 893636999, 1429070869, 3150637584, 104990562, 363454173, 1897649579, 317558322, 3774719518, 1769410267, 364903176, 1032801308, 128812702, 372631506];
    return _H_cache;
}

function w(ctx) {
    // 浏览器实测: bit0/bit3 用原生 Math.random (Z 变量), Fisher-Yates 用 LCG (q 变量)
    // Node 需要同样处理: bit0/bit3 用 _nativeRandom, Fisher-Yates 用 Math.random (LCG)

    var a8 = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];  // u() = 17 zeros
    var _nr = _nativeRandom || Math.random;
    a8.push(_nr() > 0.5 ? 1 : 0);   // bit0: 原生 random, 不消耗 LCG
    a8.push(1);
    a8.push(Math.floor(((ctx && ctx.timestamp) || Date.now()) / 1000) % 2);
    a8.push(_nr() > 0.5 ? 1 : 0);   // bit3: 原生 random, 不消耗 LCG

    // H() 特征检测: e 数组 8 个 Chrome 期望 hash
    var e = [364329469, 3357003361, 287272213, 2887643941, 918569231, 315509683, 829934165, 2025428912];
    var H_result = H();
    var features = [];
    for (var i = 0; i < e.length; i++) {
        features.push(H_result.indexOf(e[i]) > -1 ? 1 : 0);
    }
    a8 = a8.concat(features);

    // Fisher-Yates shuffle — Math.random() 消耗 LCG 调用
    for (var i = a8.length - 1; i >= 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = a8[i]; a8[i] = a8[j]; a8[j] = tmp;
    }

    // bitmask
    var bitmask = 0;
    for (var i = 0; i < a8.length; i++) bitmask |= (a8[i] ? 1 : 0) << i;
    return String(bitmask);
}

// ============================================================
// 第八部分: M (当前值, 2026-05-25)
// ============================================================
function M(ctx) {
    // ag6 必须等于当前 session 的 localStorage.__00b204e9800998__ 的 M 值
    // 优先使用 ctx.m_value，否则回退到硬编码（仅用于自测）
    if (ctx && ctx.m_value) return ctx.m_value;
    return "3089390877a19e5e36696f";
}

// ============================================================
// 第九部分: P 函数 (hash, ~2842 字符, 来自 jsvm_all.js)
// ============================================================
var rG = {Y:524,N:598,s:646,o:791,I:506,C:807,d:765,t:484,k:601,V:514,n:597,z:625,H:870,y:597,M:764,q:665,Z:597,W:759,T:872,x:710,D:758,Q:696,l:854,j:559,O:465,i:652,X:563,c:701,f:465,L:667,U:684,P:444,R:811,K:854,e:826,u:640,w:597,h:833,J:605,b:728,G:795,m:452,p:607,F:504,a0:458,a1:536,a2:502,a3:642,a4:691,a5:826,a6:670,a7:845,a8:606,a9:691,aa:538,aA:820};
var P_BODY = "function P(a8){try{v.push(175);var A4=az;for(var a9,aa=a8[A4(rG.Y)],aA=Y[A4(rG.N)](0x19a7+-0x5*0x1d9+-0x835*0x2,aa),aE=0x218b+-0x27*0x4f+-0x1898+go;Y[A4(rG.s)](aa,0x3*-0x8f+-0x805+-0x8*-0xd4+go);)a9=Y[A4(rG.o)](Y[A4(rG.I)](-0xf*-0x48304ff+0x1ec16112+-0x2*0x34e62c2+go,Y[A4(rG.C)](-0x2a03*-0x2+-0x587+0x4*0x2c60,a9=Y[A4(rG.d)](Y[A4(rG.t)](Y[A4(rG.k)](Y[A4(rG.V)](0x1086+-0x20f7+0xe5a+go,a8[A4(rG.n)](aE)),Y[A4(rG.z)](Y[A4(rG.H)](0xa*0x1b7+0x1*0x2056+-0x3393+go,a8[A4(rG.y)](++aE)),-0x1103+0x1*0x1307+0x4*-0x7f)),Y[A4(rG.M)](Y[A4(rG.q)](0x29*-0x9+-0x2*0xfa1+-0xe3*-0x26,a8[A4(rG.Z)](++aE)),0x4*-0x238+-0x1*0x787+0x1077)),Y[A4(rG.W)](Y[A4(rG.T)](0x1*0x565+0x2*-0x979+-0x2*-0x746,a8[A4(rG.n)](++aE)),-0x50e*-0x7+0x1*-0x5db+0x1d6f*-0x1)))),Y[A4(rG.x)](Y[A4(rG.D)](Y[A4(rG.Q)](0xa77e51e7+0x9a*0x4d9f25+-0x447a*0x1c979+go,Y[A4(rG.l)](a9,0x2*-0x10bb+0x6dd+0x1aa9)),0x1*-0x1aa42+0xb607+0x1f43a),-0x1e9b+0x2483*0x1+-0x11*0x58)),aA=Y[A4(rG.j)](Y[A4(rG.O)](Y[A4(rG.I)](0x8c9c*-0xe14f+-0x57*-0x14e0447+-0xdad6*-0x7764,Y[A4(rG.H)](-0x19d0c+0x153ef+0x14606+go,aA)),Y[A4(rG.i)](Y[A4(rG.X)](Y[A4(rG.c)](-0x96056507+-0x48b*0x1d16d3+0x175fdff2d,Y[A4(rG.l)](aA,0x56*-0x1f+-0x331+0xdab)),0x589b+-0x5397+0xfafb),-0x3*0x565+0x185*-0x17+0x3332*0x1)),a9=Y[A4(rG.f)](Y[A4(rG.L)](0xb162370c+-0x1*-0xbf3fb7b+-0x618448f2,Y[A4(rG.U)](0x9dc+-0x17eef+0x59de*0x7,a9^=Y[A4(rG.l)](a9,0x539*0x1+-0x224*-0x10+-0x2761))),Y[A4(rG.P)](Y[A4(rG.U)](Y[A4(rG.R)](0x29*0x19a1e43+-0x201e81db+-0x679104d*-0x9,Y[A4(rG.K)](a9,0x21f5*-0x1+0xe55+0x109a+go)),0x8b9a+0x28d*0x11+0x4908*0x1),-0x2a0d+0x256+-0x1f*-0x12f+go))),aa-=0xe71+-0x13ac+-0x4f*-0x11,++aE;switch(aa){case 0x4a7+0x20*0x32+-0xdfa+go:aA^=Y[A4(rG.e)](Y[A4(rG.u)](-0x1bd5+0xa*-0x277+0x3264+go,a8[A4(rG.w)](Y[A4(rG.h)](aE,-0x2457+-0x1ab5+0x3bf8+go))),-0xe58+-0x1*-0x230b+-0x17b9+go);case-0xea+0x2a9*0x7+-0xc5*0x17:aA^=Y[A4(rG.J)](Y[A4(rG.b)](-0x2a*0xc9+0xae5+0x1714,a8[A4(rG.w)](Y[A4(rG.G)](aE,-0x19ce+-0x1230+-0x28e9*-0x1+go))),-0xfe6*-0x1+-0x2fe*-0x4+0x1fd*-0xe);case-0x1c69+0x198a+-0x36+go:aA=Y[A4(rG.m)](Y[A4(rG.c)](-0x509a6027*0x1+0x86804284+0x25ec0422+go,Y[A4(rG.p)](-0x291c+-0x44*-0x312+0x3*0x1d71,aA^=Y[A4(rG.F)](0x190c+0x1*0x5c+-0x1b7f+go,a8[A4(rG.n)](aE)))),Y[A4(rG.z)](Y[A4(rG.D)](Y[A4(rG.a0)](-0x419fde23*-0x2+-0x83a2b26d+-0x7af12a5*-0xc,Y[A4(rG.a1)](aA,-0x17bf+-0x2b9*0x4+0x1f9d+go)),0x2*0x19be+0x1493*-0x9+0x185ae),0x3b*0x97+-0x7b7+-0x1e1c+go));}return aA=Y[A4(rG.a2)](Y[A4(rG.a0)](0x7*0x199d112+-0x6925b262+0xb9c2e479,Y[A4(rG.a3)](-0x1f3*0xfb+-0x787e+0x35ea8+go,aA^=Y[A4(rG.a4)](aA,0xfd8+0x1704+-0x37*0xc3+go))),Y[A4(rG.a5)](Y[A4(rG.a6)](Y[A4(rG.a7)](-0x4e79009f+0x14*0x884b46e+-0xf585*0x14,Y[A4(rG.a8)](aA,0x222a+0xf*-0x235+0x3*-0x55)),0x3*-0xa00d+-0x316e+0x31194),0x1*-0x202f+-0x17f*0x5+0x27ba)),Y[A4(rG.a9)](aA^=Y[A4(rG.aa)](aA,-0x4c7*-0x7+-0x3*0x1e2+-0x47*0x64),0x504+0xbf3+-0x10f7)[A4(rG.aA)]();}finally{v.pop();}}";
var makeP = new Function("go", "v", "Y", "az", "rG", "return " + P_BODY);
var P = makeP(go, v, Y, az, rG);

// ============================================================
// 第十部分: a0 函数 (从 P 结果提取 16 元素数组)
// ============================================================
var g7 = {Y:546,N:740,s:478,o:567,I:466,C:478,d:567,t:451,k:610,V:766,n:524,z:478};
var A0_BODY = "function a0(a8){try{v.push(175);var Ar=az,aa=Y[Ar(g7.Y)][Ar(g7.N)]('|'),aA=0x219e+-0x207+-0x1f97;while(!![]){switch(aa[aA++]){case'0':return N['r'][Ar(g7.s)][Ar(g7.o)](),aA_result;case'1':aB=Y[Ar(g7.I)](P,a8),N['r'][Ar(g7.C)][Ar(g7.d)]();continue;case'2':for(var aA_result=[],aE=-0x10fc+0xd48+-0x1*-0xa1+go;Y[Ar(g7.t)](aE,-0x1*-0x1a19+-0x29e9+0xccd+go);++aE)aA_result[Ar(g7.k)](aB[Y[Ar(g7.V)](aE,aB[Ar(g7.n)])]);continue;case'3':var aB;continue;case'4':N['r'][Ar(g7.z)][Ar(g7.d)]();continue;}break;}}finally{v.pop();}}";
var makeA0 = new Function("go", "v", "N", "Y", "az", "g7", "P", "return " + A0_BODY);
var a0 = makeA0(go, v, N, Y, az, g7, P);

// ============================================================
// 第十一部分: ao / aI 构造 (浏览器两步编码, 2026-05-27 修复)
// ============================================================
//
// 浏览器 SDK case '7' + case '12' 真实逻辑:
//   Step 1: aI = encodeURIComponent(waf_token + method + sep + url_path)
//   Step 2: ao = aI + sdkBodyEncode(body)   ← body 单独编码后追加
//
// 注意: 不是 encodeURIComponent(base + body)!
//       base 和 body 必须分开编码再拼接。

// b[] 表: 逐字节 body 编码表 (来自 SDK 动态脚本)
//   若 encodeURIComponent(char) 长度 > 3: 用 %XX (大写十六进制)
//   否则: 使用 encodeURIComponent(char)
var _bTable = (function() {
    var b = {};
    for (var m = 0; m <= 255; m++) {
        var ch = String.fromCharCode(m);
        var encoded = encodeURIComponent(ch);
        if (encoded.length > 3) {
            var hex = m.toString(16).toUpperCase();
            if (hex.length < 2) hex = "0" + hex;
            b[m] = "%" + hex;
        } else {
            b[m] = encoded;
        }
    }
    return b;
})();

function sdkBodyEncode(body_str) {
    // 将字符串转 UTF-8 字节, 再逐字节用 b[] 表编码 (匹配 SDK Uint8Array 路径)
    // 等价于 encodeURIComponent, 但匹配浏览器 case '12' 的逻辑结构
    var result = "";
    var utf8Bytes = unescape(encodeURIComponent(body_str));
    for (var i = 0; i < utf8Bytes.length; i++) {
        result += _bTable[utf8Bytes.charCodeAt(i) & 0xFF];
    }
    return result;
}

function buildAo(waf_token, method, url_path, body_str) {
    var base = waf_token + method.toLowerCase() + "214d4f07715" + url_path;
    var ao = encodeURIComponent(base);  // Step 1: = aI
    if (body_str) {
        var bodyStr = typeof body_str === "string" ? body_str : JSON.stringify(body_str);
        ao += sdkBodyEncode(bodyStr);   // Step 2: + encoded body
    }
    return ao;
}

function buildAI(waf_token, method, url_path) {
    // aI = encodeURIComponent(waf_token + method + "214d4f07715" + url_path)  (无body)
    return encodeURIComponent(waf_token + method.toLowerCase() + "214d4f07715" + url_path);
}

// ============================================================
// 第十二部分: buildAg (自动计算 ag0/ag1 或使用预计算值)
// ============================================================
function buildAg(ctx) {
    ctx = ctx || {};

    // 模拟浏览器 case '11': Math.random = D(l)，全局共享单一 LCG
    var lcg = installGlobalLCG(ctx.seed != null ? ctx.seed : 0);
    var lcgStateBefore = getLCGState();

    // makeA2 现在通过 Math.random 使用全局 LCG
    var a2Fn = makeA2();

    var ag0, ag1;

    // 浏览器 case 执行顺序 (由 aE = split('|') 决定):
    //   case '7'  ao=aI (无body)
    //   case '12' ao+=body (现在 ao≠aI)
    //   case '11' Math.random=D(l)
    //   case '1'  ag=a0(ao)  ← 使用含 body 的 ao
    //   case '2'  aS=ag
    //   case '9'  ag0=a2(ag), aS=a0(aI), ag1=a2(aS)
    // 所以 ag0 = a2(a0(ao)), ag1 = a2(a0(aI))
    if (ctx.ag0) {
        ag0 = ctx.ag0;
    } else if (ctx.ao) {
        ag0 = a2Fn(a0(ctx.ao));
    } else if (ctx.aI) {
        ag0 = a2Fn(a0(ctx.aI));
    } else if (ctx.ag0_raw || ctx.ag_prev) {
        ag0 = a2Fn(ctx.ag0_raw || ctx.ag_prev);
    } else {
        ag0 = "";
    }

    if (ctx.ag1) {
        ag1 = ctx.ag1;
    } else if (ctx.aI) {
        var a0_aI_result = a0(ctx.aI);
        ag1 = a2Fn(a0_aI_result);
    } else if (ctx.ag1_raw || ctx.aS) {
        ag1 = a2Fn(ctx.ag1_raw || ctx.aS);
    } else {
        ag1 = "";
    }

    // w() 现在通过 Math.random 使用全局 LCG（包括 base bits 和 Fisher-Yates）
    var ag2 = w(ctx);
    var timestamp = ctx.timestamp || Date.now();
    var waf_token = ctx.waf_token || "";
    var waf_ts = ctx.waf_ts || "";
    var ag6 = M(ctx);

    var lcgStateAfter = getLCGState();

    var agArray = [
        ag0, ag1, ag2, String(timestamp), waf_token, waf_ts, ag6
    ];

    return {
        agArray: agArray,
        ag: agArray.join("|"),
        fields: { ag0:ag0, ag1:ag1, ag2:ag2, timestamp:timestamp, waf_token:waf_token, waf_ts:waf_ts, ag6:ag6 },
        lcg: { before: lcgStateBefore, after: lcgStateAfter }
    };
}

// ag_prev 状态机：浏览器 SDK 中 ag0 = a2(a0(上轮 ao))
// case '1' (ag = a0(ao)) 在 case '7' (ao 构造) 之前执行
var _state = { ao_prev: null };

function generate_decode_1174(ctx) {
    if (!ctx.ag0 && _state.ao_prev) {
        ctx.ag0_raw = a0(_state.ao_prev);
    }
    var built = buildAg(ctx);
    var part = O(built.ag);
    var result = PREFIX + part;
    if (ctx.ao) _state.ao_prev = ctx.ao;
    return {
        decode__1174: result,
        ag: built.ag,
        agArray: built.agArray,
        part: part,
        prefix: PREFIX,
        fields: built.fields,
        lcg: built.lcg
    };
}

// 重置状态（新 session 开始）
function resetState() { _state = { ao_prev: null }; }

module.exports = { generate_decode_1174, buildAg, O, M, makeA2, makeK, w, a0, P, buildAo, buildAI, sdkBodyEncode, resetState, installGlobalLCG, getLCGState, createSeededRandom };

// ============================================================
// 自测
// ============================================================
if (require.main === module) {
    console.log("[Test] O('a')    =", O("a"), "(expected: vwT)");
    console.log("[Test] O('ab')   =", O("ab"), "(expected: vZvDT)");
    console.log("[Test] O('test') =", O("test"), "(expected: ioc9Ih2)");
    console.log("[Test] M() =", M());

    // 安装全局 LCG (seed=1)
    var lcg = installGlobalLCG(1);
    console.log("\n[Test] Global LCG installed, seed=1");

    // makeA2 现在使用全局 Math.random (已被 LCG 替换)
    var a2test = makeA2();

    // --- 使用 ao/aI 自动计算 ag0/ag1 ---
    var test_waf_token = "nuPLAInUCOddaSt1nt1eYp33aHY01gR4yd3K8o0vW5I=";
    var test_method = "post";
    var test_url_path = "api.pzds.com/api/web-client/v2/public/goodsPublic/page";
    var test_body = '{"order":"ASC","sort":null,"page":2,"pageSize":10,"action":{"gameId":"7","merchantMark":null,"keywords":[],"searchWords":[],"searchPropertyIds":[],"recommendSearchConfigIds":[],"unionGameIds":[],"goodsSearchActions":[],"metas":{"single1":[]},"goodsCatalogueId":6,"goodsSubCatalogueIds":[],"countFlag":true,"conditionSearch":false}}';

    var ao = buildAo(test_waf_token, test_method, test_url_path, test_body);
    var aI = buildAI(test_waf_token, test_method, test_url_path);

    console.log("\n[Test] ao constructed, len:", ao.length);
    console.log("[Test] aI constructed, len:", aI.length);

    // 验证 a0 输出
    var a0_ao_result = a0(ao);
    var a0_aI_result = a0(aI);
    console.log("[Test] a0(ao):", JSON.stringify(a0_ao_result), "(expected: [\"5\",\"4\",\"2\",\"7\",\"9\",\"4\",\"9\",\"3\",\"9\",\"8\",\"5\",\"4\",\"2\",\"7\",\"9\",\"4\"])");
    console.log("[Test] a0(aI):", JSON.stringify(a0_aI_result), "(expected: [\"0\",\"7\",\"9\",\"2\",\"7\",\"9\",\"9\",\"6\",\"8\",\"0\",\"7\",\"9\",\"2\",\"7\",\"9\",\"9\"])");

    var match_ao = JSON.stringify(a0_ao_result) === '["5","4","2","7","9","4","9","3","9","8","5","4","2","7","9","4"]';
    var match_aI = JSON.stringify(a0_aI_result) === '["0","7","9","2","7","9","9","6","8","0","7","9","2","7","9","9"]';
    console.log("[Test] a0(ao) match:", match_ao ? "PASS" : "FAIL");
    console.log("[Test] a0(aI) match:", match_aI ? "PASS" : "FAIL");

    // 验证 a2 输出 (seed=1, 通过全局 Math.random)
    installGlobalLCG(1);  // 重置 LCG
    var a2_seeded = makeA2();
    var ag0_test = a2_seeded(a0_ao_result);
    var ag1_test = a2_seeded(a0_aI_result);
    console.log("[Test] a2(a0(ao)) =", ag0_test);
    console.log("[Test] a2(a0(aI)) =", ag1_test);

    // 通过 ctx.ao/ctx.aI 自动计算 (seed=1, 重置 LCG)
    var ctx = {
        ao: ao,
        aI: aI,
        waf_token: test_waf_token,
        waf_ts: "1779691937491",
        seed: 1,
        timestamp: 1779692545000
    };
    var built = buildAg(ctx);
    console.log("\n[Test] buildAg via ao/aI (seed=1):");
    console.log("  ag0:", built.fields.ag0);
    console.log("  ag1:", built.fields.ag1);
    console.log("  ag2:", built.fields.ag2);
    console.log("  ag len:", built.ag.length);
    console.log("  O(ag) len:", O(built.ag).length);
    console.log("  LCG calls:", built.lcg.after.callCount);

    var result = generate_decode_1174(ctx);
    console.log("\n[Test] decode__1174 =", result.decode__1174);
    console.log("[Test] LCG state:", JSON.stringify(result.lcg));
}
