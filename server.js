'use strict';
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const path = require('path');

const { FB_APP_ID, FB_APP_SECRET, BASE_URL, SESSION_SECRET } = process.env;
const GRAPH = process.env.FB_GRAPH_VERSION || 'v21.0';
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

if (!FB_APP_ID || !FB_APP_SECRET || !BASE_URL || !SESSION_SECRET) {
  console.error('Missing env vars. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const REDIRECT_URI = `${BASE_URL.replace(/\/$/, '')}/auth/facebook/callback`;
const SCOPE = 'public_profile,email'; // minimal, official permissions only

const app = express();
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      styleSrc: ["'self'"],
      scriptSrc: ["'self'"],
      formAction: ["'self'", 'https://www.facebook.com'],
      frameAncestors: ["'none'"]
    }
  }
}));
app.use(express.json({ limit: '10kb' }));
app.use(session({
  name: 'pal.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: isProd, maxAge: 60 * 60 * 1000 }
}));
app.use('/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false }));
app.use(express.static(path.join(__dirname, 'public')));

// Step 1: redirect to official Meta OAuth dialog with random state (CSRF protection)
app.get('/auth/facebook', (req, res) => {
  const state = crypto.randomBytes(24).toString('hex');
  req.session.oauthState = state;
  const params = new URLSearchParams({
    client_id: FB_APP_ID,
    redirect_uri: REDIRECT_URI,
    state,
    scope: SCOPE,
    response_type: 'code'
  });
  req.session.save(() => res.redirect(`https://www.facebook.com/${GRAPH}/dialog/oauth?${params}`));
});

function safeEqual(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Step 2: validate state, exchange code server-side, fetch profile, DISCARD token
app.get('/auth/facebook/callback', async (req, res) => {
  const expected = req.session.oauthState;
  delete req.session.oauthState;
  if (req.query.error) return res.redirect('/#login');
  if (!expected || !safeEqual(req.query.state, expected) || typeof req.query.code !== 'string') {
    return res.status(400).send('Invalid OAuth state. Please try again.');
  }
  try {
    const tokenUrl = `https://graph.facebook.com/${GRAPH}/oauth/access_token?` + new URLSearchParams({
      client_id: FB_APP_ID, client_secret: FB_APP_SECRET,
      redirect_uri: REDIRECT_URI, code: req.query.code
    });
    const tokenRes = await fetch(tokenUrl);
    if (!tokenRes.ok) throw new Error('token exchange failed');
    let { access_token } = await tokenRes.json(); // never logged, never stored

    const meUrl = `https://graph.facebook.com/${GRAPH}/me?` + new URLSearchParams({
      fields: 'id,name,email,picture.width(200).height(200)', access_token
    });
    const meRes = await fetch(meUrl);
    access_token = null; // discard immediately
    if (!meRes.ok) throw new Error('profile fetch failed');
    const me = await meRes.json();

    req.session.regenerate((err) => {
      if (err) return res.status(500).send('Session error.');
      req.session.user = {
        id: String(me.id),
        name: String(me.name || ''),
        email: me.email ? String(me.email) : null,
        picture: me.picture && me.picture.data ? String(me.picture.data.url) : null
      };
      req.session.csrf = crypto.randomBytes(24).toString('hex');
      req.session.save(() => res.redirect('/#login'));
    });
  } catch (e) {
    console.error('OAuth error:', e.message); // message only, no secrets/tokens
    res.status(502).send('Login failed. Please try again later.');
  }
});

app.get('/api/me', (req, res) => {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  res.set('Cache-Control', 'no-store');
  res.json({ authenticated: !!req.session.user, user: req.session.user || null, csrf: req.session.csrf });
});

app.post('/auth/logout', (req, res) => {
  if (!safeEqual(req.get('x-csrf-token'), req.session.csrf)) return res.status(403).json({ error: 'Bad CSRF token' });
  req.session.destroy(() => {
    res.clearCookie('pal.sid');
    res.json({ ok: true });
  });
});

app.listen(PORT, () => console.log(`RAIHAN PHISHING AWARENESS LAB running on ${BASE_URL} (port ${PORT})`));
