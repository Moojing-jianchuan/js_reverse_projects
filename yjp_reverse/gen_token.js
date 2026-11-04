/**
 * Boss直聘 __zp_stoken__ 离线生成 — CLI
 * 用法: node gen_token.js <seed> <sts> <scriptName>
 * 输出: stoken (stdout)
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { patchEnvironment, patchFunctionToString } = require('./envPatch');
const { installVmpHooks } = require('./vmpHook');

const RI = [0.5, 0.25, 0.75, 0.1, 0.9, 0.33, 0.67, 0.42, 0.58, 0.83,
    0.17, 0.66, 0.34, 0.51, 0.49, 0.88, 0.12, 0.62, 0.38, 0.71,
    0.29, 0.55, 0.45, 0.77, 0.23, 0.44, 0.56, 0.19, 0.81, 0.39];

const ABC_CACHE = {};

function loadScriptSync(name) {
    const cachePath = path.join(__dirname, 'config', name + '.js');
    if (fs.existsSync(cachePath)) return fs.readFileSync(cachePath, 'utf8');
    throw new Error(`Script ${name}.js not found at ${cachePath}. Download it first.`);
}

function main() {
    const args = process.argv.slice(2);
    if (args.length < 3) {
        console.error('Usage: node gen_token.js <seed> <sts> <scriptName>');
        process.exit(1);
    }

    const seed = args[0];
    const sts = args[1];
    const scriptName = args[2];

    // Compute ts: use server timestamp directly (timezone cancel in UTC+8)
    const ts = parseInt(sts);

    // Check cache
    if (!ABC_CACHE[scriptName]) {
        const scriptCode = loadScriptSync(scriptName);

        const { VirtualConsole } = require('jsdom');
        const vc = new VirtualConsole();
        vc.on('log', function() {}); // suppress jsdom console.log
        const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
            url: 'https://www.zhipin.com/',
            referrer: 'https://www.zhipin.com/',
            pretendToBeVisual: true,
            runScripts: 'dangerously',
            virtualConsole: vc,
        });
        const win = dom.window;
        const iframe = win.document.createElement('iframe');
        iframe.src = 'about:blank';
        win.document.body.appendChild(iframe);
        const w = iframe.contentWindow;

        patchEnvironment(w, w.document, w.navigator, {});

        // Fix Math.random + Date.now
        const baseTs = ts;
        w.eval(`
var _RI = ${JSON.stringify(RI)}; var _ri = 0;
Math.random = function () { var v = _RI[_ri % _RI.length]; _ri++; return v; };
Date.now = function () { return ${baseTs}; };
Date.prototype.getTime = function () { return ${baseTs}; };
`);

        w.eval(scriptCode);
        w.console.log = function() {};
        installVmpHooks(w);
        patchFunctionToString(w);

        ABC_CACHE[scriptName] = w.ABC;
    }

    const ABC = ABC_CACHE[scriptName];
    const abc = new ABC();
    const stoken = abc.z(seed, ts);
    const encoded = encodeURIComponent(stoken);
    // Output raw token first, then encoded version
    process.stdout.write(JSON.stringify({ raw: stoken, encoded: encoded }));
}

main();
