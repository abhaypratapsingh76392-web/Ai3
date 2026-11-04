'use strict';
/* ============================================================================
 * Storage layer with two interchangeable backends:
 *   1. Firebase Realtime Database (REST)  <- used when reachable & writable
 *   2. Local JSON file                    <- automatic fallback (VPS / offline)
 *
 * The whole database is cached in memory. Writes are debounced per collection
 * and pushed to the backend, so the app stays fast even on slow networks.
 * ==========================================================================*/
const fs = require('fs');
const path = require('path');
const config = require('../config');
const security = require('./security');

const COLLECTIONS = ['settings', 'providers', 'plans', 'users', 'sessions', 'chats', 'payments', 'logs', 'models', 'meta'];
const ROOT = 'freemodel_vip'; // namespace inside the firebase project

const emptyData = () => ({
  meta: {},
  settings: {},
  providers: {},
  plans: {},
  models: {},
  users: {},
  sessions: {},
  chats: {},
  payments: {},
  logs: {}
});

class Store {
  constructor() {
    this.data = emptyData();
    this.backend = 'file';
    this.ready = false;
    this.queue = new Map();
    this.flushing = false;
    this.lastError = null;
    this.firebaseOk = false;
    this.file = path.isAbsolute(config.dataDir)
      ? path.join(config.dataDir, config.dataFile)
      : path.join(process.cwd(), config.dataDir, config.dataFile);
  }

  /* ------------------------------- init ---------------------------------- */
  async init() {
    await fs.promises.mkdir(path.dirname(this.file), { recursive: true }).catch(() => {});

    // always load the local mirror first - it is our safety net
    const local = this.readFile();
    this.data = local;

    const wantFirebase = config.dbMode === 'firebase' || config.dbMode === 'auto';
    if (wantFirebase) {
      try {
        const remote = { ...emptyData(), ...((await this.readFirebase()) || {}) };
        this.backend = 'firebase';
        this.firebaseOk = true;
        // whichever copy holds more real records wins, so a restart can never
        // silently wipe data that only made it to disk.
        if (records(remote) >= records(local)) {
          this.data = remote;
          console.log('[store] connected to Firebase RTDB');
        } else {
          this.data = local;
          console.log('[store] Firebase is behind the local mirror - pushing local data up');
          for (const c of COLLECTIONS) this.dirty(c);
        }
      } catch (e) {
        this.lastError = e.message;
        if (config.dbMode === 'firebase') {
          console.error('[store] Firebase unreachable:', e.message);
          this.backend = 'firebase';
          this.firebaseOk = false;
        } else {
          console.warn('[store] Firebase unreachable, using local file store:', e.message);
        }
      }
    }

    await this.seed();
    this.ready = true;
    this.startFlusher();
    return this;
  }

  /* ---------------------------- firebase io ------------------------------ */
  fbUrl(p) {
    const base = `${config.firebaseUrl}/${ROOT}/${p}.json`;
    return config.firebaseAuth ? `${base}?auth=${encodeURIComponent(config.firebaseAuth)}` : base;
  }

  async readFirebase() {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    try {
      const out = {};
      for (const c of COLLECTIONS) {
        const res = await fetch(this.fbUrl(c), { signal: ctrl.signal, headers: { accept: 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        out[c] = (await res.json()) || {};
      }
      return out;
    } finally {
      clearTimeout(t);
    }
  }

  async writeFirebase(collection, value) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(this.fbUrl(collection), {
        method: 'PUT',
        signal: ctrl.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(value || {})
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.firebaseOk = true;
      return true;
    } catch (e) {
      this.firebaseOk = false;
      this.lastError = e.message;
      throw e;
    } finally {
      clearTimeout(t);
    }
  }

  /* ----------------------------- file io -------------------------------- */
  readFile() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      return { ...emptyData(), ...parsed };
    } catch {
      return emptyData();
    }
  }

  writeFile() {
    try {
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      fs.renameSync(tmp, this.file);
    } catch (e) {
      console.error('[store] file write failed', e.message);
    }
  }

  /* ------------------------------ persisting ----------------------------- */
  dirty(name) {
    this.queue.set(name, (this.queue.get(name) || 0) + 1);
  }

  startFlusher() {
    this.timer = setInterval(() => this.flush(), 1200);
    this.timer.unref?.();
  }

  async flush() {
    if (this.flushing || !this.queue.size) return;
    this.flushing = true;
    const names = [...this.queue.keys()];
    this.queue.clear();
    try {
      if (this.backend === 'firebase') {
        // mirror to disk first so nothing is ever lost
        this.writeFile();
        for (const n of names) {
          try {
            await this.writeFirebase(n, this.data[n]);
          } catch (e) {
            this.queue.set(n, 1);
            console.warn('[store] firebase write failed for', n, '-', e.message);
            break;
          }
        }
      } else {
        this.writeFile();
      }
    } finally {
      this.flushing = false;
    }
  }

  async flushNow() {
    await this.flush();
  }

  /* -------------------------------- seeding ------------------------------ */
  async seed() {
    let changed = false;

    if (!this.data.meta || !this.data.meta.version) {
      this.data.meta = { version: 1, createdAt: Date.now(), bootCount: 0 };
      changed = true;
    }
    this.data.meta.bootCount = (this.data.meta.bootCount || 0) + 1;
    this.data.meta.lastBoot = Date.now();
    changed = true;

    if (!Object.keys(this.data.settings || {}).length) {
      this.data.settings = JSON.parse(JSON.stringify(config.defaultSettings));
      changed = true;
    } else {
      // merge newly introduced settings keys without clobbering admin values
      const merged = deepMerge(JSON.parse(JSON.stringify(config.defaultSettings)), this.data.settings);
      if (JSON.stringify(merged) !== JSON.stringify(this.data.settings)) {
        this.data.settings = merged;
        changed = true;
      }
    }

    if (!Object.keys(this.data.providers || {}).length) {
      this.data.providers = {};
      for (const p of config.defaultProviders) this.data.providers[p.id] = { ...p };
      changed = true;
    }

    if (!Object.keys(this.data.plans || {}).length) {
      this.data.plans = {};
      for (const p of config.defaultPlans) this.data.plans[p.id] = { ...p };
      changed = true;
    }

    if (!Object.keys(this.data.models || {}).length) {
      this.data.models = {};
      for (const m of config.defaultModels) this.data.models[m.id] = { ...m };
      changed = true;
    }

    if (!this.data.users || typeof this.data.users !== 'object') {
      this.data.users = {};
      changed = true;
    }

    if (changed) {
      for (const c of ['meta', 'settings', 'providers', 'plans', 'models', 'users']) this.dirty(c);
    }
    return this;
  }

  /* -------------------------------- helpers ------------------------------ */
  all(collection) {
    return Object.values(this.data[collection] || {}).filter(Boolean);
  }

  get(collection, id) {
    return (this.data[collection] || {})[id] || null;
  }

  set(collection, id, value) {
    this.data[collection] = this.data[collection] || {};
    this.data[collection][id] = value;
    this.dirty(collection);
    return value;
  }

  update(collection, id, patch) {
    const cur = this.get(collection, id) || {};
    const next = { ...cur, ...patch };
    return this.set(collection, id, next);
  }

  remove(collection, id) {
    if (this.data[collection]) {
      delete this.data[collection][id];
      this.dirty(collection);
    }
  }

  // alias for clarity
  collection(name) {
    return {
      all: () => this.all(name),
      get: (id) => this.get(name, id),
      set: (id, v) => this.set(name, id, v),
      update: (id, p) => this.update(name, id, p),
      remove: (id) => this.remove(name, id)
    };
  }

  /* ------------------------------ user helpers --------------------------- */
  findUserByEmail(email) {
    const e = String(email || '').toLowerCase();
    return this.all('users').find((u) => String(u.email || '').toLowerCase() === e) || null;
  }

  findUserByGoogle(uid) {
    return this.all('users').find((u) => u.googleUid && u.googleUid === uid) || null;
  }

  log(type, message, extra = {}) {
    const entry = {
      id: security.id('log_'),
      type,
      message: security.cleanText(message, 500),
      ...extra,
      at: Date.now()
    };
    this.set('logs', entry.id, entry);
    // keep the log collection bounded
    const logs = this.all('logs');
    if (logs.length > 3000) {
      logs.sort((a, b) => a.at - b.at);
      for (const l of logs.slice(0, logs.length - 3000)) this.remove('logs', l.id);
    }
    return entry;
  }
}

/** Rough "how much real data does this snapshot hold" score. */
function records(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return 0;
  let n = 0;
  for (const c of ['users', 'chats', 'payments', 'sessions', 'providers', 'plans', 'models']) {
    const v = snapshot[c];
    if (v && typeof v === 'object') n += Object.keys(v).length;
  }
  return n;
}

function deepMerge(base, override) {
  if (Array.isArray(base) || Array.isArray(override)) return override === undefined ? base : override;
  if (typeof base !== 'object' || base === null) return override === undefined ? base : override;
  if (typeof override !== 'object' || override === null) return base;
  const out = { ...base };
  for (const k of Object.keys(override)) {
    out[k] = deepMerge(base[k], override[k]);
  }
  return out;
}

const store = new Store();
module.exports = store;
module.exports.deepMerge = deepMerge;
