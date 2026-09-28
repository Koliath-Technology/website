# Deploy install verification

The schema is applied by the API process on boot (`CREATE TABLE IF NOT EXISTS` and `ALTER TABLE … ADD COLUMN IF NOT EXISTS` in `backend/src/installations/schema.ts`). There is no separate migration job. A failure to create tables stops the process.

Railway already runs one Node service. No new service is required. Do not put these values in git or in any `VITE_` variable.

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Existing Postgres URL. Install tables are created in this database. |
| `ADMIN_GOOGLE_SUBS` | Comma-separated `global_users.google_sub` values allowed to call `/api/admin/verification`. Empty means nobody. |
| `INSTALL_TOKEN_TTL_SECONDS` | Verification token lifetime. Default 1800. Clamped to 60–86400. |
| `INSTALL_IP_HASH_SALT` | Secret salt for IP velocity hashes. Set a long random value in production. |
| `APP_WEBHOOK_SECRET` | Unchanged. Still gates referral qualify/register webhooks, not install verify. |
| `FIREBASE_*` | Unchanged. Login stays on Firebase Admin. |

Generate a salt outside the repo, for example `openssl rand -hex 32`.

Find a Google subject after the person has signed in:

```sql
SELECT google_sub, email FROM global_users WHERE email = 'person@example.com';
```

Use `google_sub`, not the email, in `ADMIN_GOOGLE_SUBS`.

## Catalog credentials

Boot seeds Sapient, Adverts, Adverts Rewards, Advert Cohort, and Diabetic Buddy as Android apps with stable slugs. They have no owner until you attach one. An allowlisted admin signs in, opens `/developer` or calls `POST /api/developer/apps/:appId/credentials`, and stores the returned secret in the app's backend (Railway variables on that app's service, not this website).

The website only needs the public store URLs (`VITE_DOWNLOAD_*`), which are not secrets. Leave them empty to keep the contact fallback.

## Checks after deploy

- `GET /health` still returns `{"ok":true,"service":"koliath-rewards"}`.
- Signed-out `POST /api/v1/installations/start` returns 401.
- `POST /api/v1/installations/verify` without a secret returns 401 and does not write `points_ledger`.
- `/earn` still loads Google login and referral points.
- A download click while signed in returns `pointsAwarded: 0`.

Local tests:

```bash
# Postgres must be reachable. Override with TEST_DATABASE_URL.
npm test --prefix backend
```

The default test URL is `postgres://postgres:postgres@localhost:5432/koliath_install_test`. Create that database before running tests. Tests truncate that database. Do not point `TEST_DATABASE_URL` at production.
