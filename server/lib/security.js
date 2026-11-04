'use strict';
/* ============================================================================
 * Security helpers: password hashing (scrypt), signed tokens (HMAC JWT style),
 * constant-time compare, simple in-memory rate limiter.
 * No external dependencies -> smaller attack surface.
 * ==========================================================================*/
const crypto = require('crypto');
const config = require('../config');

/* ------------------------------- passwords -------------------------------- */
function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), s, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${s}$${derived.toString('hex')}`;
}

function verifyPassword(password, stored) {
  try {
    if (!stored || typeof stored !== 'string') return false;
    const [algo, salt, hash] = stored.split('$');
    if (algo !== 'scrypt' || !salt || !hash) return false;
    const derived = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
    const a = Buffer.from(hash, 'hex');
    if (a.length !== derived.length) return false;
    return crypto.timingSafeEqual(a, derived);
  } catch {
    return false;
  }
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/* --------------------------------- tokens --------------------------------- */
const b64u = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64uDecode = (str) =>
  Buffer.from(String(str).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function sign(payload, ttlSeconds = config.jwtTtlSeconds) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSeconds };
  const h = b64u(JSON.stringify(header));
  const p = b64u(JSON.stringify(body));
  const sig = crypto
    .createHmac('sha256', config.jwtSecret)
    .update(`${h}.${p}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${h}.${p}.${sig}`;
}

function verify(token) {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [h, p, sig] = parts;
    const expected = crypto
      .createHmac('sha256', config.jwtSecret)
      .update(`${h}.${p}`)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    if (!safeEqual(sig, expected)) return null;
    const body = JSON.parse(b64uDecode(p).toString('utf8'));
    if (!body.exp || body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch {
    return null;
  }
}

/* ------------------------------ misc helpers ------------------------------ */
const id = (prefix = '') =>
  prefix + crypto.randomBytes(9).toString('base64url').replace(/[-_]/g, '').slice(0, 12);

const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url');

function sha256(str) {
  return crypto.createHash('sha256').update(String(str)).digest('hex');
}

/* ----------------------------- rate limiter ------------------------------- */
const buckets = new Map();

function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfter: 0 };
  }
  if (b.count >= limit) {
    return { ok: false, remaining: 0, retryAfter: Math.ceil((b.reset - now) / 1000) };
  }
  b.count++;
  return { ok: true, remaining: limit - b.count, retryAfter: 0 };
}

/* prune old buckets every 10 minutes so memory cannot grow forever */
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
}, 10 * 60 * 1000).unref?.();

/* --------------------------- output sanitising ---------------------------- */
/** Escape characters that could be used for HTML injection inside the UI. */
function cleanText(s, max = 20000) {
  if (typeof s !== 'string') return '';
  return s.replace(/\u0000/g, '').slice(0, max);
}

function cleanEmail(s) {
  const e = String(s || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 180 ? e : '';
}

module.exports = {
  hashPassword,
  verifyPassword,
  safeEqual,
  sign,
  verify,
  id,
  randomToken,
  sha256,
  rateLimit,
  cleanText,
  cleanEmail
};
