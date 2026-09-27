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
# set GOOGLE_CLIENT_ID, APP_WEBHOOK_SECRET, DATABASE_URL
npm install
npm run dev
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env
# set VITE_GOOGLE_CLIENT_ID to the same OAuth Web client ID
npm install
npm run dev
```

### Google Cloud console

1. Create an OAuth 2.0 **Web** client.
2. Authorized JavaScript origins: `http://localhost:5173`, `https://koliath.in`
3. Authorized redirect URIs: same origins (GIS popup flow).

## Production (koliath.in)

Deploy one Railway service. Steps, env vars, and the Cloudflare DNS note are in [RAILWAY.md](RAILWAY.md).

`npm run build` then `npm start`. Express serves `frontend/dist` and falls back to `index.html` for `/earn`, `/contact`, `/products`, and the other client routes. Leave `VITE_API_BASE` empty so the browser calls same-origin `/api`. Production exits if `DATABASE_URL` is missing.

## Security practices included

- Google ID tokens verified with `google-auth-library` (audience-bound)
- Helmet, CORS allowlist, JSON body size limit, rate limits
- Redeem / stats require authenticated ownership of the global account
- Qualification and register endpoints require webhook secret in production
- Env-based DB URL (no hardcoded production credentials)
- Parameterized SQL only

## Linking mobile apps

After Google sign-in on `/earn`, apps can call (with the user’s Google ID token):

```http
POST /api/me/link-app
Authorization: Bearer <google-id-token>
{ "sourceApp": "sapient", "appUid": "<firebase-uid>", "referralCode": "SP-XXXX" }
```

Using the **same Google email** across apps is what unifies the global ledger.
