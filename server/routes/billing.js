'use strict';
/* ============================================================================
 * Plans, manual payment proof submission, Razorpay / Cashfree order creation,
 * payment history and token top-ups.
 * ==========================================================================*/
const express = require('express');
const config = require('../config');
const store = require('../lib/store');
const auth = require('../lib/auth');
const sec = require('../lib/security');

const api = express.Router();

function settings() {
  return store.get('settings', 'main') || config.defaultSettings;
}

const publicPlan = (p) => ({
  id: p.id,
  name: p.name,
  price: Number(p.price || 0),
  tokens: Number(p.tokens || 0),
  daily: Number(p.daily || 0),
  perks: Array.isArray(p.perks) ? p.perks : [],
  popular: !!p.popular,
  active: p.active !== false,
  order: p.order || 99
});

/* --------------------------------- plans --------------------------------- */
api.get('/plans', (_req, res) => {
  const plans = store
    .all('plans')
    .filter((p) => p && p.active !== false)
    .sort((a, b) => (a.order || 99) - (b.order || 99))
    .map(publicPlan);
  const s = settings();
  res.json({
    plans,
    payment: {
      mode: s.payment?.mode || 'manual',
      upiId: s.payment?.upiId || '',
      upiName: s.payment?.upiName || '',
      qrImage: s.payment?.qrImage || '',
      instructions: s.payment?.instructions || '',
      razorpayKeyId: s.payment?.mode === 'razorpay' ? s.payment?.razorpayKeyId || '' : ''
    },
    currency: s.currency || 'INR'
  });
});

/* ------------------------------ my payments ------------------------------ */
api.get('/payments', auth.attach, auth.requireUser, (req, res) => {
  const list = store
    .all('payments')
    .filter((p) => p.userId === req.user.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 100);
  res.json({ payments: list });
});

/* --------------------------- manual payment ------------------------------ */
api.post('/payments/manual', auth.attach, auth.requireUser, (req, res) => {
  const s = settings();
  const rl = sec.rateLimit(`pay:${req.user.id}`, 10, 60 * 60 * 1000);
  if (!rl.ok) return res.status(429).json({ error: 'Too many payment submissions. Please wait.' });

  const plan = store.get('plans', String(req.body.planId || ''));
  if (!plan) return res.status(400).json({ error: 'Please choose a valid plan.' });

  const utr = sec.cleanText(String(req.body.utr || req.body.reference || '').trim(), 64);
  const note = sec.cleanText(String(req.body.note || '').trim(), 300);
  const screenshot = String(req.body.screenshot || '');
  if (utr.length < 4) return res.status(400).json({ error: 'Enter the UTR / transaction reference number.' });
  if (screenshot && !/^data:image\//.test(screenshot)) return res.status(400).json({ error: 'Invalid screenshot.' });
  if (screenshot.length > 3_000_000) return res.status(400).json({ error: 'Screenshot too large (max ~2MB).' });

  const payment = {
    id: sec.id('pay_'),
    userId: req.user.id,
    userName: req.user.name,
    userEmail: req.user.email,
    planId: plan.id,
    planName: plan.name,
    amount: Number(plan.price || 0),
    tokens: Number(plan.tokens || 0),
    mode: 'manual',
    utr,
    note,
    screenshot: screenshot.slice(0, 3_000_000),
    status: 'pending',
    createdAt: Date.now()
  };
  store.set('payments', payment.id, payment);
  store.log('payment', `Manual payment submitted by ${req.user.email} for ${plan.name} (₹${plan.price})`, {
    userId: req.user.id,
    paymentId: payment.id
  });
  res.json({ payment, message: 'Payment submitted. Admin will verify and activate your plan shortly.' });
});

/* ---------------------------- razorpay order ----------------------------- */
api.post('/payments/razorpay/order', auth.attach, auth.requireUser, async (req, res) => {
  const s = settings();
  if (s.payment?.mode !== 'razorpay') return res.status(400).json({ error: 'Razorpay is not enabled.' });
  const plan = store.get('plans', String(req.body.planId || ''));
  if (!plan) return res.status(400).json({ error: 'Invalid plan.' });

  const keyId = s.payment.razorpayKeyId;
  const keySecret = s.payment.razorpayKeySecret;
  if (!keyId || !keySecret) return res.status(400).json({ error: 'Razorpay keys are not configured by the admin.' });

  const amountPaise = Math.round(Number(plan.price || 0) * 100);
  try {
    const r = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64')
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: s.currency || 'INR',
        receipt: `rcpt_${Date.now()}`,
        notes: { userId: req.user.id, planId: plan.id }
      })
    });
    const json = await r.json();
    if (!r.ok) return res.status(502).json({ error: json.error?.description || 'Could not create Razorpay order.' });

    const payment = {
      id: sec.id('pay_'),
      userId: req.user.id,
      userName: req.user.name,
      userEmail: req.user.email,
      planId: plan.id,
      planName: plan.name,
      amount: Number(plan.price || 0),
      tokens: Number(plan.tokens || 0),
      mode: 'razorpay',
      orderId: json.id,
      status: 'created',
      createdAt: Date.now()
    };
    store.set('payments', payment.id, payment);
    res.json({ order: json, keyId, paymentId: payment.id, amount: amountPaise, currency: s.currency || 'INR' });
  } catch (e) {
    res.status(502).json({ error: `Razorpay error: ${e.message}` });
  }
});

api.post('/payments/razorpay/verify', auth.attach, auth.requireUser, (req, res) => {
  const s = settings();
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment verification fields.' });
  }
  const crypto = require('crypto');
  const expected = crypto
    .createHmac('sha256', s.payment?.razorpayKeySecret || '')
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');
  if (!sec.safeEqual(expected, String(razorpay_signature))) {
    return res.status(400).json({ error: 'Payment signature verification failed.' });
  }
  const payment = store
    .all('payments')
    .find((p) => p.orderId === razorpay_order_id && p.userId === req.user.id);
  if (!payment) return res.status(404).json({ error: 'Payment record not found.' });

  activatePlan(payment, razorpay_payment_id);
  res.json({ ok: true, message: 'Payment successful - your plan is active!', payment: store.get('payments', payment.id) });
});

/* ---------------------------- cashfree order ----------------------------- */
api.post('/payments/cashfree/order', auth.attach, auth.requireUser, async (req, res) => {
  const s = settings();
  if (s.payment?.mode !== 'cashfree') return res.status(400).json({ error: 'Cashfree is not enabled.' });
  const plan = store.get('plans', String(req.body.planId || ''));
  if (!plan) return res.status(400).json({ error: 'Invalid plan.' });

  const env = s.payment.cashfreeEnv === 'production' ? 'https://api.cashfree.com' : 'https://sandbox.cashfree.com';
  const orderId = `FM${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
  try {
    const r = await fetch(`${env}/pg/orders`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-version': '2023-08-01',
        'x-client-id': s.payment.cashfreeAppId || '',
        'x-client-secret': s.payment.cashfreeSecret || ''
      },
      body: JSON.stringify({
        order_id: orderId,
        order_amount: Number(plan.price || 0),
        order_currency: s.currency || 'INR',
        customer_details: {
          customer_id: req.user.id,
          customer_email: req.user.email,
          customer_phone: '9999999999'
        }
      })
    });
    const json = await r.json();
    if (!r.ok) return res.status(502).json({ error: json.message || 'Cashfree order failed.' });

    const payment = {
      id: sec.id('pay_'),
      userId: req.user.id,
      userName: req.user.name,
      userEmail: req.user.email,
      planId: plan.id,
      planName: plan.name,
      amount: Number(plan.price || 0),
      tokens: Number(plan.tokens || 0),
      mode: 'cashfree',
      orderId,
      status: 'created',
      createdAt: Date.now()
    };
    store.set('payments', payment.id, payment);
    res.json({ order: json, paymentId: payment.id, sessionId: json.payment_session_id, orderId });
  } catch (e) {
    res.status(502).json({ error: `Cashfree error: ${e.message}` });
  }
});

/* ------------------------------ shared logic ----------------------------- */
function activatePlan(payment, gatewayRef) {
  const now = Date.now();
  const user = store.get('users', payment.userId);
  if (user) {
    const tokens = Number(payment.tokens || 0);
    store.update('users', user.id, {
      plan: payment.planId,
      planExpiresAt: now + 31 * 24 * 60 * 60 * 1000,
      tokens: Number(user.tokens || 0) + tokens,
      totalSpent: Number(user.totalSpent || 0) + Number(payment.amount || 0),
      dailyCount: 0,
      dailyReset: now
    });
  }
  store.update('payments', payment.id, {
    status: 'success',
    gatewayRef: gatewayRef || '',
    activatedAt: now
  });
  store.log('payment', `Plan ${payment.planName} activated for ${payment.userEmail} (₹${payment.amount})`, {
    userId: payment.userId,
    paymentId: payment.id
  });
  return store.get('payments', payment.id);
}

api.activatePlan = activatePlan;
api.publicPlan = publicPlan;
module.exports = api;
