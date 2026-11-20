#!/usr/bin/env node
/**
 * 得物 PC 端采集器（协议层，非浏览器）
 *
 * 已打通：category-pick/mapping（纯 sign，无需验证码）
 * 待环境：feeds/info（需要未被风控的出口 + 有效 sk 会话）
 *
 * 用法:
 *   node src/collect_dewu.js --mapping
 *   node src/collect_dewu.js --info --pick 644479 --pages 3 --delay 1500
 *   node src/collect_dewu.js --info --all-picks --pages 2
 *
 * 代理: 设置 HTTPS_PROXY=http://127.0.0.1:7897 且 NODE_USE_ENV_PROXY=1
 * Cookie: 从浏览器导出后放 config/cookies.json（或 --cookie "sk=..."）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { sign } = require('./dewu_sign');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data');
const CFG_DIR = path.join(ROOT, 'config');
const BASE = 'https://app.dewu.com';
const MAPPING = '/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/category-pick/mapping';
const INFO = '/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info';

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}
const has = n => process.argv.includes('--' + n);

function loadCookie() {
  const cli = arg('cookie');
  if (typeof cli === 'string') return cli;
  const p = path.join(CFG_DIR, 'cookies.json');
  if (fs.existsSync(p)) {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (typeof j === 'string') return j;
    return Object.entries(j).map(([k, v]) => `${k}=${v}`).join('; ');
  }
  return '';
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0';

function headers() {
  const h = {
    'Content-Type': 'application/json',
    'Accept': '*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Origin': 'https://www.dewu.com',
    'Referer': 'https://www.dewu.com/',
    'User-Agent': UA,
  };
  const c = loadCookie();
  if (c) h.Cookie = c;
  return h;
}

async function post(pathname, params) {
  const body = JSON.stringify({ sign: sign(params), ...params });
  const t0 = Date.now();
  const r = await fetch(BASE + pathname, { method: 'POST', headers: headers(), body });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { }
  return { status: r.status, ms: Date.now() - t0, code: json && json.code, msg: json && json.msg, json, raw: text };
}

function ensureDirs() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(CFG_DIR, { recursive: true });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function appendJsonl(file, obj) {
  fs.appendFileSync(file, JSON.stringify(obj) + '\n');
}

/** 采集品类表 */
async function collectMapping() {
  const res = await post(MAPPING, { pageNum: 1, pageSize: 20 });
  console.log(`[mapping] HTTP ${res.status} code=${res.code} msg=${res.msg}`);
  if (res.json && res.json.data && res.json.data.checkRespDTOList) {
    const list = res.json.data.checkRespDTOList;
    const file = path.join(OUT_DIR, 'mapping.json');
    fs.writeFileSync(file, JSON.stringify(list, null, 2));
    console.log(`  → ${list.length} 个品类，已写 ${file}`);
    for (const it of list) console.log(`     ${it.pickId}  ${it.name}`);
    return list;
  }
  console.log('  响应:', res.raw.slice(0, 300));
  return [];
}

/** 采集 info 分页；失败时按状态码分类记录 */
async function collectInfo(pickRuleId, pages, delayMs) {
  const file = path.join(OUT_DIR, `info_${pickRuleId}.jsonl`);
  let ok = 0, fail = 0;
  for (let pageNum = 1; pageNum <= pages; pageNum++) {
    const res = await post(INFO, { pickRuleId, pageNum, pageSize: 24, filterUnbid: true, showCspu: true });
    const rec = { ts: new Date().toISOString(), pickRuleId, pageNum, status: res.status, code: res.code, msg: res.msg };
    if (res.status === 200 && res.code === 200 && res.json && res.json.data) {
      const list = res.json.data.list || [];
      rec.items = list.length;
      rec.data = list;
      ok++;
      console.log(`  [info] pick=${pickRuleId} page=${pageNum} ✅ ${list.length} 条`);
    } else {
      rec.raw = res.raw.slice(0, 500);
      fail++;
      console.log(`  [info] pick=${pickRuleId} page=${pageNum} ❌ HTTP ${res.status} code=${res.code} msg=${res.msg}`);
      // 401=签名错(不该出现) 403=风控硬拒 485=需验证码 → 都停止翻页，避免加重标记
      appendJsonl(file, rec);
      break;
    }
    appendJsonl(file, rec);
    if (pageNum < pages) await sleep(delayMs);
  }
  return { ok, fail };
}

(async () => {
  ensureDirs();
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || '';
  console.log(`出口代理: ${proxy || '(直连)'} | NODE_USE_ENV_PROXY=${process.env.NODE_USE_ENV_PROXY || '0'}`);
  const cookie = loadCookie();
  console.log(`Cookie: ${cookie ? cookie.slice(0, 60) + '…' : '(无)'}`);

  if (has('mapping') || !has('info')) {
    const list = await collectMapping();
    if (has('mapping') && !has('info')) return;
    if (has('all-picks')) {
      const delay = parseInt(arg('delay', '2000'), 10);
      const pages = parseInt(arg('pages', '1'), 10);
      for (const it of list) {
        console.log(`\n=== ${it.name} (${it.pickId}) ===`);
        const r = await collectInfo(it.pickId, pages, delay);
        if (r.fail) { console.log('  命中风控，停止整批（避免加重标记）'); break; }
        await sleep(delay);
      }
      return;
    }
  }

  if (has('info')) {
    const pick = parseInt(arg('pick', '644479'), 10);
    const pages = parseInt(arg('pages', '1'), 10);
    const delay = parseInt(arg('delay', '1500'), 10);
    await collectInfo(pick, pages, delay);
  }
})().catch(e => { console.error('ERR', e); process.exit(1); });
