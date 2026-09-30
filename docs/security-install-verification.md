# Install verification security

## What this does not prove

A granted reward means the presented token was unused, unexpired, bound to that user and app, and the fraud rules allowed the credit. It does not prove a human installed the app, that the device is genuine, or that Play Integrity / App Attest succeeded.

`installation_id` and `device_key` are spoofable. Treat repeats and multi-account links as fraud signals only. They are not device proof.

Play Integrity and App Attest are stubs that always return false. v1 leaves attestation optional. Set `INSTALL_REQUIRE_ATTESTATION=true` or the per-app admin flag `requireAttestation` to require it. Required attestation with a missing token, or with a token the stub rejects, denies the reward (`attestation_required`) and does not write the ledger. Do not describe a skipped check as a passed integrity verdict.

Developer registration cannot choose `pointsAwarded` or `requireAttestation`. New apps are `pending` with zero points until the admin console (`https://admin.koliath.in/`) approves them. That closes the path where any Google user registers an app and pays themselves.

## Secrets

- App secrets are random `kol_<prefix>.<entropy>` values. The database stores SHA-256 and the prefix. The plaintext is returned only by create/rotate.
- Verification tokens are random `kvt_…` values. The database stores SHA-256 and a 16-character prefix. The plaintext is returned only by the start call.
- Comparison uses SHA-256 digests and `timingSafeEqual`.
- Logs pass through `redact`, which strips Postgres URLs, PEM keys, JWTs, `kol_…` secrets, and `kvt_…` tokens.
- `APP_WEBHOOK_SECRET`, app secrets, and `INSTALL_IP_HASH_SALT` must not be `VITE_` variables. The React bundle never receives them.
- The mobile example posts the verification token to the developer's backend. That backend holds the app secret.

The verification token is a single-use capability for one user and app. It is placed on the store referrer so the app can read it. It is not an API secret. Losing it before expiry lets someone confirm that user's install, which credits that user, and then the token is dead.

## Replay and duplicates

Verify locks the verification row with `SELECT … FOR UPDATE`. A second request for a token already in `REWARD_GRANTED` returns `already_granted` and writes a low-severity `token_replay` fraud event. It does not move the account to `BLOCKED`.

The ledger insert and the status update commit together. Partial unique indexes guarantee:

- one `install_reward` per user per app
- one `install_reward` per app plus `installation_id`
- one `install_reward` per verification row

A unique violation rolls back to a savepoint, marks that verification rejected, and returns `already_granted` with zero points. Concurrent requests therefore cannot double-credit.

## Fraud

Signals include a repeated device/app reward, an `installation_id` already linked to another account, many accounts on one app-generated device, download velocity, and verify-failure velocity. Decisions are pure functions of those signals.

`BLOCKED` is applied only for the high-severity many-account threshold (default 8). Low and medium signals can set `REVIEW` or deny the reward. They cannot set `BLOCKED` even if a rule asks for it. `raiseRisk` never lowers `BLOCKED` or `REVIEW` on its own. Admins change status explicitly.

`BLOCKED` and `suspended` reject new rewards. Google login still works.

## Browser start

`POST /api/v1/installations/start` uses the existing `requireAuth` middleware: Firebase session cookie plus CSRF header, or a Firebase bearer token. It does not accept the app secret, and the verify route does not accept the browser session.

## Admin

This website does not serve the admin console. `/api/admin/*` is not mounted and returns 404. `GET /admin` redirects to `https://admin.koliath.in/` (`Koliath-Technology/website-admin`). Public session cookies stay `koliath_session` and `koliath_csrf`. Approvals, risk changes, and catalog-app secrets live on that service, which uses the same Postgres and Firebase project. Do not drop those tables from this repo's migrations.

## Privacy minimisation

IP addresses and user agents are stored as salted hashes for velocity checks. Device rows store the app-generated key and platform only. See [install-verification.md](install-verification.md).
