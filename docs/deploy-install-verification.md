# Deploy install verification

Install tables come from `backend/migrations/001_install_verification.sql`. On boot, `applySqlMigrations` runs each file once inside a transaction and records the filename in `schema_migrations`, then seeds the first-party catalog. That is the Railway migrate path: the API process still applies SQL before it listens, and a failure stops the process. Referral tables remain in the existing boot SQL so login and referrals keep working if this migration is late.

This pull request stacks on `cursor/security-audit-login-f98a`. Merge that branch first (Firebase login), then merge this one. Do not retarget this PR onto `main` while login still lives only on the security-audit branch.

Railway already runs one Node service. No new service is required. Do not put these values in git or in any `VITE_` variable.

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Existing Postgres URL. Install tables are created in this database. The admin service uses the same URL. Do not drop shared tables. |
| `INSTALL_TOKEN_TTL_SECONDS` | Optional verification token lifetime in seconds. When unset, `VERIFICATION_TOKEN_EXPIRY_MINUTES` (default 1440) is used. Clamped to 60–86400. Per-app `tokenTtlSeconds` still overrides. |
| `INSTALL_IP_HASH_SALT` | Secret salt for IP velocity hashes. Set a long random value in production. |
| `INSTALL_REQUIRE_ATTESTATION` | Set to `true` to require Play Integrity / App Attest on every verify. The v1 stubs then fail closed and no install reward is granted. Leave unset for the default, where attestation is optional and client ids are fraud signals only. |
| `APP_WEBHOOK_SECRET` | Unchanged. Still gates referral qualify/register webhooks, not install verify. |
| `FIREBASE_*` | Unchanged. Login stays on Firebase Admin. |

Generate a salt outside the repo, for example `openssl rand -hex 32`.

Operator allowlists (`ADMIN_GOOGLE_SUBS` and the admin host variables) are configured on `Koliath-Technology/website-admin`, not on this service. After a person has signed in, their subject is still `global_users.google_sub` in the shared database.

## Admin console

The admin UI and `/api/admin/*` live on Railway service `website-admin-deploy` at `https://admin.koliath.in/`. This website does not mount those routes and does not treat `Host: admin.koliath.in` as special.

| URL | Behavior on this service |
| --- | --- |
| `https://admin.koliath.in/` | Not this service. DNS points at website-admin. |
| `https://koliath.in/admin` | 302 to `https://admin.koliath.in/`. No admin SPA and no `/assets/admin` chunk. |
| `/api/admin/*` | 404. |

Public session cookies stay `koliath_session` and `koliath_csrf` (`SameSite=Lax`, no `Domain`).

## Catalog credentials

Boot seeds Sapient, Adverts, Adverts Rewards, Advert Cohort, and Diabetic Buddy as Android apps with stable slugs. They have no owner. This API refuses credential minting for an app the caller does not own, including those catalog rows. Mint the secret from `https://admin.koliath.in/`. Store it in the app's backend (Railway variables on that app's service, not this website). A developer can still register their own app and rotate its secret at `/developer`.

The website only needs the public store URLs (`VITE_DOWNLOAD_*`), which are not secrets. Leave them empty to keep the contact fallback.

## Checks after deploy

- `GET /health` still returns `{"ok":true,"service":"koliath-rewards"}`.
- Signed-out `POST /api/v1/installations/start` returns 401.
- `POST /api/v1/installations/verify` without a secret returns 401 and does not write `points_ledger`.
- `/earn` still loads Google login and referral points.
- A download click while signed in returns `pointsAwarded: 0`.

Local tests and CI both run:

```bash
# Postgres must be reachable. Override with TEST_DATABASE_URL.
npm test --prefix backend
```

The default test URL is `postgres://postgres:postgres@localhost:5432/koliath_install_test`. Create that database before running tests. Tests truncate that database. Do not point `TEST_DATABASE_URL` at production.

GitHub Actions (`.github/workflows/backend-tests.yml`) runs the same command, including `verify.integration.test.ts`, against a Postgres 16 service container on every push and pull request.
