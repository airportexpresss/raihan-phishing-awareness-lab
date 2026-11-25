# RAIHAN PHISHING AWARENESS LAB

Educational web app: phishing simulation (no data collected), quiz, report, and a real
"Continue with Facebook" login via Meta's official OAuth. Passwords and access tokens are never collected or stored.

## Folder structure
```
raihan-phishing-awareness-lab/
├── server.js          # Express backend + OAuth
├── package.json
├── .env.example
├── .gitignore
├── README.md
└── public/
    ├── index.html
    ├── css/style.css
    └── js/app.js
```

## 1. Installation
Requires Node.js 18+.
```
npm install
cp .env.example .env     # then edit .env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # paste into SESSION_SECRET
npm start
```
Open http://localhost:3000

## 2. Meta Developer App configuration
1. Go to https://developers.facebook.com/apps and click **Create App**.
2. Choose the use case **Authenticate and request data from users with Facebook Login**.
3. App settings > **Basic**: copy **App ID** and **App Secret** into `.env` (`FB_APP_ID`, `FB_APP_SECRET`).
4. Add **Facebook Login** product > **Settings**:
   - Valid OAuth Redirect URIs: `http://localhost:3000/auth/facebook/callback`
   - Client OAuth Login: ON, Web OAuth Login: ON
   - Enforce HTTPS: ON for production.
5. App settings > Basic: add **Privacy Policy URL** (your deployed `/#privacy`) and App Domains.
6. Permissions: `public_profile` works by default; `email` is available by default for Facebook Login in most cases.
7. While in **Development mode**, only users with a role in the app (Roles > Roles / Testers) can log in. Add testers there.
8. Before public use, switch the app to **Live** (requires privacy policy URL and data deletion instructions).

## 3. Localhost testing guide
1. `.env` has `BASE_URL=http://localhost:3000`.
2. Log in with a Facebook account that is an admin/developer/tester of your app.
3. Click through: Dashboard > Simulation (click all 6 flags) > Quiz > Secure Login (tick consent, press button) > Report.
4. Check that: profile shows after login; Logout clears it; opening `/auth/facebook/callback?code=x&state=bad` returns "Invalid OAuth state" (CSRF test).
5. Facebook may refuse plain `http` redirects for non-localhost hosts; localhost is allowed in development.

## 4. Deployment guide (Render / Railway / VPS)
1. Push to a private Git repo (`.env` is git-ignored).
2. Create a Node web service: build `npm install`, start `npm start`.
3. Set environment variables in the host dashboard:
   `FB_APP_ID`, `FB_APP_SECRET`, `SESSION_SECRET`, `NODE_ENV=production`, `BASE_URL=https://your-domain.com`
4. Add `https://your-domain.com/auth/facebook/callback` to Valid OAuth Redirect URIs in Meta, and the domain to App Domains.
5. Serve over HTTPS only (hosts above do this; on a VPS use Nginx + Let's Encrypt and forward `X-Forwarded-Proto`).
6. Production note: the default in-memory session store is not for multiple instances. Use `connect-redis` or similar if you scale.
7. Switch the Meta app to Live mode.

## Security notes
- OAuth `state` is random per login, checked with timing-safe compare, and single-use (CSRF protection).
- The access token exists only in server memory for one request and is never logged or stored.
- Session cookie: HttpOnly, SameSite=Lax, Secure in production; session regenerated on login.
- Helmet CSP, rate limiting on `/auth`, CSRF header required for logout.
- The simulation page has disabled, unbranded inputs and sends nothing anywhere.
- Only `public_profile` and `email` are requested.
