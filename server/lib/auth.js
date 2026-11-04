'use strict';
/* ============================================================================
 * Authentication + authorisation middleware.
 * Sessions are stored server side so an admin can force-logout any device
 * ("login bounce") by revoking the session id embedded in the JWT.
 * ==========================================================================*/
const config = require('../config');
const store = require('./store');
const security = require('./security');

function bearer(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  const q = req.query && req.query.token;
  if (typeof q === 'string' && q.length > 20) return q;
  return '';
}

function clientIp(req) {
  return (
    (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    ''
  );
}

function userAgent(req) {
  return security.cleanText((req.headers['user-agent'] || '').toString(), 240);
}

/** Creates a session + JWT for a user. */
function issueToken(req, user) {
  const sid = security.id('s_');
  const raw = security.randomToken(24);
  const session = {
    id: sid,
    userId: user.id,
    tokenHash: security.sha256(raw),
    ip: clientIp(req),
    ua: userAgent(req),
    createdAt: Date.now(),
    lastSeen: Date.now(),
    active: true
  };
  store.set('sessions', sid, session);
  const token = security.sign({ sub: user.id, sid, k: security.sha256(raw).slice(0, 12), role: user.role || 'user' });
  return { token, session };
}

/** Resolves req.user from the Authorization header. */
function resolveUser(req) {
  const token = bearer(req);
  if (!token) return null;
  const payload = security.verify(token);
  if (!payload || !payload.sub) return null;
  const session = store.get('sessions', payload.sid);
  if (!session || !session.active) return null;
  const user = store.get('users', payload.sub);
  if (!user) return null;
  if (user.status === 'blocked') return null;
  // light "last seen" update without hammering storage
  if (Date.now() - (session.lastSeen || 0) > 60 * 1000) {
    store.update('sessions', session.id, { lastSeen: Date.now() });
  }
  return { user, session, token };
}

function attach(req, _res, next) {
  const ctx = resolveUser(req);
  if (ctx) {
    req.user = ctx.user;
    req.session = ctx.session;
  }
  next();
}

function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in to continue.', code: 'auth' });
  if (req.user.status === 'blocked') return res.status(403).json({ error: 'Your account has been suspended.', code: 'blocked' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.admin) return res.status(401).json({ error: 'Admin authorisation required.', code: 'admin' });
  next();
}

/** Admin auth: separate signed token in `x-admin-token`. */
function adminToken() {
  return security.sign({ role: 'admin', sub: 'admin' }, 60 * 60 * 12);
}

function attachAdmin(req, _res, next) {
  const t = (req.headers['x-admin-token'] || req.headers['X-Admin-Token'] || '').toString();
  if (t) {
    const p = security.verify(t);
    if (p && p.role === 'admin') req.admin = true;
  }
  next();
}

function requireAdminFlag(req, res, next) {
  if (!req.admin) return res.status(401).json({ error: 'Admin authorisation required.', code: 'admin' });
  next();
}

/** Public view of a user - never leaks password hash or internal secrets. */
function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatar || '',
    plan: user.plan || 'free',
    planExpiresAt: user.planExpiresAt || null,
    tokens: Math.max(0, Math.round(user.tokens || 0)),
    tokensUsed: Math.round(user.tokensUsed || 0),
    messages: user.messages || 0,
    status: user.status || 'active',
    role: user.role || 'user',
    provider: user.provider || 'email',
    createdAt: user.createdAt,
    lastLogin: user.lastLogin || null
  };
}

module.exports = {
  bearer,
  clientIp,
  userAgent,
  issueToken,
  resolveUser,
  attach,
  attachAdmin,
  requireUser,
  requireAdmin: requireAdminFlag,
  adminToken,
  publicUser,
  config
};
