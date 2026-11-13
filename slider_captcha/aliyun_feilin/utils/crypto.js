// 阿里云 FeiLin 滑块验证码 — 核心加密模块（全部算法已验证与浏览器抓包一致）
const crypto = require('crypto');

// ============ 密钥（config/keys_final.json）============
const KEYS = {
  // InitCaptcha（HMAC 签名）
  KEY_ID: '111jdk439dJJIjd023823201',
  KEY_SECRET: '222aiJodos2938JDdosko2djd82sf0',
  // DeviceConfig 解密（AES-CBC）
  RES_KEY: '87f879f135f27da7',
  // AES IV（由 AES_IV hex "d35db7e39ebbf3d001083105" 经 hex→base64→utf8 派生）
  AES_IV: '0123456789ABCDEF',
  // 设备密钥（Log1 设备指纹请求）
  DEVICE_KEY_ID: 'DuaneAprqkYsF3nt1yjK29Bf',
  DEVICE_KEY_SECRET: 'DuanemHmyeE6LXCC46sJEDUw5DTlSZ',
};

// 阿里云 RPC 百分比编码（Ar 函数）
function ar(s) {
  return encodeURIComponent(s)
    .replace(/\+/g, '%20')
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~');
}

// HMAC-SHA1 签名（阿里云 RPC 标准）
function sign(params, secret) {
  const cqs = Object.keys(params).sort().map(k => ar(k) + '=' + ar(params[k])).join('&');
  const sts = 'POST&%2F&' + ar(cqs);
  return crypto.createHmac('sha1', secret + '&').update(sts).digest('base64');
}

// AES-128-CBC 解密（DeviceConfig / KEY_ID / KEY_SECRET 解密）
function aesDecrypt(cipherB64, keyStr, ivStr) {
  const key = Buffer.from(keyStr, 'utf8');
  const iv = Buffer.from(ivStr, 'utf8');
  const d = crypto.createDecipheriv('aes-128-cbc', key, iv);
  d.setAutoPadding(true);
  return Buffer.concat([d.update(Buffer.from(cipherB64, 'base64')), d.final()]).toString('utf8');
}

// AES-128-CBC 加密（data 轨迹加密）
function aesEncrypt(plaintext, keyStr, ivStr) {
  const key = Buffer.from(keyStr, 'utf8');
  const iv = Buffer.from(ivStr, 'utf8');
  const c = crypto.createCipheriv('aes-128-cbc', key, iv);
  c.setAutoPadding(true);
  return Buffer.concat([c.update(Buffer.from(plaintext, 'utf8')), c.final()]);
}

// 解密 DeviceConfig，提取 field[0]（每次请求的动态密钥）
function decryptDeviceConfig(deviceConfigB64) {
  const plain = aesDecrypt(deviceConfigB64, KEYS.RES_KEY, KEYS.AES_IV);
  const parts = plain.split('#');
  // field[0] 是 base64 编码的动态密钥（16 hex 字符）
  return Buffer.from(parts[0], 'base64').toString('utf8');
}

// 生成 data 字段（加密轨迹）
// trajectoryJson: 轨迹 JSON 字符串
// field0: DeviceConfig 解密的动态密钥
function encryptData(trajectoryJson, field0) {
  const ciphertext = aesEncrypt(trajectoryJson, field0, KEYS.AES_IV);
  const magic = Buffer.from([0x25, 0x13, 0x27]); // 魔数（固定 3 字节前缀）
  return Buffer.concat([magic, ciphertext]).toString('base64');
}

module.exports = { KEYS, ar, sign, aesDecrypt, aesEncrypt, decryptDeviceConfig, encryptData };
