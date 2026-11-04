'use strict';
/* ============================================================================
 * Admin API - full control centre.
 * Auth: POST /api/admin/login  ->  { adminToken }  (send as x-admin-token)
 * ==========================================================================*/
const express = require('express');
const config = require('../config');
const store = require('../lib/store');
const auth = require('../lib/auth');
const sec = require('../lib/security');
const pool = require('../lib/router');
const billing = require('./billing');

const api = express.Router();

function settings() {
  return store.get('settings', 'main') || config.defaultSettings;
}

/* --------------------------------- login --------------------------------- */
api.post('/login', (req, res) => {
  const rl = sec.rateLimit(`adminlogin:${auth.clientIp(req)}`, 8, 10 * 60 * 1000);
  if (!rl.ok) return res.status(429).json({ error: `Too many attempts. Try again in ${rl.retryAfter}s.` });

  const pass = String(req.body.password || req.body.key || req.body.adminKey || '');
  if (!pass) return res.status(400).json({ error: 'Password required.' });

  if (!sec.safeEqual(pass, config.adminPassword)) {
    store.log('admin', `Failed admin login from ${auth.clientIp(req)}`);
    return res.status(401).json({ error: 'Wrong admin password.' });
  }
  store.log('admin', `Admin signed in from ${auth.clientIp(req)}`);
  return res.json({ adminToken: auth.adminToken(), name: 'Administrator' });
});

api.use(auth.attachAdmin, auth.requireAdmin);

/* -------------------------------- overview ------------------------------- */
api.get('/stats', (_req, res) => {
  const users = store.all('users');
  const chats = store.all('chats');
  const payments = store.all('payments');
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const success = payments.filter((p) => p.status === 'success');
  const revenue = success.reduce((a, p) => a + Number(p.amount || 0), 0);

  const series = [];
  for (let i = 13; i >= 0; i--) {
    const start = now - i * 86400000;
    const end = start + 86400000;
    series.push({
      day: new Date(start).toISOString().slice(5, 10),
      users: users.filter((u) => u.createdAt >= start && u.createdAt < end).length,
      messages: chats.reduce(
        (a, c) => a + (c.messages || []).filter((m) => m.role === 'user' && m.createdAt >= start && m.createdAt < end).length,
        0
      ),
      revenue: success.filter((p) => p.createdAt >= start && p.createdAt < end).reduce((a, p) => a + Number(p.amount || 0), 0)
    });
  }

  res.json({
    totals: {
      users: users.length,
      activeUsers: users.filter((u) => u.status === 'active').length,
      newUsers24h: users.filter((u) => u.createdAt >= dayAgo).length,
      chats: chats.length,
      messages: chats.reduce((a, c) => a + (c.messages || []).length, 0),
      tokensIssued: users.reduce((a, u) => a + Number(u.tokens || 0) + Number(u.tokensUsed || 0), 0),
      tokensSpent: users.reduce((a, u) => a + Number(u.tokensUsed || 0), 0),
      revenue,
      pendingPayments: payments.filter((p) => p.status === 'pending').length,
      paymentsCount: payments.length,
      providers: store.all('providers').length,
      providersLive: pool.availableProviders().length,
      plans: store.all('plans').length,
      models: store.all('models').length,
      dbBackend: store.backend,
      firebaseOk: store.firebaseOk,
      lastStoreError: store.lastError || '',
      uptime: process.uptime()
    },
    series,
    providers: pool.health(),
    recentUsers: users.sort((a, b) => b.createdAt - a.createdAt).slice(0, 8).map(auth.publicUser),
    recentPayments: payments.sort((a, b) => b.createdAt - a.createdAt).slice(0, 8)
  });
});

/* --------------------------------- users --------------------------------- */
api.get('/users', (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  const status = String(req.query.status || '');
  let users = store.all('users');
  if (q) users = users.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q));
  if (status) users = users.filter((u) => (u.status || 'active') === status);
  users.sort((a, b) => b.createdAt - a.createdAt);

  const withMeta = users.map((u) => ({
    ...auth.publicUser(u),
    passwordSet: !!u.passwordHash,
    sessions: store.all('sessions').filter((s) => s.userId === u.id && s.active).length,
    chats: store.all('chats').filter((c) => c.userId === u.id).length,
    totalSpent: Number(u.totalSpent || 0)
  }));
  res.json({ users: withMeta, total: withMeta.length });
});

api.get('/users/:id', (req, res) => {
  const u = store.get('users', req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found.' });
  res.json({
    user: auth.publicUser(u),
    sessions: store.all('sessions').filter((s) => s.userId === u.id),
    chats: store
      .all('chats')
      .filter((c) => c.userId === u.id)
      .map((c) => ({ id: c.id, title: c.title, modelName: c.modelName, messages: (c.messages || []).length, updatedAt: c.updatedAt })),
    payments: store.all('payments').filter((p) => p.userId === u.id)
  });
});

api.patch('/users/:id', (req, res) => {
  const u = store.get('users', req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found.' });

  const patch = {};
  const b = req.body || {};
  if (typeof b.name === 'string' && b.name.trim()) patch.name = sec.cleanText(b.name.trim(), 60);
  if (typeof b.email === 'string' && sec.cleanEmail(b.email)) patch.email = sec.cleanEmail(b.email);
  if (typeof b.status === 'string' && ['active', 'blocked'].includes(b.status)) patch.status = b.status;
  if (typeof b.role === 'string' && ['user', 'admin'].includes(b.role)) patch.role = b.role;
  if (b.plan && store.get('plans', String(b.plan))) patch.plan = String(b.plan);
  if (b.tokens !== undefined && b.tokens !== null && b.tokens !== '') {
    const t = Math.max(0, Math.round(Number(b.tokens) || 0));
    patch.tokens = t;
  }
  if (b.addTokens !== undefined) {
    const add = Math.round(Number(b.addTokens) || 0);
    patch.tokens = Math.max(0, Number(u.tokens || 0) + add);
    if (add > 0) patch.tokensGranted = Number(u.tokensGranted || 0) + add;
  }
  if (b.password) {
    if (String(b.password).length < 6) return res.status(400).json({ error: 'Password too short.' });
    patch.passwordHash = sec.hashPassword(String(b.password));
  }
  if (b.planExpiresAt !== undefined) patch.planExpiresAt = b.planExpiresAt ? Number(b.planExpiresAt) : null;
  if (b.resetDaily) {
    patch.dailyCount = 0;
    patch.dailyReset = Date.now();
  }
  if (b.verify) patch.status = 'active';

  store.update('users', u.id, patch);
  store.log('admin', `Updated user ${u.email}`, { userId: u.id, patch: Object.keys(patch).join(',') });
  res.json({ user: auth.publicUser(store.get('users', u.id)) });
});

api.delete('/users/:id', (req, res) => {
  const u = store.get('users', req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found.' });
  for (const c of store.all('chats')) if (c.userId === u.id) store.remove('chats', c.id);
  for (const s of store.all('sessions')) if (s.userId === u.id) store.remove('sessions', s.id);
  store.remove('users', u.id);
  store.log('admin', `Deleted user ${u.email}`, { userId: u.id });
  res.json({ ok: true });
});

/* Force logout every device of a user ("login bounce"). */
api.post('/users/:id/logout', (req, res) => {
  const u = store.get('users', req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found.' });
  let n = 0;
  for (const s of store.all('sessions')) {
    if (s.userId === u.id) {
      store.update('sessions', s.id, { active: false, revokedAt: Date.now(), revokedBy: 'admin' });
      n++;
    }
  }
  store.log('admin', `Force logout ${u.email} (${n} sessions)`, { userId: u.id });
  res.json({ ok: true, revoked: n });
});

/* ------------------------------- user sessions --------------------------- */
api.get('/sessions', (req, res) => {
  const userId = String(req.query.userId || '');
  const list = store
    .all('sessions')
    .filter((s) => (!userId || s.userId === userId) && s.active)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 300)
    .map((s) => ({
      ...s,
      tokenHash: (s.tokenHash || '').slice(0, 12) + '...',
      user: auth.publicUser(store.get('users', s.userId))
    }));
  res.json({ sessions: list });
});

api.delete('/sessions/:id', (req, res) => {
  store.update('sessions', req.params.id, { active: false, revokedAt: Date.now() });
  res.json({ ok: true });
});

/* ------------------------------- providers ------------------------------- */
api.get('/providers', (_req, res) => {
  const list = pool.providers().map((p) => ({
    ...p,
    apiKey: p.apiKey ? `${String(p.apiKey).slice(0, 6)}••••${String(p.apiKey).slice(-4)}` : '',
    keySet: !!p.apiKey,
    remaining: Number(p.requestLimit || 0) > 0 ? Math.max(0, Number(p.requestLimit) - Number(p.requestsUsed || 0)) : -1,
    usable: pool.usable(p)
  }));
  res.json({ providers: list, health: pool.health() });
});

api.post('/providers', (req, res) => {
  const b = req.body || {};
  if (!b.baseUrl || !/^https?:\/\//i.test(String(b.baseUrl))) return res.status(400).json({ error: 'A valid base URL is required.' });
  const p = {
    id: sec.id('p_'),
    name: sec.cleanText(String(b.name || 'New provider'), 60),
    label: sec.cleanText(String(b.label || ''), 60),
    type: ['openai', 'anthropic', 'gemini'].includes(b.type) ? b.type : 'openai',
    baseUrl: String(b.baseUrl).replace(/\/+$/, ''),
    apiKey: String(b.apiKey || ''),
    model: sec.cleanText(String(b.model || 'gpt-4o-mini'), 80),
    enabled: b.enabled !== false,
    requestLimit: Math.max(0, Number(b.requestLimit ?? 10)),
    requestsUsed: 0,
    weight: 100,
    order: Number(b.order || store.all('providers').length + 1),
    timeoutMs: Number(b.timeoutMs || 120000),
    autoDisable: b.autoDisable !== false,
    publicModels: Array.isArray(b.publicModels) ? b.publicModels.slice(0, 40) : [],
    createdAt: Date.now()
  };
  store.set('providers', p.id, p);
  store.log('admin', `Added provider ${p.name}`);
  res.json({ provider: { ...p, apiKey: '' } });
});

api.patch('/providers/:id', (req, res) => {
  const p = store.get('providers', req.params.id);
  if (!p) return res.status(404).json({ error: 'Provider not found.' });
  const b = req.body || {};
  const patch = {};
  for (const k of ['name', 'label', 'model']) if (typeof b[k] === 'string') patch[k] = sec.cleanText(b[k], 80);
  if (typeof b.baseUrl === 'string' && /^https?:\/\//i.test(b.baseUrl)) patch.baseUrl = b.baseUrl.replace(/\/+$/, '');
  if (typeof b.apiKey === 'string' && b.apiKey && !b.apiKey.includes('••')) patch.apiKey = b.apiKey;
  if (['openai', 'anthropic', 'gemini'].includes(b.type)) patch.type = b.type;
  if (typeof b.enabled === 'boolean') patch.enabled = b.enabled;
  if (b.requestLimit !== undefined) patch.requestLimit = Math.max(0, Number(b.requestLimit) || 0);
  if (b.order !== undefined) patch.order = Number(b.order) || 1;
  if (b.timeoutMs !== undefined) patch.timeoutMs = Math.max(5000, Number(b.timeoutMs) || 120000);
  if (typeof b.autoDisable === 'boolean') patch.autoDisable = b.autoDisable;
  if (Array.isArray(b.publicModels)) patch.publicModels = b.publicModels.slice(0, 40);
  if (b.resetCounter) {
    patch.requestsUsed = 0;
    patch.errors = 0;
    patch.lastError = '';
    patch.exhausted = false;
    if (b.enabled === undefined) patch.enabled = true;
  }
  store.update('providers', p.id, patch);
  res.json({ ok: true });
});

api.delete('/providers/:id', (req, res) => {
  store.remove('providers', req.params.id);
  store.log('admin', `Deleted provider ${req.params.id}`);
  res.json({ ok: true });
});

api.post('/providers/:id/test', async (req, res) => {
  const p = store.get('providers', req.params.id);
  if (!p) return res.status(404).json({ error: 'Provider not found.' });
  try {
    const r = pool.buildRequest(p, {
      model: p.model,
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
      maxTokens: 16,
      stream: false
    });
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30000);
    const up = await fetch(r.url, { method: 'POST', headers: r.headers, body: JSON.stringify(r.body), signal: ctrl.signal });
    clearTimeout(t);
    const body = await up.text().catch(() => '');
    if (!up.ok) return res.json({ ok: false, status: up.status, message: body.slice(0, 300) });
    let text = '';
    try {
      text = pool.extractText(p.type || 'openai', JSON.parse(body));
    } catch {}
    res.json({ ok: true, status: up.status, sample: text.slice(0, 200) || '(no text)' });
  } catch (e) {
    res.json({ ok: false, status: 0, message: e.message });
  }
});

/* --------------------------------- models -------------------------------- */
api.get('/models', (_req, res) => {
  res.json({ models: store.all('models').sort((a, b) => (a.order || 0) - (b.order || 0)) });
});

api.post('/models', (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'Model name required.' });
  const m = {
    id: sec.id('m_'),
    name: sec.cleanText(String(b.name), 60),
    vendor: sec.cleanText(String(b.vendor || 'Custom'), 40),
    tier: sec.cleanText(String(b.tier || 'Pro'), 20),
    desc: sec.cleanText(String(b.desc || ''), 200),
    color: /^#[0-9a-f]{3,8}$/i.test(b.color || '') ? b.color : '#6366f1',
    icon: sec.cleanText(String(b.icon || 'spark'), 30),
    providerModel: sec.cleanText(String(b.providerModel || ''), 80),
    enabled: b.enabled !== false,
    minPlan: sec.cleanText(String(b.minPlan || 'free'), 20),
    order: Number(b.order || store.all('models').length + 1)
  };
  store.set('models', m.id, m);
  res.json({ model: m });
});

api.patch('/models/:id', (req, res) => {
  const m = store.get('models', req.params.id);
  if (!m) return res.status(404).json({ error: 'Model not found.' });
  const b = req.body || {};
  const patch = {};
  for (const k of ['name', 'vendor', 'tier', 'desc', 'icon', 'providerModel', 'minPlan']) {
    if (typeof b[k] === 'string') patch[k] = sec.cleanText(b[k], 200);
  }
  if (typeof b.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(b.color)) patch.color = b.color;
  if (typeof b.enabled === 'boolean') patch.enabled = b.enabled;
  if (b.order !== undefined) patch.order = Number(b.order) || 1;
  store.update('models', m.id, patch);
  res.json({ model: store.get('models', m.id) });
});

api.delete('/models/:id', (req, res) => {
  store.remove('models', req.params.id);
  res.json({ ok: true });
});

/* ---------------------------------- plans -------------------------------- */
api.get('/plans', (_req, res) => {
  res.json({ plans: store.all('plans').sort((a, b) => (a.order || 99) - (b.order || 99)) });
});

api.post('/plans', (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'Plan name required.' });
  const p = {
    id: sec.id('pl_'),
    name: sec.cleanText(String(b.name), 40),
    price: Math.max(0, Number(b.price) || 0),
    tokens: Math.max(0, Number(b.tokens) || 0),
    daily: Math.max(0, Number(b.daily) || 0),
    perks: Array.isArray(b.perks) ? b.perks.map((x) => sec.cleanText(String(x), 80)).slice(0, 10) : [],
    popular: !!b.popular,
    active: b.active !== false,
    order: Number(b.order || store.all('plans').length + 1)
  };
  store.set('plans', p.id, p);
  res.json({ plan: p });
});

api.patch('/plans/:id', (req, res) => {
  const p = store.get('plans', req.params.id);
  if (!p) return res.status(404).json({ error: 'Plan not found.' });
  const b = req.body || {};
  const patch = {};
  if (typeof b.name === 'string') patch.name = sec.cleanText(b.name, 40);
  for (const k of ['price', 'tokens', 'daily', 'order']) if (b[k] !== undefined) patch[k] = Math.max(0, Number(b[k]) || 0);
  if (Array.isArray(b.perks)) patch.perks = b.perks.map((x) => sec.cleanText(String(x), 80)).slice(0, 10);
  if (typeof b.popular === 'boolean') patch.popular = b.popular;
  if (typeof b.active === 'boolean') patch.active = b.active;
  store.update('plans', p.id, patch);
  res.json({ plan: store.get('plans', p.id) });
});

api.delete('/plans/:id', (req, res) => {
  if (req.params.id === 'free') return res.status(400).json({ error: 'The free plan cannot be deleted.' });
  store.remove('plans', req.params.id);
  res.json({ ok: true });
});

/* -------------------------------- payments ------------------------------- */
api.get('/payments', (req, res) => {
  const status = String(req.query.status || '');
  const list = store
    .all('payments')
    .filter((p) => !status || p.status === status)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 500);
  const totals = {
    revenue: list.filter((p) => p.status === 'success').reduce((a, p) => a + Number(p.amount || 0), 0),
    pending: list.filter((p) => p.status === 'pending').length,
    count: list.length
  };
  res.json({ payments: list, totals });
});

api.post('/payments/:id/approve', (req, res) => {
  const p = store.get('payments', req.params.id);
  if (!p) return res.status(404).json({ error: 'Payment not found.' });
  if (p.status === 'success') return res.status(400).json({ error: 'Already approved.' });
  const updated = billing.activatePlan(p, req.body?.reference || 'manual-admin');
  res.json({ ok: true, payment: updated });
});

api.post('/payments/:id/reject', (req, res) => {
  const p = store.get('payments', req.params.id);
  if (!p) return res.status(404).json({ error: 'Payment not found.' });
  store.update('payments', p.id, { status: 'rejected', rejectedAt: Date.now(), reason: sec.cleanText(String(req.body?.reason || ''), 200) });
  store.log('payment', `Payment rejected for ${p.userEmail}`, { paymentId: p.id });
  res.json({ ok: true });
});

api.delete('/payments/:id', (req, res) => {
  store.remove('payments', req.params.id);
  res.json({ ok: true });
});

/* -------------------------------- settings ------------------------------- */
api.get('/settings', (_req, res) => {
  res.json({ settings: settings(), firebase: { url: config.firebaseUrl, backend: store.backend, ok: store.firebaseOk } });
});

api.patch('/settings', (req, res) => {
  const cur = settings();
  const b = req.body || {};
  const next = { ...cur };
  const num = (v, d = 0) => (v === undefined || v === '' ? d : Number(v));

  for (const k of ['brandName', 'tagline', 'currency']) if (typeof b[k] === 'string') next[k] = sec.cleanText(b[k], 120);
  for (const k of ['tokensPerMessage', 'tokensPer1kChars', 'freeSignupTokens', 'maxUploadMb', 'maxUploadsPerChat', 'maxPromptChars'])
    if (b[k] !== undefined) next[k] = Math.max(0, num(b[k]));
  for (const k of ['chargeByLength', 'maintenance', 'signupEnabled', 'googleLogin', 'emailLogin'])
    if (typeof b[k] === 'boolean') next[k] = b[k];

  if (b.payment && typeof b.payment === 'object') {
    next.payment = { ...cur.payment };
    for (const k of ['mode', 'upiId', 'upiName', 'qrImage', 'razorpayKeyId', 'razorpayKeySecret', 'cashfreeAppId', 'cashfreeSecret', 'cashfreeEnv', 'instructions'])
      if (typeof b.payment[k] === 'string') next.payment[k] = sec.cleanText(b.payment[k], 3000);
  }

  store.set('settings', 'main', next);
  store.log('admin', 'Settings updated');
  res.json({ settings: next });
});

/* ---------------------------------- logs --------------------------------- */
api.get('/logs', (req, res) => {
  const type = String(req.query.type || '');
  const list = store
    .all('logs')
    .filter((l) => !type || l.type === type)
    .sort((a, b) => b.at - a.at)
    .slice(0, 300);
  res.json({ logs: list });
});

api.delete('/logs', (_req, res) => {
  for (const l of store.all('logs')) store.remove('logs', l.id);
  res.json({ ok: true });
});

/* -------------------------------- all chats ------------------------------ */
api.get('/chats', (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  const list = store
    .all('chats')
    .filter((c) => !q || String(c.title || '').toLowerCase().includes(q))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 200)
    .map((c) => ({
      id: c.id,
      title: c.title,
      userId: c.userId,
      user: auth.publicUser(store.get('users', c.userId)),
      modelName: c.modelName,
      messages: (c.messages || []).length,
      tokensUsed: c.tokensUsed || 0,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    }));
  res.json({ chats: list });
});

api.get('/chats/:id', (req, res) => {
  const c = store.get('chats', req.params.id);
  if (!c) return res.status(404).json({ error: 'Chat not found.' });
  res.json({ chat: c, user: auth.publicUser(store.get('users', c.userId)) });
});

api.delete('/chats/:id', (req, res) => {
  store.remove('chats', req.params.id);
  res.json({ ok: true });
});

/* --------------------------------- system -------------------------------- */
api.post('/flush', async (_req, res) => {
  await store.flushNow();
  res.json({ ok: true, backend: store.backend, firebaseOk: store.firebaseOk, lastError: store.lastError });
});

api.post('/broadcast', (req, res) => {
  const text = sec.cleanText(String(req.body?.message || ''), 500);
  if (!text) return res.status(400).json({ error: 'Message required.' });
  store.set('settings', 'broadcast', { id: 'broadcast', message: text, at: Date.now(), by: 'admin' });
  res.json({ ok: true });
});

module.exports = api;
module.exports.settings = settings;
