# Deploy koliath.in on Railway

One Node service. It builds the Vite app, then the Express API listens on `PORT` and serves `frontend/dist`. Client routes such as `/earn`, `/contact`, and `/products` return `index.html`. `/api/*`, `/health`, `/api/health`, and `POST /careers` stay on that same origin, so leave `VITE_API_BASE` empty.

Do not commit secrets. Production boots only when `DATABASE_URL` is set. Login and protected routes fail closed (HTTP 503) when `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, or `FIREBASE_PRIVATE_KEY` is missing. An empty `APP_WEBHOOK_SECRET` is rejected unless `NODE_ENV` is exactly `development` (unset does not open webhooks). The browser session is an httpOnly cookie; mobile apps still send `Authorization: Bearer` with a Firebase ID token. Login is at `/login`. Console steps are in [SECURITY_AUDIT.md](SECURITY_AUDIT.md).

## 1. Connect the repo

1. In Railway, create a project and choose **Deploy from GitHub repo**.
2. Select `Koliath-Technology/website`.
3. The live **website** service deploys `cursor/security-audit-login-f98a`. Do not point this service at `solver/shipping-bar-fixes` if that branch fails Railpack. The admin console is not this repo.
4. Railway reads [`railway.toml`](railway.toml) and [`nixpacks.toml`](nixpacks.toml). The build uses **Node 22** (`NIXPACKS_NODE_VERSION=22`, Nix package `nodejs_22`, and root `engines.node`). Vite 7 does not build on Node 18. Install runs from the root `package.json` (`postinstall` installs frontend and backend, including Vite’s dev dependencies), then `npm run build`, then `npm start`.

Add the **Postgres** plugin to the same project and attach its `DATABASE_URL` to this service. Do not paste a guessed connection string.

## 2. Variables

Set these on the Railway service before the first deploy. Railway exposes them to both the image build and the running process. Vite reads `VITE_*` only at build time.

| Variable | Value |
|----------|--------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | From the Railway Postgres plugin (`${{Postgres.DATABASE_URL}}`). The API accepts Railway’s public proxy certificate unless `DATABASE_SSL_REJECT_UNAUTHORIZED=true`. The process still exits if this variable is missing. Do not copy the URL into git or a `VITE_` variable. |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | Optional. Leave unset or `false` for Railway’s public proxy. Set `true` only when Node trusts the database certificate. |
| `FIREBASE_PROJECT_ID` | From the Firebase service-account JSON (`project_id`). Runtime only. |
| `FIREBASE_CLIENT_EMAIL` | From that JSON (`client_email`). Runtime only. |
| `FIREBASE_PRIVATE_KEY` | From that JSON (`private_key`), with `\n` escapes. Runtime only. Not a `VITE_` variable. |
| `VITE_FIREBASE_API_KEY` | Public web `apiKey`. Required at **build** time for the Google button. |
| `VITE_FIREBASE_AUTH_DOMAIN` | Public web `authDomain`. Build time. |
| `VITE_FIREBASE_PROJECT_ID` | Public web `projectId`. Same project as `FIREBASE_PROJECT_ID`. Build time. |
| `VITE_FIREBASE_APP_ID` | Public web `appId`. Build time. |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Optional public web field. Build time. |
| `VITE_FIREBASE_STORAGE_BUCKET` | Optional public web field. Build time. |
| `APP_WEBHOOK_SECRET` | A long random string you generate and store in Railway. Not in git. |
| `CORS_ORIGINS` | `https://koliath.in,https://www.koliath.in`. |
| `VITE_API_BASE` | Leave unset. The browser calls same-origin `/api`. |
| `VITE_CONTACT_EMAIL` | Optional. Defaults to `hello@koliath.in`. |
| `INSTALL_TOKEN_TTL_SECONDS` | Optional override for the download verification token, in seconds. When unset, `VERIFICATION_TOKEN_EXPIRY_MINUTES` is used (default 1440). Clamped to 60–86400. |
| `FIRST_LOGIN_REWARD_COINS` | Coins on the first Google account activation. Default 10. |
| `APP_DOWNLOAD_REWARD_COINS` | Published download reward. Default 25. The ledger pays each app's `points_awarded`. |
| `REFERRAL_REWARD_COINS` | Coins for one qualifying signup referral. Default 20. |
| `GIFT_CARD_COST_COINS` | Coins to redeem the gift card. Default 200. |
| `GIFT_CARD_VALUE_INR` | Gift card face value. Default 100. |
| `REFERRALS_REQUIRED_FOR_REDEMPTION` | Valid signup referrals required. Default 3. |
| `VERIFICATION_TOKEN_EXPIRY_MINUTES` | Token life when `INSTALL_TOKEN_TTL_SECONDS` is unset. Default 1440. |
| `INSTALL_IP_HASH_SALT` | Set a long random string in production. Used only to hash IPs for install velocity checks. Not a `VITE_` variable. |
| `INSTALL_REQUIRE_ATTESTATION` | Optional. `true` requires attestation on every verify. The v1 stubs fail closed, so leave unset until a real Play Integrity or App Attest verifier is configured. |

Install verification SQL in `backend/migrations/` is applied once on boot and recorded in `schema_migrations`. Download clicks do not award points. New developer apps stay pending with zero points until [admin.koliath.in](https://admin.koliath.in/) approves them. Details are in [docs/deploy-install-verification.md](docs/deploy-install-verification.md). Do not drop shared tables; the admin service uses the same database.

`PORT` is set by Railway. Do not hardcode it.

Copy names from [`backend/.env.example`](backend/.env.example) and [`frontend/.env.example`](frontend/.env.example). Those files contain no live credentials.

Google Cloud authorized JavaScript origins for this site are `https://koliath.in` and `https://www.koliath.in`. `admin.koliath.in` belongs on the admin service (`Koliath-Technology/website-admin`), which shares this Firebase project. Do not add that hostname as a custom domain on this Railway service.

## 3. Custom domain and DNS

Public DNS for koliath.in currently has **A records at `127.0.0.1` on Cloudflare**. That does not point at Railway. Leave those records until the service is healthy, then:

1. On this **website** service, add custom domains `koliath.in` and `www.koliath.in` only. `admin.koliath.in` is the Railway service `website-admin-deploy` from `Koliath-Technology/website-admin`.
2. Replace the Cloudflare `127.0.0.1` A records with the target Railway shows (usually a CNAME to `*.up.railway.app`, or the A/AAAA records Railway prints for the apex). Point `admin` at the admin service, not this one.
3. Use Cloudflare SSL mode **Full**. Railway terminates HTTPS on its side.

The admin console is **https://admin.koliath.in/** . This process does not serve it. `GET https://koliath.in/admin` is a 302 to that URL. `/api/admin/*` is not mounted (404). A developer can still manage an app they own at `/developer`. Catalog apps with no owner are managed on the admin service. Sign-in on this site is still a verified Google Firebase token.

Until DNS changes, the `*.up.railway.app` URL is the way to open the deploy.

## 4. What “healthy” looks like

- `GET /health` and `GET /api/health` return `{"ok":true,"service":"koliath-rewards"}`.
- `GET /`, `/earn`, `/contact`, and `/products` on `koliath.in` return the SPA HTML, including on refresh.
- `GET https://koliath.in/admin` is a 302 to `https://admin.koliath.in/`. This service does not return the admin SPA.
- `POST /api/contact` returns 202.
- `/login` is in the navbar and the app hub. **Continue with Google** works only after a rebuild that included the public `VITE_FIREBASE_*` web config, and only when `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` are set at runtime. The browser does not store that ID token in `localStorage`.

A production process with no `DATABASE_URL` exits at startup. That is intentional.
