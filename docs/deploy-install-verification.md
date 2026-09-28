# Deploy install verification

Install tables come from `backend/migrations/001_install_verification.sql`. On boot, `applySqlMigrations` runs each file once inside a transaction and records the filename in `schema_migrations`, then seeds the first-party catalog. That is the Railway migrate path: the API process still applies SQL before it listens, and a failure stops the process. Referral tables remain in the existing boot SQL so login and referrals keep working if this migration is late.

This pull request stacks on `cursor/security-audit-login-f98a`. Merge that branch first (Firebase login), then merge this one. Do not retarget this PR onto `main` while login still lives only on the security-audit branch.

Railway already runs one Node service. No new service is required. Do not put these values in git or in any `VITE_` variable.

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Existing Postgres URL. Install tables are created in this database. |
| `ADMIN_GOOGLE_SUBS` | Comma-separated Google provider subjects (`global_users.google_sub`) or Firebase Auth uids allowed to call `/api/admin/verification`. Either form matches. Empty means nobody. |
| `ADMIN_ORIGIN` | Canonical admin origin. Set `https://admin.koliath.in`. Public marketing origins are ignored. |
| `ADMIN_CORS_ORIGINS` | Optional. Admin API and admin-host CORS allowlist. Defaults to `ADMIN_ORIGIN`. `https://koliath.in` and `https://www.koliath.in` are stripped. |
| `ADMIN_HOSTS` | Optional. Leave unset so production admin APIs accept only `admin.koliath.in`. |
| `INSTALL_TOKEN_TTL_SECONDS` | Verification token lifetime. Default 1800. Clamped to 60–86400. |
| `INSTALL_IP_HASH_SALT` | Secret salt for IP velocity hashes. Set a long random value in production. |
| `INSTALL_REQUIRE_ATTESTATION` | Set to `true` to require Play Integrity / App Attest on every verify. The v1 stubs then fail closed and no install reward is granted. Leave unset for the default, where attestation is optional and client ids are fraud signals only. |
| `APP_WEBHOOK_SECRET` | Unchanged. Still gates referral qualify/register webhooks, not install verify. |
| `FIREBASE_*` | Unchanged. Login stays on Firebase Admin. |

Generate a salt outside the repo, for example `openssl rand -hex 32`.

Find a Google subject after the person has signed in:

```sql
SELECT google_sub, email FROM global_users WHERE email = 'person@example.com';
```

Use `google_sub` or the Firebase Auth uid, not the email, in `ADMIN_GOOGLE_SUBS`.

## Admin host

One Railway service serves both hostnames. Add a custom domain `admin.koliath.in` on that service and DNS (CNAME) to the same Railway target as `koliath.in`.

| URL | Behavior |
| --- | --- |
| `https://admin.koliath.in/` | Canonical admin console. Sign in with Google here. |
| `https://koliath.in/admin` | 404. The marketing host does not serve the admin SPA or its chunk. |
| `https://admin.koliath.in/admin` | Redirects to `https://admin.koliath.in/`. |

`/api/admin/*` returns 403 unless the `Host` is `admin.koliath.in` (localhost is added only when `NODE_ENV` is not production). Responses on that host, and all admin API responses, do not allow the `https://koliath.in` origin in CORS. The admin session cookie is `koliath_admin_session` (`__Host-koliath_admin_session` in production): host-only, `SameSite=Strict`, no `Domain`, so it is not sent to the marketing site. The marketing site keeps `koliath_session`.

Also allow `https://admin.koliath.in` as a Google authorized JavaScript origin and a Firebase authorized domain.

## Catalog credentials

Boot seeds Sapient, Adverts, Adverts Rewards, Advert Cohort, and Diabetic Buddy as Android apps with stable slugs. They have no owner until you attach one. An allowlisted admin signs in on `https://admin.koliath.in/` and calls `POST /api/developer/apps/:appId/credentials` with that host (or opens `/developer` there). The same call with `Host: koliath.in` is refused. Store the returned secret in the app's backend (Railway variables on that app's service, not this website).

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
