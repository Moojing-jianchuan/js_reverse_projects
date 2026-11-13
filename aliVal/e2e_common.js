// e2e_common.js — 纯 Node 端到端实验共用件（HTTP / 证据落盘 / 配额计数）
// 不修改任何已验证产物；证据统一写 static/work/e2e/
const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const WORK = path.join(ROOT, 'static', 'work', 'e2e');
const QUOTA_FILE = path.join(WORK, 'slideauth_count.txt');
const MAX_SLIDEAUTH = 20;   // 原始预算 10 + 复现动力学 2 + 形态重构（human_track）2

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0';

function ensureWork() { fs.mkdirSync(WORK, { recursive: true }); }

function ts() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}_${String(d.getMilliseconds()).padStart(3, '0')}`;
}

function saveJson(name, obj) {
  ensureWork();
  const f = path.join(WORK, name);
  fs.writeFileSync(f, JSON.stringify(obj, null, 1));
  return f;
}

function request({ method = 'GET', url, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname + u.search, method,
      headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9', ...headers },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, buf: Buffer.concat(chunks), text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function formBody(params) { return new URLSearchParams(params).toString(); }

// 抓站点会话 cookie（slideAuth 走 AJAX，带 session 更贴近真实调用）
async function siteSession() {
  const r = await request({ url: 'https://tool.manmanbuy.com/m/aliVal.aspx' });
  const setCookies = r.headers['set-cookie'] || [];
  const jar = setCookies.map(c => c.split(';')[0]).join('; ');
  return { status: r.status, setCookies, jar, htmlLen: r.text.length };
}

function readQuota() {
  ensureWork();
  if (!fs.existsSync(QUOTA_FILE)) return 0;
  const n = parseInt(fs.readFileSync(QUOTA_FILE, 'utf8').trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

function bumpQuota() {
  const n = readQuota() + 1;
  fs.writeFileSync(QUOTA_FILE, String(n));
  return n;
}

module.exports = { ROOT, WORK, UA, MAX_SLIDEAUTH, ensureWork, ts, saveJson, request, formBody, siteSession, readQuota, bumpQuota };
