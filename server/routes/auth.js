'use strict';
/* ============================================================================
 * Auth routes: email/password, Google (Firebase ID token), guest, sessions.
 * ==========================================================================*/
const express = require('express');
const config = require('../config');
const store = require('../lib/store');
const auth = require('../lib/auth');
const sec = require('../lib/security');

const router = express.Router();

const DAY = 24 * 60 * 60 * 1000;

function settings() {
  return store.get('settings', 'main') || config.defaultSettings;
}

function planById(id) {
  return store.get('plans', id) || store.get('plans', 'free') || null;
}

function rateKey(prefix, req) {
  return `${prefix}:${auth.clientIp(req)}`;
}

/* ------------------------------- signup ---------------------------------- */
router.post('/signup', (req, res) => {
  const s = settings();
  if (!s.signupEnabled) return res.status(403).json({ error: 'Sign ups are temporarily closed.' });

  const rl = sec.rateLimit(rateKey('signup', req), 12, 10 * 60 * 1000);
  if (!rl.ok) return res.status(429).json({ error: `Too many attempts. Try again in ${rl.retryAfter}s.` });

  const name = sec.cleanText(String(req.body.name || '').trim(), 60);
  const email = sec.cleanEmail(req.body.email);
  const password = String(req.body.password || '');

  if (!name) return res.status(400).json({ error: 'Please enter your name.' });
  if (!email) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  if (store.findUserByEmail(email)) return res.status(409).json({ error: 'An account with this email already exists.' });

  const free = planById('free');
  const user = {
    id: sec.id('u_'),
    name,
    email,
    passwordHash: sec.hashPassword(password),
    provider: 'email',
    role: 'user',
    plan: 'free',
    planExpiresAt: Date.now() + 3650 * DAY,
    tokens: Number(s.freeSignupTokens ?? free?.tokens ?? 5000),
    tokensUsed: 0,
    messages: 0,
    totalSpent: 0,
    status: 'active',
    avatar: '',
    createdAt: Date.now(),
    lastLogin: Date.now(),
    dailyCount: 0,
    dailyReset: Date.now()
  };
  store.set('users', user.id, user);
  store.log('auth', `New signup: ${email}`, { userId: user.id });

  const { token } = auth.issueToken(req, user);
  return res.json({ token, user: auth.publicUser(user) });
});

/* -------------------------------- login ---------------------------------- */
router.post('/login', (req, res) => {
  const rl = sec.rateLimit(rateKey('login', req), 20, 10 * 60 * 1000);
  if (!rl.ok) return res.status(429).json({ error: `Too many attempts. Try again in ${rl.retryAfter}s.` });

  const email = sec.cleanEmail(req.body.email);
  const password = String(req.body.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const user = store.findUserByEmail(email);
  if (!user || !sec.verifyPassword(password, user.passwordHash)) {
    store.log('auth', `Failed login for ${email}`);
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }
  if (user.status === 'blocked') return res.status(403).json({ error: 'This account has been suspended.' });

  store.update('users', user.id, { lastLogin: Date.now() });
  const { token } = auth.issueToken(req, user);
  return res.json({ token, user: auth.publicUser(store.get('users', user.id)) });
});

/* ------------------------- Google (Firebase ID token) --------------------- */
async function verifyFirebaseToken(idToken) {
  const key = config.firebaseConfig.apiKey;
  if (!key || /x{6,}/i.test(key) || key.length < 20) {
    throw new Error('Server Google sign-in is not configured. Add FB_API_KEY (web API key) to the environment.');
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken })
    });
    const json = await r.json();
    if (!r.ok || !json.users || !json.users.length) {
      throw new Error(json.error?.message || 'Invalid Google credential.');
    }
    return json.users[0];
  } finally {
    clearTimeout(t);
  }
}

router.post('/google', async (req, res) => {
  const s = settings();
  if (!s.googleLogin) return res.status(403).json({ error: 'Google sign-in is disabled.' });

  const rl = sec.rateLimit(rateKey('google', req), 30, 10 * 60 * 1000);
  if (!rl.ok) return res.status(429).json({ error: 'Too many attempts, please retry shortly.' });

  const idToken = String(req.body.idToken || req.body.credential || '');
  // Trusted fallback payload only when the server verifies the token above.
  let profile = null;

  if (idToken && idToken.split('.').length === 3) {
    try {
      const fbUser = await verifyFirebaseToken(idToken);
      profile = {
        uid: fbUser.localId,
        email: sec.cleanEmail(fbUser.email),
        name: sec.cleanText(fbUser.displayName || (fbUser.email || '').split('@')[0], 60),
        avatar: fbUser.photoUrl || '',
        emailVerified: !!fbUser.emailVerified
      };
    } catch (e) {
      // If the API key is missing/misconfigured we fall back to a *locally
      // verified* token only if it was signed by our own server.
      const verified = sec.verify(idToken);
      if (verified && verified.sub) {
        const u = store.get('users', verified.sub);
        if (u) return res.json({ token: idToken, user: auth.publicUser(u) });
      }
      return res.status(401).json({ error: `Google sign-in failed: ${e.message}` });
    }
  } else {
    return res.status(400).json({ error: 'Missing Google credential.' });
  }

  if (!profile.email) return res.status(400).json({ error: 'Google account has no verified email.' });

  let user = store.findUserByGoogle(profile.uid) || store.findUserByEmail(profile.email);
  if (user) {
    store.update('users', user.id, {
      googleUid: profile.uid,
      avatar: profile.avatar || user.avatar || '',
      lastLogin: Date.now(),
      provider: user.provider || 'google'
    });
  } else {
    if (!s.signupEnabled) return res.status(403).json({ error: 'Sign ups are temporarily closed.' });
    user = {
      id: sec.id('u_'),
      name: profile.name || 'User',
      email: profile.email,
      googleUid: profile.uid,
      passwordHash: '',
      provider: 'google',
      role: 'user',
      plan: 'free',
      planExpiresAt: Date.now() + 3650 * DAY,
      tokens: Number(s.freeSignupTokens ?? 5000),
      tokensUsed: 0,
      messages: 0,
      totalSpent: 0,
      status: 'active',
      avatar: profile.avatar || '',
      createdAt: Date.now(),
      lastLogin: Date.now(),
      dailyCount: 0,
      dailyReset: Date.now()
    };
    store.set('users', user.id, user);
    store.log('auth', `New Google signup: ${user.email}`, { userId: user.id });
  }

  if (user.status === 'blocked') return res.status(403).json({ error: 'This account has been suspended.' });

  const { token } = auth.issueToken(req, user);
  return res.json({ token, user: auth.publicUser(store.get('users', user.id)) });
});

/* -------------------------------- guest ---------------------------------- */
router.post('/guest', (req, res) => {
  const s = settings();
  const rl = sec.rateLimit(rateKey('guest', req), 8, 60 * 60 * 1000);
  if (!rl.ok) return res.status(429).json({ error: 'Too many guest sessions from this network. Please sign in.' });

  const user = {
    id: sec.id('u_'),
    name: 'Guest',
    email: `guest_${Date.now().toString(36)}@local`,
    passwordHash: '',
    provider: 'guest',
    role: 'user',
    plan: 'free',
    planExpiresAt: Date.now() + 7 * DAY,
    tokens: Math.min(500, Number(s.freeSignupTokens || 5000)),
    tokensUsed: 0,
    messages: 0,
    totalSpent: 0,
    status: 'active',
    avatar: '',
    createdAt: Date.now(),
    lastLogin: Date.now(),
    dailyCount: 0,
    dailyReset: Date.now()
  };
  store.set('users', user.id, user);
  const { token } = auth.issueToken(req, user);
  return res.json({ token, user: auth.publicUser(user) });
});

/* -------------------------------- session -------------------------------- */
router.get('/me', auth.attach, (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
  const s = settings();
  res.json({
    user: auth.publicUser(req.user),
    plan: store.get('plans', req.user.plan) || null,
    settings: publicSettings(s),
    usage: {
      tokensPerMessage: s.tokensPerMessage,
      tokensPer1kChars: s.tokensPer1kChars,
      chargeByLength: s.chargeByLength
    }
  });
});

router.patch('/profile', auth.attach, auth.requireUser, (req, res) => {
  const patch = {};
  if (typeof req.body.name === 'string' && req.body.name.trim()) {
    patch.name = sec.cleanText(req.body.name.trim(), 60);
  }
  if (typeof req.body.avatar === 'string') {
    const a = req.body.avatar.trim();
    if (a === '' || /^https?:\/\//.test(a) || /^data:image\//.test(a)) patch.avatar = a.slice(0, 400000);
  }
  if (Object.keys(patch).length) store.update('users', req.user.id, patch);
  if (req.body.password) {
    const pw = String(req.body.password);
    if (pw.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    store.update('users', req.user.id, { passwordHash: sec.hashPassword(pw) });
  }
  res.json({ user: auth.publicUser(store.get('users', req.user.id)) });
});

router.post('/logout', auth.attach, (req, res) => {
  if (req.session) store.update('sessions', req.session.id, { active: false, revokedAt: Date.now() });
  res.json({ ok: true });
});

router.post('/logout-all', auth.attach, auth.requireUser, (req, res) => {
  for (const s of store.all('sessions')) {
    if (s.userId === req.user.id) store.update('sessions', s.id, { active: false, revokedAt: Date.now() });
  }
  res.json({ ok: true });
});

function publicSettings(s) {
  return {
    brandName: s.brandName,
    tagline: s.tagline,
    maintenance: !!s.maintenance,
    googleLogin: !!s.googleLogin,
    emailLogin: !!s.emailLogin,
    signupEnabled: !!s.signupEnabled,
    maxUploadMb: s.maxUploadMb,
    maxUploadsPerChat: s.maxUploadsPerChat,
    maxPromptChars: s.maxPromptChars,
    tokensPerMessage: s.tokensPerMessage,
    tokensPer1kChars: s.tokensPer1kChars,
    chargeByLength: !!s.chargeByLength,
    freeSignupTokens: s.freeSignupTokens,
    payment: {
      mode: s.payment?.mode || 'manual',
      upiId: s.payment?.upiId || '',
      upiName: s.payment?.upiName || '',
      qrImage: s.payment?.qrImage || '',
      instructions: s.payment?.instructions || '',
      razorpayKeyId: s.payment?.mode === 'razorpay' ? s.payment?.razorpayKeyId || '' : ''
    }
  };
}

module.exports = router;
module.exports.publicSettings = publicSettings;
