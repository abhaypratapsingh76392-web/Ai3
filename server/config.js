'use strict';
/* ============================================================================
 * Central configuration. Everything can be overridden by environment
 * variables so the same Docker image runs anywhere (Render, VPS, local).
 * ==========================================================================*/

const env = process.env;
const bool = (v, d = false) => (v === undefined ? d : /^(1|true|yes|on)$/i.test(String(v)));

const config = {
  port: Number(env.PORT || 8080),

  /* ---- security ---- */
  jwtSecret:
    env.JWT_SECRET ||
    'dev-only-insecure-secret-change-me-' + 'x'.repeat(32),
  jwtTtlSeconds: Number(env.JWT_TTL || 60 * 60 * 24 * 7), // 7 days
  adminPassword: env.ADMIN_PASSWORD || 'Akshayai',
  adminKey: 'Akshayai', // UI key used inside /admin/login
  adminPath: (env.ADMIN_PATH || 'admin').replace(/^\/+|\/+$/g, ''),

  /* ---- data layer ----
   * dbMode: "auto" | "firebase" | "file"
   *   auto     -> Firebase RTDB when FIREBASE_DB_URL works, else local file
   *   firebase -> always Firebase
   *   file     -> local JSON file (data/db.json) - good for VPS
   */
  dbMode: (env.DB_MODE || 'auto').toLowerCase(),
  firebaseUrl: (env.FIREBASE_DB_URL || 'https://luckymall-23b3f-default-rtdb.firebaseio.com').replace(/\/+$/, ''),
  firebaseAuth: env.FIREBASE_DB_SECRET || '', // optional legacy db secret
  dataDir: env.DATA_DIR || 'data',
  dataFile: env.DATA_FILE || 'db.json',

  /* ---- public firebase web config (served to browser for Google login) ---- */
  firebaseConfig: {
    apiKey: env.FB_API_KEY || 'AIzaSyDkQ7mJ6qS0dA0b2k8b2xZ1nRj0hKq6Hbc',
    authDomain: env.FB_AUTH_DOMAIN || 'luckymall-23b3f.firebaseapp.com',
    databaseURL: env.FIREBASE_DB_URL || 'https://luckymall-23b3f-default-rtdb.firebaseio.com',
    projectId: env.FB_PROJECT_ID || 'luckymall-23b3f',
    storageBucket: env.FB_STORAGE_BUCKET || 'luckymall-23b3f.appspot.com',
    messagingSenderId: env.FB_SENDER_ID || '1096441275071',
    appId: env.FB_APP_ID || '1:1096441275071:web:9c4d6c2b1c0b9a52c1f4e2'
  },

  /* ---- defaults used to seed the first run ---- */
  defaultProviders: [
    {
      id: 'p_default_openai',
      name: 'Primary Engine',
      label: 'GPT-4o mini',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-4o-mini',
      enabled: true,
      requestLimit: 10, // requests before rotation
      requestsUsed: 0,
      weight: 100,
      order: 1,
      tokensPerRequest: 0
    }
  ],

  defaultModels: [
    { id: 'm_claude', name: 'Claude Sonnet', vendor: 'Anthropic', tier: 'Pro', desc: 'Best for long reasoning, code and writing.', color: '#d97757', icon: 'claude', enabled: true, minPlan: 'free' },
    { id: 'm_gpt', name: 'GPT-4o', vendor: 'OpenAI', tier: 'Pro', desc: 'Great all round assistant, fast and precise.', color: '#10a37f', icon: 'openai', enabled: true, minPlan: 'free' },
    { id: 'm_deepseek', name: 'DeepSeek R1', vendor: 'DeepSeek', tier: 'Pro', desc: 'Deep step-by-step reasoning on complex maths.', color: '#4d6bfe', icon: 'deepseek', enabled: true, minPlan: 'free' },
    { id: 'm_gemini', name: 'Gemini 2.0', vendor: 'Google', tier: 'Plus', desc: 'Multimodal speed with a huge context window.', color: '#4285f4', icon: 'gemini', enabled: true, minPlan: 'free' },
    { id: 'm_llama', name: 'Llama 3.3', vendor: 'Meta', tier: 'Free', desc: 'Open weights, blazing fast, fully free tier.', color: '#0866ff', icon: 'llama', enabled: true, minPlan: 'free' },
    { id: 'm_grok', name: 'Grok Beta', vendor: 'xAI', tier: 'Pro', desc: 'Real-time flavoured answers with a punch.', color: '#8b5cf6', icon: 'grok', enabled: true, minPlan: 'free' },
    { id: 'm_mistral', name: 'Mistral Large', vendor: 'Mistral', tier: 'Plus', desc: 'Efficient European models, strong in code.', color: '#ff7000', icon: 'mistral', enabled: true, minPlan: 'free' },
    { id: 'm_qwen', name: 'Qwen Max', vendor: 'Alibaba', tier: 'Plus', desc: 'Excellent multilingual understanding.', color: '#615ced', icon: 'qwen', enabled: true, minPlan: 'free' }
  ],

  defaultPlans: [
    { id: 'free', name: 'Free', price: 0, tokens: 5000, daily: 60, perks: ['5,000 starter tokens', '60 messages / day', 'All 8 base models', 'File upload (5MB)'], active: true, order: 1 },
    { id: 'starter', name: 'Starter', price: 149, tokens: 200000, daily: 500, perks: ['200,000 tokens', '500 messages / day', 'Priority routing', 'File upload (10MB)'], active: true, order: 2 },
    { id: 'pro', name: 'Pro', price: 499, tokens: 1000000, daily: 2000, perks: ['1,000,000 tokens', 'Unlimited daily chat', 'Faster API rotation', 'File upload (25MB)'], active: true, order: 3, popular: true },
    { id: 'business', name: 'Business', price: 1299, tokens: 5000000, daily: 10000, perks: ['5,000,000 tokens', 'Team ready', 'Highest rate limit', 'File upload (50MB)'], active: true, order: 4 }
  ],

  defaultSettings: {
    brandName: 'FreeModel VIP',
    tagline: 'Every premium AI model. One subscription.',
    tokensPerMessage: 15,       // flat cost per message
    chargeByLength: true,       // plus tokens based on prompt length
    tokensPer1kChars: 5,
    freeSignupTokens: 5000,
    maxUploadMb: 10,
    maxUploadsPerChat: 6,
    maxPromptChars: 20000,
    maintenance: false,
    signupEnabled: true,
    googleLogin: true,
    emailLogin: true,
    minProviderRequests: 1,
    payment: {
      mode: 'manual', // manual | razorpay | cashfree
      upiId: 'luckymall@upi',
      upiName: 'FreeModel VIP',
      qrImage: '',
      razorpayKeyId: '',
      razorpayKeySecret: '',
      cashfreeAppId: '',
      cashfreeSecret: '',
      cashfreeEnv: 'sandbox',
      instructions: 'Pay the exact amount on the UPI ID above, then upload the payment screenshot / UTR number. Admin verifies and activates your plan within a few minutes.'
    }
  }
};

config.isProd = env.NODE_ENV === 'production';
config.weakSecret = !env.JWT_SECRET;

module.exports = config;
