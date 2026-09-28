# Koliath website + rewards platform (`koliath.in`)

Company site and global referral hub for Sapient, Adverts, Advert Cohort,
Adverts Rewards, and Diabetic Buddy.

## Stack

- **Frontend:** React + Vite + Tailwind (`frontend/`)
- **Backend:** Express + Postgres (`backend/`)
- **Auth:** Google Sign-In (ID token verified server-side)

## Routes

| Path | Purpose |
|------|---------|
| `/` | Company homepage and app hub |
| `/products` | App briefs, download CTAs, list-your-app |
| `/earn` | Referral points, Google login, gift catalog |
| `/contact` | Contact form and list/host-your-app CTA |
| `/service`, `/about`, `/careers`, `/blog` | Studio pages |

`/reward`, `/rewards`, and `/referrals` redirect to `/earn` and keep `?ref=` query strings.

Local commands and the production SPA fallback are in [LOCAL_TESTING.md](LOCAL_TESTING.md).

## Referral rules (server-enforced)

| App | Points confirm when |
|-----|---------------------|
| Sapient | Referred user is active for one full day (`day_active`) |
| Adverts | Successful purchase (`purchase` — webhook ready, app wiring later) |
| Diabetic Buddy | Signup / first onboarding (`signup`) |
| Adverts Rewards | First verified watch day |
| Advert Cohort | Profile + rate card activity |

Apps post qualification events to:

```http
POST /api/referrals/qualify
Header: X-Koliath-Webhook-Secret: <APP_WEBHOOK_SECRET>
Body: { referrerCode, referredEmail, deviceId, sourceApp, event }
```

## Local setup

Step-by-step commands and the URLs to click are in [LOCAL_TESTING.md](LOCAL_TESTING.md). From the repo root: `npm install`, then `npm run dev` (site) and `npm run dev:backend` (API).

### 1. Postgres

```bash
# DATABASE_URL default: postgres://postgres:postgres@localhost:5433/mydb
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, APP_WEBHOOK_SECRET, DATABASE_URL
npm install
npm run dev
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env
# set VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID
npm install
npm run dev
```

### Firebase console

Enable Google sign-in, add a web app, and create a service account as described in [SECURITY_AUDIT.md](SECURITY_AUDIT.md). Authorized domains include `localhost`, `koliath.in`, and `www.koliath.in`. Do not commit the service-account JSON.

## Production (koliath.in)

Deploy one Railway service. Steps, env vars, and the Cloudflare DNS note are in [RAILWAY.md](RAILWAY.md).

`npm run build` then `npm start`. Express serves `frontend/dist` and falls back to `index.html` for `/earn`, `/contact`, `/products`, and the other client routes. Leave `VITE_API_BASE` empty so the browser calls same-origin `/api`. Production exits if `DATABASE_URL` is missing.

## Security practices included

- Firebase ID tokens from Google sign-in verified with Firebase Admin `verifyIdToken`
- Browser session is an httpOnly cookie; mobile apps keep `Authorization: Bearer`
- Helmet (including CSP), CORS allowlist, JSON body size limit, rate limits
- Redeem / stats require authenticated ownership of the global account
- Qualification and register endpoints require the webhook secret unless `NODE_ENV=development`
- Env-based DB URL (no hardcoded production credentials)
- Parameterized SQL only

See [SECURITY_AUDIT.md](SECURITY_AUDIT.md) for the review and what was changed.

## Install verification

Download clicks do not award points. A signed-in download mints a one-time token; the app's backend confirms it with `POST /api/v1/installations/verify`. Rewards go through `points_ledger` and also show up on `/api/me`. Google login and the referral qualify webhooks are unchanged.

Configure `ADMIN_GOOGLE_SUBS`, `INSTALL_TOKEN_TTL_SECONDS`, and `INSTALL_IP_HASH_SALT` as described in [docs/deploy-install-verification.md](docs/deploy-install-verification.md). API shape, privacy, and the server-side SDK example are in [docs/install-verification.md](docs/install-verification.md), [docs/developer-api.md](docs/developer-api.md), and [docs/sdk-example.md](docs/sdk-example.md).

```bash
npm test --prefix backend
```

## Linking mobile apps

After Google sign-in on `/login` or `/earn`, apps can call with the user’s **Firebase** ID token (the same Google account, verified by Firebase Admin):

```http
POST /api/me/link-app
Authorization: Bearer <firebase-id-token>
{ "sourceApp": "sapient", "appUid": "<app-uid>", "referralCode": "SP-XXXX" }
```

Using the **same Google email** across apps is what unifies the global ledger.
