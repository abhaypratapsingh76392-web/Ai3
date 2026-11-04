'use strict';
/* ============================================================================
 * FreeModel VIP - server entry point
 * Express app with hardened headers, rate limiting, API routes and static UI.
 * ==========================================================================*/
const path = require('path');
const express = require('express');
const config = require('./config');
const store = require('./lib/store');
const auth = require('./lib/auth');
const sec = require('./lib/security');
const { publicSettings } = require('./routes/auth');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

/* ------------------------------ body parsing ------------------------------ */
app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

/* --------------------------- security headers ----------------------------- */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://www.gstatic.com https://apis.google.com https://checkout.razorpay.com https://sdk.cashfree.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://api.razorpay.com https://*.cashfree.com",
      "frame-src 'self' https://luckymall-23b3f.firebaseapp.com https://apis.google.com https://api.razorpay.com https://sdk.cashfree.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ')
  );
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  next();
});

/* --------------------------- global rate limit ---------------------------- */
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    const rl = sec.rateLimit(`global:${auth.clientIp(req)}`, 600, 60 * 1000);
    if (!rl.ok) return res.status(429).json({ error: 'Too many requests. Please slow down.' });
  }
  next();
});

/* -------------------------------- routes ---------------------------------- */
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    uptime: Math.round(process.uptime()),
    backend: store.backend,
    ready: store.ready,
    version: '1.0.0',
    time: new Date().toISOString()
  });
});

/** Public bootstrap: everything the frontend needs before login. */
app.get('/api/bootstrap', (_req, res) => {
  const s = store.get('settings', 'main') || config.defaultSettings;
  const broadcast = store.get('settings', 'broadcast');
  res.json({
    settings: publicSettings(s),
    firebase: config.firebaseConfig,
    adminPath: config.adminPath,
    plans: store.all('plans').filter((p) => p.active !== false).sort((a, b) => (a.order || 99) - (b.order || 99)),
    models: store.all('models').filter((m) => m.enabled !== false).map((m) => ({
      id: m.id, name: m.name, vendor: m.vendor, tier: m.tier, desc: m.desc, color: m.color, icon: m.icon
    })),
    broadcast: broadcast && broadcast.message ? { message: broadcast.message, at: broadcast.at } : null
  });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/chat'));
app.use('/api', require('./routes/billing'));
app.use('/api/admin', require('./routes/admin'));

/* 404 for unknown API paths (never fall through to the SPA) */
app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API endpoint.' }));

/* ------------------------------- static UI -------------------------------- */
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.use(
  express.static(PUBLIC_DIR, {
    etag: true,
    maxAge: config.isProd ? '7d' : 0,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    }
  })
);

const ADMIN_SECRET_PATH = 'Sjdhsjjc/Sjdhsjjc';

function serveAdmin(_req, res) {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
}

/* admin panel works at /admin, /<ADMIN_PATH> and the secret nested path */
app.get(['/admin', '/admin/', '/admin/*', `/${config.adminPath}`, `/${config.adminPath}/`, `/${config.adminPath}/*`], serveAdmin);
app.get(
  [`/${ADMIN_SECRET_PATH}`, `/${ADMIN_SECRET_PATH}/`, `/${ADMIN_SECRET_PATH}/*`],
  serveAdmin
);

/* SPA fallback */
app.get(['/', '/index', '/index.html'], (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
app.get(['/app', '/app/', '/chat', '/chat/*', '/login', '/pricing', '/history'], (_req, res) =>
  res.sendFile(path.join(PUBLIC_DIR, 'app.html'))
);
app.use((req, res) => {
  if (req.method === 'GET' && !req.path.includes('.')) return res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  res.status(404).json({ error: 'Not found.' });
});

/* ------------------------------- error trap ------------------------------- */
app.use((err, _req, res, _next) => {
  console.error('[error]', err.message);
  if (res.headersSent) return res.end();
  const status = err.status || 500;
  res.status(status).json({ error: status === 500 ? 'Something went wrong on our side.' : err.message });
});

/* --------------------------------- boot ---------------------------------- */
async function boot() {
  if (config.weakSecret) {
    console.warn('[warn] JWT_SECRET is not set - using an insecure development secret.');
  }
  await store.init();

  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`\n  ${config.defaultSettings.brandName} server ready`);
    console.log(`  -> http://0.0.0.0:${config.port}`);
    console.log(`  -> storage: ${store.backend}${store.backend === 'firebase' ? ` (${config.firebaseUrl})` : ` (${store.file})`}`);
    console.log(`  -> admin:   /${config.adminPath}  +  /${ADMIN_SECRET_PATH}\n`);
  });
  server.headersTimeout = 120000;
  server.requestTimeout = 300000;

  const shutdown = async (sig) => {
    console.log(`\n[${sig}] flushing data...`);
    try {
      await store.flushNow();
    } catch {}
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 4000).unref?.();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e?.message || e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e?.message || e));

boot().catch((e) => {
  console.error('Failed to start:', e);
  process.exit(1);
});

module.exports = app;
