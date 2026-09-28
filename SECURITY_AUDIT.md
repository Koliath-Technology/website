# Security audit — Koliath site and rewards API

Defensive review of the company site, app hub (Earn, Contact, brochure), Express API, and Postgres access on branch `cursor/local-testing-earn-contact-ddd3`. No production secrets were printed. Nothing in this note is an attack procedure.

Reviewed: `frontend/src`, `backend/src`, `backend/.env.example`, `frontend/.env.example`, `.gitignore`, `railway.toml`, `nixpacks.toml`, `RAILWAY.md`, `LOCAL_TESTING.md`.

## Secrets

A pattern scan of the tree (private keys, cloud API keys, Google client secrets, live payment tokens, credentialed database URLs) found **no live production secrets**.

What did match, and how to treat it:

| Location | What it is | Action |
|----------|------------|--------|
| `backend/src/config.ts`, `backend/.env.example`, `README.md`, `LOCAL_TESTING.md` | Local dev URL `postgres://postgres:postgres@localhost:5433/mydb` | Placeholder only. Not a Railway credential. Do not reuse it in production. |
| `backend/scratch_db_setup.js` (removed) | Local script that set the same dev password | Deleted. It was not a production secret. |
| `VITE_*` build inputs | Public Firebase web config, contact inbox, optional download URLs, optional API origin | Confirmed. `VITE_FIREBASE_API_KEY` and the other web fields are public. Service-account JSON, `FIREBASE_PRIVATE_KEY`, `APP_WEBHOOK_SECRET`, and `DATABASE_URL` must never use a `VITE_` name. `frontend/vite.config.ts` fails the build if a `VITE_` name looks like a secret. |

**Rotation.** Nothing in git needs rotating. If a Google **client secret**, `APP_WEBHOOK_SECRET`, or a real `DATABASE_URL` was ever pasted into a `VITE_` variable, a committed `.env`, or a log, rotate that value in Google Cloud or Railway and redeploy. Do not commit the new value.

`.gitignore` now ignores `.env` and `.env.*` in every directory, keeps `**/.env.example`, and ignores `backend/dist/`, `frontend/dist/`, and `*.tsbuildinfo`. Example files contain placeholders only.

## Findings

### Critical

None. The tree does not contain a production credential, and point-awarding routes are not open when `NODE_ENV` is `production`.

### High

| Issue | Where | Status |
|-------|--------|--------|
| Linking an app account could attach the caller to a referral code that already belonged to someone else. The upsert preferred the new `global_user_id` whenever it was non-null. Stats and the dashboard also treated a matching `owner_email` as ownership even when another account already held `global_user_id`. | `backend/src/db.ts` (`linkAppAccount`, `registerReferralCode`, `userOwnsCode`, `getDashboardForUser`) | **Fixed.** An existing owner is kept. The link call returns 403 when the code is already claimed. Dashboard and stats use the same ownership rule. |
| The browser stored the Google ID token in `localStorage` (`koliath_google_id_token`) and sent it as `Authorization: Bearer`. Any script that could read storage could replay that token. | `frontend/src/lib/auth.tsx`, `frontend/src/lib/api.ts` | **Fixed.** The browser session is an httpOnly, `SameSite=Lax` cookie (`koliath_session`), `Secure` when `NODE_ENV=production`. A separate CSRF cookie is required on cookie-authenticated mutations. Legacy `localStorage` entries are deleted on load. Mobile apps still use `Authorization: Bearer` with a Firebase ID token (see README). Login is `POST /api/auth/firebase` (same handler as `/api/auth/google`); logout is `POST /api/auth/logout`. |
| Webhook routes (`/api/referrals/register`, `/event`, `/qualify`) skipped the shared secret whenever `NODE_ENV` was not `production`, including when it was unset. `qualifyReferral` could also record a confirmed referral for a code that was not in `referral_codes`. | `backend/src/auth.ts` (`requireAppWebhook`), `backend/src/db.ts` (`qualifyReferral`) | **Fixed.** An empty `APP_WEBHOOK_SECRET` is accepted only when `NODE_ENV` is exactly `development`. Qualification requires the code to already exist. |

### Medium

| Issue | Where | Status |
|-------|--------|--------|
| Webhook secret compared with `!==` (not a fixed-length compare). | `backend/src/auth.ts` | **Fixed.** `backend/src/secrets.ts` compares SHA-256 digests with `timingSafeEqual`. |
| Sign-in failures returned the underlying error text to the client, and `console.error` on request failures could print token-like or database URL text. | `backend/src/index.ts`, `backend/src/auth.ts` | **Fixed.** Clients get a generic authentication error (or “not configured” for HTTP 503). Logs go through `backend/src/redact.ts`. |
| Content-Security-Policy was disabled. | `backend/src/index.ts` | **Fixed.** Helmet sends a CSP that allows this site’s assets, Google Fonts, and Google Sign-In. `upgrade-insecure-requests` stays off so the documented local HTTP check still loads; Railway already terminates TLS. |
| Non-local Postgres uses `rejectUnauthorized: false` because Railway’s public proxy certificate is not in Node’s trust store. `pg` would also let `sslmode` in the URL override the `ssl` option. | `backend/src/db.ts`, `backend/src/pgSsl.ts` | **Partial.** `sslmode` is still stripped. Set `DATABASE_SSL_REJECT_UNAUTHORIZED=true` when the certificate is trusted. Leaving it false remains required for Railway’s public proxy and is a transport risk on that path. |
| `POST /careers` had only the global rate limit and echoed the application back. The form posted to `/api/careers`, which did not exist. | `backend/src/index.ts`, `frontend/src/components/CareersForm.tsx` | **Fixed.** Both paths share a limiter (8 / 15 min). The response no longer includes the application. LinkedIn must be an `https` URL on `linkedin.com`. |
| Contact inquiries are written in full to the process log (the stand-in inbox). | `backend/src/index.ts` `POST /api/contact` | **Accepted.** Restrict who can read those logs. Move the inbox to an email provider when one is chosen. The HTTP response does not echo the message. A dedicated limiter is already in place (20 / 15 min). |
| Download links and the diabetic deep link accepted any string, including non-http(s) URLs. `VITE_CONTACT_EMAIL` was interpolated into `mailto:` without a format check. | `frontend/src/lib/downloads.ts`, `frontend/src/lib/deepLinking.ts`, `frontend/src/components/ContactPage.tsx` | **Fixed.** Download targets must be `https` (or `http` in dev). Referral codes on the deep link are charset-checked and encoded. The public inbox must look like an email address. |
| Several routes returned a Zod error tree to the client. | `backend/src/index.ts` | **Fixed.** Invalid bodies get a generic “Invalid request”. |
| `GET /api/referrals/validate` is unauthenticated and reveals whether a code exists. | `backend/src/index.ts` | **Partial.** Limited to 40 requests / 15 min. The response is still only valid/invalid, which the Earn and product pages need. |

### Low

| Issue | Where | Status |
|-------|--------|--------|
| `backend/scratch_db_setup.js` reset a local Postgres password. | removed | **Fixed.** File deleted. |
| Compiled `backend/dist` and `.DS_Store` were tracked, so review could drift from source. | git index | **Fixed.** Untracked and ignored. Build with `npm run build`. |
| Global codes are 3 random bytes (`KL-` + 6 hex chars). | `backend/src/db.ts` `mintGlobalCode` | **Accepted.** Enough for casual sharing, short against online guessing. A longer code is a product change, not done here. |
| Referral visit tracking stores IP address and user agent. The site also loads FingerprintJS. | `backend/src/db.ts`, `frontend/src/hooks/useReferralTracker.ts` | **Accepted.** Documented privacy behavior, not changed. |
| `trust proxy` is `1`. That is correct behind one Railway proxy. A second untrusted proxy in front would make the rate-limit IP spoofable. | `backend/src/index.ts` | **Accepted.** Matches the single-service Railway layout. |

### Info

- SQL uses bound parameters. No string-built queries showed up in `backend/src`.
- CORS is an allowlist with credentials. Missing `Origin` is allowed so non-browser webhooks and same-origin tools still work. Disallowed origins get a generic 403. Admin responses use a separate allowlist (`ADMIN_ORIGIN` / `ADMIN_CORS_ORIGINS`) and reject `https://koliath.in` even if that origin is present in `CORS_ORIGINS`.
- The admin console is `https://admin.koliath.in/`. `/api/admin/*` fails closed unless `Host` is on the admin allowlist (production default: `admin.koliath.in` only). The marketing host returns 404 for `/admin` and for `/assets/admin/*`. Admin session cookies are host-only `SameSite=Strict` names (`__Host-koliath_admin_session` in production) and are not the marketing `koliath_session` cookie. `ADMIN_GOOGLE_SUBS` still matches a Google subject or a Firebase uid, and an empty list denies everyone.
- The SPA fallback serves `index.html` only for `GET`/`HEAD` routes without a file extension, and it skips `/api` and `/health`. Static files use `dotfiles: "deny"`.
- `cookie-parser` was already a dependency and is now used for the session.
- Auth responses send `Cache-Control: no-store`. Profile image URLs are kept only when they are `https` on `googleusercontent.com`.
- Dependency spot check (not a full SCA). No critical advisories. High advisories worth a follow-up, not upgraded here:
  - `axios` was a direct frontend dependency and is not imported anywhere in `frontend/src`. **Removed** so those advisories are not part of the install.
  - `firebase` on the frontend is now used for Auth only (Google provider). `firebase-admin` on the backend verifies those ID tokens. `dotenv` on the frontend is still unused.
  - `react-router-dom` 7.9.x has published high advisories. This app’s redirects use fixed paths (`RedirectPreserve` only swaps `/reward`, `/rewards`, and `/referrals` to `/earn`). Bump to a patched release in a follow-up.
  - `vite` high advisories are about the dev server (including a Windows path bypass). Production is the Express static server, not `vite dev`.
  - Backend high advisories are transitive (`path-to-regexp` via Express, `ip-address` via the rate limiter). The global limiter is in front of routes. Bump Express when a patched line is chosen.
  - Express 5, Helmet 8, `firebase-admin`, `pg` 8, and Zod 4 are the server lines. The previous `google-auth-library` check was replaced by Firebase Admin `verifyIdToken` so there is one validator. FingerprintJS is intentional tracking on referral pages.
- Login is a navbar control and an app-hub link, both to `/login`, and the Earn page still offers Google sign-in through Firebase. Without the public `VITE_FIREBASE_*` web config the page explains what is missing; it does not invent a credential.

## Login

Users can open **Login** from the desktop navbar, the mobile menu, the homepage app hub, and `/earn`. The route is `/login`.

**Continue with Google** calls Firebase Auth (`signInWithPopup` with the Google provider), then `POST /api/auth/firebase` with that Firebase ID token. The API verifies it with Firebase Admin `verifyIdToken` before setting the session cookie or serving `/api/me`, redeem, stats, or link-app. A missing or invalid token is rejected. If `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, or `FIREBASE_PRIVATE_KEY` is empty, those routes return 503 and do not create a session. In production the process logs that and keeps serving the public site. The account key stored in `global_users.google_sub` is the Google subject inside the Firebase token, not a second identifier.

The button appears only when the public web config was present at build time: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, and `VITE_FIREBASE_APP_ID`. Optional: `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_STORAGE_BUCKET`. Firebase Auth keeps its own browser persistence so a returning visitor can mint a fresh ID token. This app does not copy that token into `localStorage`; it posts it to the API, which stores it in the httpOnly cookie. Session cookies are `Secure` in production, so browser login on plain `http` with `NODE_ENV=production` will not stick. Local dev should keep `NODE_ENV=development`.

### Firebase Console and env (no project ids are stored in this repo)

1. In the Firebase console, create or select a project. Do not commit the project id; put it only in env.
2. Authentication → Sign-in method → enable **Google**.
3. Authentication → Settings → Authorized domains: `localhost` for local dev, plus `koliath.in` and `www.koliath.in` (and the Railway hostname if you test there before DNS).
4. Project settings → Your apps → add a **Web** app. Copy only the public `firebaseConfig` fields into `frontend/.env` (see `frontend/.env.example`). Rebuild the frontend after changing them. Vite inlines `VITE_*` at build time.
5. Project settings → Service accounts → Generate new private key. From that JSON, set Railway or `backend/.env` to:
   - `FIREBASE_PROJECT_ID` = `project_id`
   - `FIREBASE_CLIENT_EMAIL` = `client_email`
   - `FIREBASE_PRIVATE_KEY` = `private_key` (keep the `\n` escapes in a single env value)
6. Delete the downloaded JSON from disk. Do not commit it, and do not put those three values in any `VITE_` variable. `.gitignore` ignores `google-services.json`, `GoogleService-Info.plist`, and `*firebase-adminsdk*.json`.

Same steps for Railway: set the three Admin variables on the service (runtime), and the public `VITE_FIREBASE_*` variables before the build. Leave `VITE_API_BASE` empty.

## Operator checklist

1. Railway: `NODE_ENV=production`, plugin `DATABASE_URL`, real `APP_WEBHOOK_SECRET`, the three Firebase Admin variables, and the public `VITE_FIREBASE_*` web config at build time. Do not set `VITE_API_BASE` or any secret-like `VITE_` name.
2. `CORS_ORIGINS=https://koliath.in,https://www.koliath.in` when the site is same-origin behind Railway. The cookie is host-only.
3. Leave `DATABASE_SSL_REJECT_UNAUTHORIZED` unset on Railway’s public proxy. Set it to `true` only after the certificate verifies.
4. Keep process logs private while contact mail still lands there.
