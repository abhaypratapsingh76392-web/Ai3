# 🚀 FreeModel VIP — Full Stack AI Chat Platform

One subscription → **every premium AI model** (Claude, GPT-4o, Gemini, DeepSeek, Llama, Grok, Mistral, Qwen)
inside one beautiful, streaming chat — plus a complete admin console with an **invisible API key pool**,
token metering, plans and manual / Razorpay / Cashfree payments.

Built as a single Node + Express app (Docker ready for **Render**), with a Firebase Realtime Database
backend and an automatic local-disk fallback so nothing is ever lost.

---

## ⚡ Quick start (local)

```bash
npm install
cp .env.example .env        # edit if you want
npm start                   # -> http://localhost:8080
```

| URL | What it is |
| --- | --- |
| `/` | Landing page (models, features, pricing, FAQ) |
| `/login` | Google + email login, guest mode |
| `/app` | The chat dashboard |
| `/admin` | Admin console |
| `/Sjdhsjjc/Sjdhsjjc` | **Secret admin URL** (opens the same console) |

**Admin password:** `Akshayai` (change with the `ADMIN_PASSWORD` env var).

---

## 🐳 Deploy on Render (Docker)

1. Push this repo to GitHub.
2. Render → **New → Web Service** → connect the repo → it auto-detects `Dockerfile`
   (or use the included `render.yaml` blueprint).
3. Add these environment variables:

| Key | Value |
| --- | --- |
| `JWT_SECRET` | a long random string (Render can generate it) |
| `ADMIN_PASSWORD` | `Akshayai` (or your own) |
| `FIREBASE_DB_URL` | `https://luckymall-23b3f-default-rtdb.firebaseio.com` |
| `FB_API_KEY` | your Firebase **Web API key** (for Google login verification) |
| `FB_AUTH_DOMAIN` | `luckymall-23b3f.firebaseapp.com` |
| `FB_PROJECT_ID` | `luckymall-23b3f` |
| `FB_APP_ID` | your app id |
| `FB_SENDER_ID` | your sender id |
| `DATA_DIR` | `/app/data` (already the default in Docker) |

4. Attach a **disk** at `/app/data` (1 GB is plenty) so the local mirror survives restarts.
5. Deploy. Health check: `/api/health`.

> The app runs perfectly without Firebase too — it then keeps everything in `/app/data/db.json`.
> Set `DB_MODE=file` to force that, `DB_MODE=firebase` to force Firebase.

### Firebase notes
* Realtime Database rules must allow the server to read/write the `freemodel_vip` node.
  For a quick start use `{"rules":{".read":true,".write":true}}`, then tighten later
  (or set `FIREBASE_DB_SECRET` and use legacy token auth).
* Google login: enable **Google** in Firebase → Authentication → Sign-in method, and add your
  Render domain under Authorized domains. The browser talks to Firebase directly
  (the web config comes from `/api/bootstrap`); the server re-verifies every Google token
  with Google Identity Toolkit before creating a session.

---

## 🔑 Adding AI providers (the important part)

Admin → **API providers** → `+ Add provider`.

Any of these work out of the box:

| Protocol | Base URL example | Models |
| --- | --- | --- |
| `openai` | `https://api.openai.com/v1` | `gpt-4o-mini`, `gpt-4o` |
| `openai` | `https://api.deepseek.com/v1` | `deepseek-chat`, `deepseek-reasoner` |
| `openai` | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| `openai` | `https://openrouter.ai/api/v1` | anything OpenRouter serves |
| `openai` | `https://api.x.ai/v1` | `grok-2-latest` |
| `anthropic` | `https://api.anthropic.com` | `claude-3-5-sonnet-20241022` |
| `gemini` | `https://generativelanguage.googleapis.com` | `gemini-2.0-flash` |

**Request limit** = how many chat requests that key may serve.
When it is reached the key is parked automatically and the router switches to the next key —
the user never sees an error, a key name, or a rotation. `Reset` puts it back in the pool.
`Test` sends a real 1-line request so you can verify a key instantly.

You can add **as many keys as you like** (same or different vendors). Users only ever see the
public **Models** list (Admin → Models), which you control completely.

---

## 🧾 Money & plans

* **Plans** (Admin → Plans): name, price, tokens included, daily message limit, perks, publish/hide.
* **Payment gateway** (Admin → Settings → Payments): `manual`, `razorpay` or `cashfree`.
  * `manual` → shows your UPI ID / QR, the user submits the UTR + screenshot, and it appears in
    Admin → Payments where you press **Approve** — the plan and tokens activate instantly.
  * `razorpay` → real checkout, signature verified server-side, auto-activation.
  * `cashfree` → order + checkout session, sandbox or production.
* **Token cost** (Admin → Settings): flat cost per message + optional per-1,000-character surcharge.
  Failed requests are refunded automatically.

---

## 🛡️ Security

* **scrypt** password hashing (no plain text anywhere), constant-time comparisons.
* Signed JWT sessions **backed by a server-side session record** → admin can revoke / "bounce"
  any device instantly (Admin → Users → Bounce, or Sessions → Revoke).
* Strict **CSP**, `X-Frame-Options`, nosniff, referrer policy, no `x-powered-by`.
* Rate limits on login, signup, guest sessions, uploads, chat and payments.
* Every input sanitised + length-capped; Markdown rendered through an escaping renderer
  (no `innerHTML` of raw model output, no script injection).
* API keys are stored server-side only and never returned in full to any browser.
* Google ID tokens are verified against Google's own Identity Toolkit endpoint.
* Razorpay signature verified with HMAC-SHA256.

---

## 📁 What's inside

```
server/
  index.js            Express app, CSP, rate limits, routes, static hosting
  config.js           All defaults + env overrides
  lib/security.js     scrypt, JWT, rate limiter, sanitisers
  lib/store.js        Firebase RTDB + local JSON store (mirrored, debounced writes)
  lib/auth.js         Sessions, middleware, public user shape
  lib/router.js       Provider pool: rotation, failover, budgets, health
  lib/files.js        PDF / text / image extraction
  routes/auth.js      signup, login, Google, guest, profile, sessions
  routes/chat.js      models, uploads, chat (SSE + JSON), regenerate, history
  routes/billing.js   plans, manual payment, Razorpay, Cashfree
  routes/admin.js     dashboard, users, sessions, providers, models, plans,
                      payments, chats, settings, logs, broadcast
public/
  index.html          Landing page
  login.html          Auth page
  app.html            Chat dashboard
  admin.html          Admin console
  assets/css/theme.css
  assets/js/icons.js  Inline SVG icon + model-brand library
  assets/js/core.js   API client, toasts, modals, markdown renderer
Dockerfile, render.yaml, .env.example
```

---

## 🧪 Handy endpoints

```
GET  /api/health                 uptime + storage backend
GET  /api/bootstrap              public settings, models, plans, firebase config
POST /api/auth/signup|login|google|guest
GET  /api/auth/me
POST /api/chat                   SSE stream (or {"stream":false} for JSON)
POST /api/upload                 multipart files → extracted text / image data
GET  /api/chats                  history list
POST /api/admin/login            → admin token (sent as x-admin-token)
```

---

## ❓ Troubleshooting

| Symptom | Fix |
| --- | --- |
| "No AI provider is configured" | Add a provider with a valid key in Admin → API providers, then press **Test**. |
| Google button says "not configured" | Set `FB_API_KEY` (Firebase web API key) in the server env and redeploy. |
| Data disappears after redeploy | Attach a Render disk at `/app/data`, or make sure Firebase is reachable (check Admin badge). |
| Admin URL not opening | `/admin`, `/admin/`, and `/<ADMIN_PATH>` all work; the secret route is `/Sjdhsjjc/Sjdhsjjc`. |

Made with ♥ for people who want every premium model without five subscriptions.
