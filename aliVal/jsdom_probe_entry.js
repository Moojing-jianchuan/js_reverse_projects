// 诊断：深入探查 FEILIN.initFeiLin / __AYF / initialProperties，定位 deviceToken 生成入口
const { JSDOM } = require('jsdom');
const fs = require('fs');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'https://tool.manmanbuy.com/m/aliVal.aspx',
  pretendToBeVisual: true,
  runScripts: 'dangerously',
});
const win = dom.window;

try { Object.defineProperty(win.navigator, 'webdriver', { get: () => false, configurable: true }); } catch (e) {}
try { Object.defineProperty(win.navigator, 'platform', { get: () => 'Win32', configurable: true }); } catch (e) {}
try { Object.defineProperty(win.navigator, 'hardwareConcurrency', { get: () => 24, configurable: true }); } catch (e) {}
try { Object.defineProperty(win.navigator, 'userAgent', { get: () => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0', configurable: true }); } catch (e) {}

win.eval(fs.readFileSync('config/AliyunCaptcha.js', 'utf8'));
win.eval(fs.readFileSync('config/feilin002.js', 'utf8'));
console.log('加载 OK');

// FEILIN.initFeiLin 函数体
console.log('\n=== FEILIN.initFeiLin 函数体(前1500) ===');
try { console.log(win.FEILIN.initFeiLin.toString().slice(0, 1500)); } catch (e) { console.log('ERR', e.message); }

// __AYF 是什么
console.log('\n=== __AYF ===');
console.log('typeof:', typeof win.__AYF);
if (typeof win.__AYF === 'object' && win.__AYF) {
  try { console.log('keys:', Object.getOwnPropertyNames(win.__AYF).slice(0, 60).join(',')); } catch (e) {}
  try { console.log('proto:', Object.getOwnPropertyNames(Object.getPrototypeOf(win.__AYF) || {}).slice(0, 60).join(',')); } catch (e) {}
}

// initialProperties
console.log('\n=== initialProperties ===');
console.log('typeof:', typeof win.initialProperties);
if (typeof win.initialProperties === 'object' && win.initialProperties) {
  console.log('keys:', Object.getOwnPropertyNames(win.initialProperties).slice(0, 80).join(','));
  console.log('JSON:', JSON.stringify(win.initialProperties).slice(0, 800));
}

// _aliyun_device_ifr / _aliyun_device_cvs
console.log('\n=== _aliyun_device_ifr:', typeof win._aliyun_device_ifr, '| _aliyun_device_cvs:', typeof win._aliyun_device_cvs, '===');

// 检查 __ALIYUN_CRYPT 有哪些方法（确认是 crypto-js）
console.log('\n=== __ALIYUN_CRYPT 方法 ===');
try { console.log('keys:', Object.getOwnPropertyNames(win.__ALIYUN_CRYPT).slice(0, 60).join(',')); } catch (e) {}

process.exit(0);
