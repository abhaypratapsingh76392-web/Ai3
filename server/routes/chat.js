'use strict';
/* ============================================================================
 * Chat engine
 * ----------------------------------------------------------------------------
 *  - Token metering (flat + length based) with refund on failure
 *  - Daily message quota per plan
 *  - Invisible provider pool with automatic failover + rotation
 *  - SSE streaming and non-streaming JSON modes
 *  - Chat history CRUD, pinning, renaming, export
 * ==========================================================================*/
const express = require('express');
const multer = require('multer');
const config = require('../config');
const store = require('../lib/store');
const auth = require('../lib/auth');
const sec = require('../lib/security');
const router = require('../lib/router');
const files = require('../lib/files');

const api = express.Router();

/* --------------------------------- setup --------------------------------- */
function settings() {
  return store.get('settings', 'main') || config.defaultSettings;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024, files: 8 },
  fileFilter: (_req, file, cb) => {
    const maxMb = Number(settings().maxUploadMb || 10);
    if (file.size > maxMb * 1024 * 1024) return cb(new Error(`File too large (max ${maxMb}MB).`));
    cb(null, true);
  }
});

function planById(id) {
  return store.get('plans', id) || store.get('plans', 'free') || { name: 'Free', tokens: 5000, daily: 60 };
}

function dailyReset(u) {
  const now = Date.now();
  if (!u.dailyReset || now - u.dailyReset > 24 * 60 * 60 * 1000) {
    store.update('users', u.id, { dailyCount: 0, dailyReset: now });
    return 0;
  }
  return Number(u.dailyCount || 0);
}

function costFor(text) {
  const s = settings();
  const base = Number(s.tokensPerMessage || 0);
  const per1k = Number(s.tokensPer1kChars || 0);
  const extra = s.chargeByLength ? Math.ceil((String(text || '').length / 1000) * per1k) : 0;
  return Math.max(1, Math.round(base + extra));
}

function publicModel(m) {
  return {
    id: m.id,
    name: m.name,
    vendor: m.vendor,
    tier: m.tier,
    desc: m.desc,
    color: m.color,
    icon: m.icon,
    enabled: m.enabled !== false,
    tag: m.tag || '',
    speed: m.speed || '',
    context: m.context || ''
  };
}

/* ------------------------------- catalogue -------------------------------- */
api.get('/models', (_req, res) => {
  const models = store.all('models').filter((m) => m && m.enabled !== false);
  res.json({ models: models.map(publicModel) });
});

api.get('/usage', auth.attach, auth.requireUser, (req, res) => {
  const s = settings();
  const plan = planById(req.user.plan);
  res.json({
    tokens: req.user.tokens || 0,
    tokensUsed: req.user.tokensUsed || 0,
    messages: req.user.messages || 0,
    dailyUsed: dailyReset(req.user),
    dailyLimit: Number(plan.daily || 60),
    plan,
    pricing: { tokensPerMessage: s.tokensPerMessage, tokensPer1kChars: s.tokensPer1kChars, chargeByLength: !!s.chargeByLength }
  });
});

/* -------------------------------- uploads --------------------------------- */
api.post('/upload', auth.attach, auth.requireUser, (req, res) => {
  upload.array('files', 8)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed.' });
    const s = settings();
    const maxMb = Number(s.maxUploadMb || 10);
    const maxCount = Number(s.maxUploadsPerChat || 6);
    const list = req.files || [];
    if (list.length > maxCount) return res.status(400).json({ error: `You can attach up to ${maxCount} files per message.` });

    const out = [];
    for (const f of list) {
      if (f.size > maxMb * 1024 * 1024) {
        out.push({ ok: false, name: f.originalname, size: f.size, reason: `Larger than ${maxMb}MB.` });
        continue;
      }
      const r = files.extract(f);
      out.push({ ...r, id: sec.id('f_') });
    }
    res.json({ files: out, maxMb, maxCount });
  });
});

/* ------------------------------- chat list -------------------------------- */
api.get('/chats', auth.attach, auth.requireUser, (req, res) => {
  const items = store
    .all('chats')
    .filter((c) => c.userId === req.user.id && !c.deleted)
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt)
    .map((c) => ({
      id: c.id,
      title: c.title,
      model: c.model,
      modelName: c.modelName,
      pinned: !!c.pinned,
      messageCount: (c.messages || []).length,
      tokensUsed: c.tokensUsed || 0,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      preview: (c.messages || []).find((m) => m.role === 'user')?.content?.slice(0, 90) || ''
    }));
  res.json({ chats: items });
});

api.get('/chats/:id', auth.attach, auth.requireUser, (req, res) => {
  const c = store.get('chats', req.params.id);
  if (!c || c.userId !== req.user.id || c.deleted) return res.status(404).json({ error: 'Chat not found.' });
  res.json({ chat: c });
});

api.post('/chats', auth.attach, auth.requireUser, (req, res) => {
  const model = store.all('models').find((m) => m.id === req.body.model || m.name === req.body.model) || null;
  const chat = {
    id: sec.id('c_'),
    userId: req.user.id,
    title: sec.cleanText(String(req.body.title || 'New chat'), 120) || 'New chat',
    model: model ? model.id : 'auto',
    modelName: model ? model.name : 'Auto',
    pinned: false,
    tokensUsed: 0,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  store.set('chats', chat.id, chat);
  res.json({ chat });
});

api.patch('/chats/:id', auth.attach, auth.requireUser, (req, res) => {
  const c = store.get('chats', req.params.id);
  if (!c || c.userId !== req.user.id) return res.status(404).json({ error: 'Chat not found.' });
  const patch = { updatedAt: Date.now() };
  if (typeof req.body.title === 'string' && req.body.title.trim()) patch.title = sec.cleanText(req.body.title.trim(), 120);
  if (typeof req.body.pinned === 'boolean') patch.pinned = req.body.pinned;
  if (typeof req.body.model === 'string') {
    const m = store.all('models').find((x) => x.id === req.body.model);
    if (m) {
      patch.model = m.id;
      patch.modelName = m.name;
    }
  }
  store.update('chats', c.id, patch);
  res.json({ chat: store.get('chats', c.id) });
});

api.delete('/chats/:id', auth.attach, auth.requireUser, (req, res) => {
  const c = store.get('chats', req.params.id);
  if (!c || c.userId !== req.user.id) return res.status(404).json({ error: 'Chat not found.' });
  store.remove('chats', c.id);
  res.json({ ok: true });
});

api.post('/chats/clear-all', auth.attach, auth.requireUser, (req, res) => {
  const mine = store.all('chats').filter((c) => c.userId === req.user.id);
  for (const c of mine) store.remove('chats', c.id);
  res.json({ ok: true, deleted: mine.length });
});

/* ------------------------------- chat send -------------------------------- */
function buildMessages(history, prompt, attachments) {
  const sys = {
    role: 'system',
    content:
      'You are FreeModel VIP, a premium, friendly and extremely capable AI assistant. ' +
      'Answer accurately, format code in fenced blocks with the right language tag, use Markdown, ' +
      'and never invent facts. If the user writes in Hindi/Hinglish, reply in the same language.'
  };
  const msgs = [sys];
  for (const m of history.slice(-16)) {
    if (!m || !m.content) continue;
    msgs.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 8000) });
  }
  let text = String(prompt || '');
  const txtFiles = (attachments || []).filter((f) => f.kind === 'text' && f.text);
  if (txtFiles.length) {
    text += '\n\n' + txtFiles.map((f) => `--- FILE: ${f.name} ---\n${String(f.text).slice(0, 20000)}`).join('\n\n');
  }
  const imgs = (attachments || []).filter((f) => f.kind === 'image' && f.dataUrl);
  if (imgs.length) {
    // Vision-capable OpenAI style content blocks (ignored gracefully by text models)
    msgs.push({
      role: 'user',
      content: [
        { type: 'text', text: text || 'Describe this image.' },
        ...imgs.map((i) => ({ type: 'image_url', image_url: { url: i.dataUrl } }))
      ]
    });
    return msgs;
  }
  msgs.push({ role: 'user', content: text });
  return msgs;
}

/** Try providers in order until one answers. Returns { text, provider } */
async function callWithFailover(payload, modelKey) {
  const tried = new Set();
  let lastErr = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const p = router.pick(modelKey);
    if (!p || tried.has(p.id)) {
      const next = router.availableProviders().find((x) => !tried.has(x.id));
      if (!next) break;
      tried.add(next.id);
      const out = await tryOne(next, payload);
      if (out.ok) return { ...out, provider: next };
      lastErr = out.error;
      continue;
    }
    tried.add(p.id);
    const out = await tryOne(p, payload);
    if (out.ok) return { ...out, provider: p };
    lastErr = out.error;
  }
  throw lastErr || new Error(
      'No AI provider is configured or all of them are busy. Ask the admin to add a working API key.'
    );
}

async function tryOne(provider, payload) {
  const type = provider.type || 'openai';
  const req = router.buildRequest(provider, payload);
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), Number(provider.timeoutMs || 120000));
  try {
    const res = await fetch(req.url, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal: ctrl.signal
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      let msg = body.slice(0, 300);
      try {
        const j = JSON.parse(body);
        msg = j.error?.message || j.message || msg;
      } catch {}
      router.noteFailure(provider, new Error(`HTTP ${res.status}: ${msg}`));
      return { ok: false, error: new Error(`Provider "${provider.name}" failed (${res.status}).`) };
    }
    const json = await res.json();
    const text = router.extractText(type, json);
    if (!text) {
      router.noteFailure(provider, new Error('Empty completion'));
      return { ok: false, error: new Error('Provider returned an empty answer.') };
    }
    router.noteSuccess(provider);
    return { ok: true, text };
  } catch (e) {
    router.noteFailure(provider, e);
    const friendly =
      e.name === 'AbortError'
        ? new Error('The provider timed out. Please try again.')
        : new Error(`Provider "${provider.name}" is unreachable right now.`);
    return { ok: false, error: friendly };
  } finally {
    clearTimeout(timeout);
  }
}

/** Stream from provider -> client. Falls back before the first byte is sent. */
async function streamWithFailover(payload, modelKey, res, headers) {
  const tried = new Set();
  let lastErr = null;

  for (let attempt = 0; attempt < 8; attempt++) {
    const p = router.pick(modelKey);
    if (!p || tried.has(p.id)) break;
    tried.add(p.id);

    const type = p.type || 'openai';
    let req;
    try {
      req = router.buildRequest(p, { ...payload, stream: true });
    } catch (e) {
      lastErr = e;
      continue;
    }

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), Number(p.timeoutMs || 180000));
    let started = false;

    try {
      const up = await fetch(req.url, {
        method: 'POST',
        headers: req.headers,
        body: JSON.stringify(req.body),
        signal: ctrl.signal
      });
      if (!up.ok || !up.body) {
        const body = await up.text().catch(() => '');
        router.noteFailure(p, new Error(`HTTP ${up.status}`));
        store.log('provider', `Stream failed on ${p.name}: ${up.status} ${body.slice(0, 120)}`, { providerId: p.id });
        lastErr = new Error(`Provider error ${up.status}`);
        continue;
      }

      started = true;
      if (!res.headersSent) {
        for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
        res.flushHeaders?.();
      }
      res.write(`event: meta\ndata: ${JSON.stringify({ provider: p.name, model: p.model })}\n\n`);

      const reader = up.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let full = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const t = line.trim();
          if (!t || t.startsWith(':') || t.startsWith('event:')) continue;
          if (!t.startsWith('data:')) continue;
          const data = t.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          let json;
          try {
            json = JSON.parse(data);
          } catch {
            continue;
          }
          const delta = router.extractDelta(type, json);
          if (delta) {
            full += delta;
            res.write(`data: ${JSON.stringify({ delta })}\n\n`);
          }
        }
      }

      router.noteSuccess(p);
      res.write('event: done\ndata: {}\n\n');
      res.end();
      return { ok: true, text: full, provider: p };
    } catch (e) {
      clearTimeout(timeout);
      router.noteFailure(p, e);
      lastErr = e;
      if (started) {
        // already streaming -> cannot switch, close cleanly
        res.write(`event: error\ndata: ${JSON.stringify({ error: 'The connection was interrupted.' })}\n\n`);
        res.end();
        return { ok: false, text: '', provider: p };
      }
      continue;
    } finally {
      clearTimeout(timeout);
    }
  }

  if (!res.headersSent) {
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  }
  res.write(`event: error\ndata: ${JSON.stringify({ error: lastErr?.message || 'All AI providers are busy. Please retry.' })}\n\n`);
  res.end();
  return { ok: false, text: '', provider: null };
}

/* ------------------------------- the route -------------------------------- */
api.post('/chat', auth.attach, auth.requireUser, async (req, res) => {
  const s = settings();
  if (s.maintenance) return res.status(503).json({ error: 'The platform is under maintenance. Please check back soon.' });

  const rl = sec.rateLimit(`chat:${req.user.id}`, 40, 60 * 1000);
  if (!rl.ok) return res.status(429).json({ error: `Slow down a little - retry in ${rl.retryAfter}s.` });

  const prompt = sec.cleanText(String(req.body.message || ''), Number(s.maxPromptChars || 20000));
  const attachments = Array.isArray(req.body.attachments) ? req.body.attachments.slice(0, 8) : [];
  if (!prompt.trim() && !attachments.length) return res.status(400).json({ error: 'Please type a message.' });
  if (prompt.length > Number(s.maxPromptChars || 20000)) return res.status(400).json({ error: 'Message is too long.' });

  const plan = planById(req.user.plan);
  const usedToday = dailyReset(req.user);
  const dailyLimit = Number(plan.daily || 0);
  if (dailyLimit > 0 && usedToday >= dailyLimit) {
    return res.status(429).json({
      error: `Daily limit reached (${dailyLimit} messages on the ${plan.name} plan). Upgrade to continue.`,
      code: 'daily_limit'
    });
  }

  const cost = costFor(prompt);
  if (Number(req.user.tokens || 0) < cost) {
    return res.status(402).json({
      error: 'You are out of tokens. Upgrade your plan to keep chatting.',
      code: 'no_tokens',
      need: cost,
      have: Math.max(0, Math.floor(req.user.tokens || 0))
    });
  }

  /* ---------- resolve / create the chat ---------- */
  let chat = req.body.chatId ? store.get('chats', String(req.body.chatId)) : null;
  if (chat && (chat.userId !== req.user.id || chat.deleted)) chat = null;
  const wantedModel = store.all('models').find(
    (m) => m.id === req.body.model || m.name === req.body.model
  );
  if (!chat) {
    chat = {
      id: sec.id('c_'),
      userId: req.user.id,
      title: (prompt || 'New chat').slice(0, 60).replace(/\s+/g, ' ').trim() || 'New chat',
      model: wantedModel ? wantedModel.id : 'auto',
      modelName: wantedModel ? wantedModel.name : 'Auto',
      pinned: false,
      tokensUsed: 0,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }
  if (wantedModel && chat.model !== wantedModel.id) {
    chat.model = wantedModel.id;
    chat.modelName = wantedModel.name;
  }

  const userMsg = {
    id: sec.id('m_'),
    role: 'user',
    content: prompt,
    attachments: attachments.map((a) => ({
      id: a.id,
      name: sec.cleanText(String(a.name || 'file'), 120),
      size: Number(a.size || 0),
      kind: a.kind,
      mime: a.mime
    })),
    tokens: cost,
    createdAt: Date.now()
  };

  /* ---------- charge first, refund on failure ---------- */
  const before = { tokens: Number(req.user.tokens || 0) };
  store.update('users', req.user.id, {
    tokens: before.tokens - cost,
    tokensUsed: Number(req.user.tokensUsed || 0) + cost,
    messages: Number(req.user.messages || 0) + 1,
    dailyCount: usedToday + 1,
    dailyReset: req.user.dailyReset || Date.now(),
    lastActive: Date.now()
  });

  const payload = {
    model: wantedModel?.providerModel || undefined,
    messages: buildMessages(chat.messages || [], prompt, attachments),
    temperature: typeof req.body.temperature === 'number' ? req.body.temperature : 0.7,
    maxTokens: Number(req.body.maxTokens || 0) || undefined,
    stream: false
  };

  const wantsStream = req.body.stream !== false;
  const headers = {
    'content-type': wantsStream ? 'text/event-stream; charset=utf-8' : 'application/json; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no'
  };

  const refund = () => {
    const cur = store.get('users', req.user.id);
    if (!cur) return;
    store.update('users', req.user.id, {
      tokens: Number(cur.tokens || 0) + cost,
      tokensUsed: Math.max(0, Number(cur.tokensUsed || 0) - cost),
      messages: Math.max(0, Number(cur.messages || 0) - 1)
    });
  };

  if (wantsStream) {
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    res.flushHeaders?.();
    const modelKey = wantedModel?.name || 'auto';
    const result = await streamWithFailover(payload, modelKey, res, headers);

    if (!result.ok) {
      refund();
      store.log('chat', `Chat failed, tokens refunded (${cost})`, { userId: req.user.id, chatId: chat.id });
      return;
    }

    const assistantMsg = {
      id: sec.id('m_'),
      role: 'assistant',
      content: result.text || '',
      provider: result.provider?.name || '',
      model: chat.modelName,
      tokens: 0,
      createdAt: Date.now()
    };
    chat.messages = [...(chat.messages || []), userMsg, assistantMsg];
    chat.updatedAt = Date.now();
    chat.tokensUsed = Number(chat.tokensUsed || 0) + cost;
    store.set('chats', chat.id, chat);
    return;
  }

  try {
    const result = await callWithFailover(payload, wantedModel?.name || 'auto');
    const assistantMsg = {
      id: sec.id('m_'),
      role: 'assistant',
      content: result.text,
      provider: result.provider?.name || '',
      model: chat.modelName,
      tokens: 0,
      createdAt: Date.now()
    };
    chat.messages = [...(chat.messages || []), userMsg, assistantMsg];
    chat.updatedAt = Date.now();
    chat.tokensUsed = Number(chat.tokensUsed || 0) + cost;
    store.set('chats', chat.id, chat);
    const fresh = store.get('users', req.user.id);
    res.json({
      chat: { id: chat.id, title: chat.title, model: chat.model, modelName: chat.modelName },
      message: assistantMsg,
      tokens: { spent: cost, left: Math.max(0, Math.round(fresh.tokens || 0)) }
    });
  } catch (e) {
    refund();
    store.log('chat', `Chat failed, tokens refunded (${cost})`, { userId: req.user.id });
    res.status(502).json({ error: e.message || 'The AI is unavailable right now. Your tokens were refunded.' });
  }
});

/* ------------------------------ regenerate -------------------------------- */
api.post('/chat/regenerate', auth.attach, auth.requireUser, async (req, res) => {
  const chat = store.get('chats', String(req.body.chatId || ''));
  if (!chat || chat.userId !== req.user.id) return res.status(404).json({ error: 'Chat not found.' });

  const msgs = [...(chat.messages || [])];
  while (msgs.length && msgs[msgs.length - 1].role === 'assistant') msgs.pop();
  const last = msgs[msgs.length - 1];
  if (!last || last.role !== 'user') return res.status(400).json({ error: 'Nothing to regenerate.' });

  const s = settings();
  const cost = costFor(last.content);
  if (Number(req.user.tokens || 0) < cost) return res.status(402).json({ error: 'Not enough tokens.', code: 'no_tokens' });
  store.update('users', req.user.id, {
    tokens: Number(req.user.tokens || 0) - cost,
    tokensUsed: Number(req.user.tokensUsed || 0) + cost
  });

  try {
    const result = await callWithFailover(
      { messages: buildMessages(msgs.slice(0, -1), last.content, last.attachments || []), temperature: 0.8 },
      chat.modelName
    );
    const msg = {
      id: sec.id('m_'),
      role: 'assistant',
      content: result.text,
      provider: result.provider?.name || '',
      model: chat.modelName,
      createdAt: Date.now()
    };
    chat.messages = [...msgs, msg];
    chat.updatedAt = Date.now();
    store.set('chats', chat.id, chat);
    const fresh = store.get('users', req.user.id);
    res.json({ message: msg, chat, tokens: { spent: cost, left: Math.round(fresh.tokens || 0) } });
  } catch (e) {
    const cur = store.get('users', req.user.id);
    store.update('users', req.user.id, { tokens: Number(cur.tokens || 0) + cost });
    res.status(502).json({ error: e.message });
  }
});

/* -------------------------------- export ---------------------------------- */
api.get('/chats/:id/export', auth.attach, auth.requireUser, (req, res) => {
  const c = store.get('chats', req.params.id);
  if (!c || c.userId !== req.user.id) return res.status(404).json({ error: 'Chat not found.' });
  const md = [`# ${c.title}`, `_Model: ${c.modelName}_`, ''];
  for (const m of c.messages || []) {
    md.push(`## ${m.role === 'user' ? 'You' : 'Assistant'}`, '', m.content, '');
  }
  res.setHeader('content-type', 'text/markdown; charset=utf-8');
  res.setHeader('content-disposition', `attachment; filename="${c.id}.md"`);
  res.send(md.join('\n'));
});

module.exports = api;
