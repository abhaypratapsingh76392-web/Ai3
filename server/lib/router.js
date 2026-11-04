'use strict';
/* ============================================================================
 * API router / key pool
 * ----------------------------------------------------------------------------
 * Admin can register ANY number of upstream OpenAI-compatible (or Anthropic /
 * Gemini) providers. Users never see them - they only see the public model
 * names that the admin publishes.
 *
 * Each provider has a `requestLimit`. Every successful chat request increments
 * `requestsUsed`; when the limit is reached the provider is parked
 * (auto-disabled) and the router transparently switches to the next one.
 * Unhealthy providers cool down for 60s after 3 consecutive failures.
 * ==========================================================================*/
const store = require('./store');

const COOLDOWN_MS = 60 * 1000;
const failures = new Map(); // providerId -> { count, until }

function providers() {
  return store
    .all('providers')
    .filter((p) => p && p.baseUrl)
    .sort((a, b) => (a.order || 99) - (b.order || 99));
}

function usable(p) {
  if (!p.enabled) return false;
  if (!p.apiKey && p.type !== 'local') return false;
  const f = failures.get(p.id);
  if (f && f.until > Date.now()) return false;
  const limit = Number(p.requestLimit || 0);
  if (limit > 0 && Number(p.requestsUsed || 0) >= limit) return false;
  return true;
}

/** Pick the best provider for a model key. */
function pick(modelKey) {
  const list = providers().filter(usable);
  if (!list.length) return null;
  const mapped = list.filter((p) => p.model && modelKey && p.publicModels && p.publicModels.includes(modelKey));
  const pool = mapped.length ? mapped : list;
  // weighted random between the first two for load spreading, else ordered
  pool.sort((a, b) => (a.order || 99) - (b.order || 99));
  return pool[0];
}

function availableProviders() {
  return providers().filter(usable);
}

function noteSuccess(p) {
  failures.delete(p.id);
  const next = Number(p.requestsUsed || 0) + 1;
  const limit = Number(p.requestLimit || 0);
  const patch = { requestsUsed: next, lastUsed: Date.now(), errors: 0 };
  if (limit > 0 && next >= limit) {
    patch.exhaustedAt = Date.now();
    patch.exhausted = true;
    if (p.autoDisable !== false) patch.enabled = false;
    store.log('provider', `Provider "${p.name}" reached its ${limit} request limit and was parked.`, { providerId: p.id });
  }
  store.update('providers', p.id, patch);
  return patch;
}

function noteFailure(p, err) {
  const f = failures.get(p.id) || { count: 0, until: 0 };
  f.count++;
  if (f.count >= 3) f.until = Date.now() + COOLDOWN_MS;
  failures.set(p.id, f);
  store.update('providers', p.id, {
    errors: Number(p.errors || 0) + 1,
    lastError: String(err && err.message ? err.message : err).slice(0, 300),
    lastErrorAt: Date.now()
  });
  return f;
}

/* ---------------------------- request building ---------------------------- */
function buildRequest(provider, { model, messages, temperature, maxTokens, stream }) {
  const type = provider.type || 'openai';
  const base = String(provider.baseUrl || '').replace(/\/+$/, '');
  const modelName = model || provider.model || 'gpt-4o-mini';

  if (type === 'anthropic') {
    const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const rest = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }));
    return {
      url: /\/v1\/messages$/.test(base) ? base : `${base}/v1/messages`,
      headers: {
        'content-type': 'application/json',
        'x-api-key': provider.apiKey || '',
        'anthropic-version': '2023-06-01'
      },
      body: {
        model: modelName,
        max_tokens: Number(provider.maxTokens || maxTokens || 2048),
        temperature: temperature ?? 0.7,
        stream: !!stream,
        ...(sys ? { system: sys } : {}),
        messages: rest
      }
    };
  }

  if (type === 'gemini') {
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content || '') }] }));
    const key = provider.apiKey || '';
    const path = stream ? 'streamGenerateContent' : 'generateContent';
    return {
      url: `${base}/v1beta/models/${encodeURIComponent(modelName)}:${path}?key=${encodeURIComponent(key)}${stream ? '&alt=sse' : ''}`,
      headers: { 'content-type': 'application/json' },
      body: {
        contents,
        generationConfig: {
          temperature: temperature ?? 0.7,
          maxOutputTokens: Number(provider.maxTokens || maxTokens || 2048)
        }
      }
    };
  }

  // default: OpenAI compatible (OpenAI, DeepSeek, Groq, OpenRouter, Together, xAI...)
  const url = /\/chat\/completions$/.test(base)
    ? base
    : /\/v\d+$/.test(base)
      ? `${base}/chat/completions`
      : `${base}/v1/chat/completions`;
  return {
    url,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${provider.apiKey || ''}`
    },
    body: {
      model: modelName,
      messages,
      temperature: temperature ?? 0.7,
      max_tokens: Number(provider.maxTokens || maxTokens || 2048),
      stream: !!stream
    }
  };
}

/** Normalise a non-streaming provider response to plain text. */
function extractText(type, json) {
  try {
    if (type === 'anthropic') {
      return (json.content || []).map((c) => c.text || '').join('').trim();
    }
    if (type === 'gemini') {
      return (json.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
    }
    return (json.choices?.[0]?.message?.content || '').toString().trim();
  } catch {
    return '';
  }
}

/** Normalise a streamed chunk to a text delta. */
function extractDelta(type, json) {
  try {
    if (type === 'anthropic') return json.delta?.text || '';
    if (type === 'gemini') return (json.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    return json.choices?.[0]?.delta?.content || '';
  } catch {
    return '';
  }
}

/** Live health snapshot for the admin dashboard (never exposes keys). */
function health() {
  return providers().map((p) => ({
    id: p.id,
    name: p.name,
    model: p.model,
    type: p.type || 'openai',
    enabled: !!p.enabled,
    usable: usable(p),
    requestsUsed: Number(p.requestsUsed || 0),
    requestLimit: Number(p.requestLimit || 0),
    remaining: Number(p.requestLimit || 0) > 0 ? Math.max(0, Number(p.requestLimit) - Number(p.requestsUsed || 0)) : -1,
    errors: Number(p.errors || 0),
    lastError: p.lastError || '',
    coolingDown: (failures.get(p.id)?.until || 0) > Date.now(),
    keySet: !!p.apiKey
  }));
}

module.exports = {
  pick,
  usable,
  providers,
  availableProviders,
  noteSuccess,
  noteFailure,
  buildRequest,
  extractText,
  extractDelta,
  health,
  failures
};
