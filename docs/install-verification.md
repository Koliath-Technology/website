# Install verification

Koliath can record an authenticated download and later accept a confirmation from the app's own backend. Points are credited only inside that confirmation, through an append-only `points_ledger`. A download click never awards points.

This is a confidence layer. It does not prove that a human installed an app.

## Identity

The account is `global_users`, keyed by `google_sub` from the existing Firebase Google login. Email is not the primary key. Install rewards use the numeric `global_users.id` that belongs to that subject.

`account_status` is `active` or `suspended`. `risk_status` is `NORMAL`, `REVIEW`, or `BLOCKED`. `created_at` already existed. Login, session cookies, CSRF, `/api/auth/firebase`, and `/api/me` are unchanged. `BLOCKED` and `suspended` stop new install rewards. They do not remove the Google session.

## Flow

1. A signed-in browser calls `POST /api/v1/installations/start` with an app slug or `app_id`.
2. The server writes `DOWNLOAD_STARTED`, then `PENDING_VERIFICATION`, and returns a random `kvt_…` token once. Only `sha256(token)` and a lookup prefix are stored.
3. The website attaches that token to the store URL (Play Install Referrer when the host is `play.google.com`). The page does not add points to local state.
4. The mobile app reads the token and its own `installation_id`. It sends them to the developer's backend.
5. The developer's backend calls `POST /api/v1/installations/verify` with the app secret.
6. In one transaction the server checks the credential, token, expiry, app, and fraud rules, then inserts `points_ledger` and sets `REWARD_GRANTED`.

States: `DOWNLOAD_STARTED` → `PENDING_VERIFICATION` → `VERIFIED` → `REWARD_GRANTED`, or `REJECTED`, `EXPIRED`, or `SUSPICIOUS`.

## Data

| Table | Role |
| --- | --- |
| `apps` | Package/bundle id, platform (`android` or `ios`), points, verification config |
| `app_credentials` | Secret hash + prefix. Plaintext exists only in the generate/rotate response |
| `installation_verifications` | Token hash, user, app, session id, expiry, status |
| `devices` | App-generated `device_key` and platform. Not a hardware id |
| `user_devices` | Which accounts have presented that device key |
| `app_installations` | App + `installation_id` + device + first linked user |
| `points_ledger` | Immutable install rewards |
| `fraud_events` | Rule id, severity, and action |
| `verification_attempts` | Outcome counts for velocity limits |

Catalog slugs seeded for the website: `sapient`, `adverts`, `adverts-rewards`, `advert-cohort`, `diabetic-buddy`. Those rows have no owner. Only an allowlisted admin (Google provider subject or Firebase Auth uid in `ADMIN_GOOGLE_SUBS`) can mint their API secrets, and only from the admin host (`https://admin.koliath.in/`).

Referral tables (`referral_codes`, `referral_events`, `referral_balances`, qualify webhooks) are separate. Install points are added into the `/api/me` available balance and can be spent by the existing redemption path. The referral qualification rules are not changed.

## Devices and privacy

Collected only to relate a user, an app install, and a fraud signal:

- `installation_id`: UUID-style id created by the app and stored in app-private storage
- optional `device_key`: a second app-generated id, also stored by the app, so the same install can be recognized across Koliath accounts without a hardware id
- `platform`, and optional `os_version` / `app_version`
- SHA-256 of the client IP with `INSTALL_IP_HASH_SALT`, and SHA-256 of the user agent
- the existing Koliath user id from the Google session that minted the token

Not collected: IMEI, MAC address, serial number, or advertising id. Requests that put those values in `installation_id` or `device_key` are rejected. Attestation tokens, if a client sends them, are not stored; v1 only records that they were skipped or not accepted by the stub.

The older referral click tracker still stores a browser visitor id for referral attribution. That value is not an install-reward key and is not written to `devices`.

## v1 product scope for attestation

`installation_id` and `device_key` are chosen by the client. Anyone can send a new value. They are fraud signals (repeat device, many accounts), not proof of a genuine device or a human install.

Play Integrity and Apple App Attest / DeviceCheck are stubs in `backend/src/installations/attestation.ts`. The stub never accepts a token. Attestation is optional by default. Two switches turn it on, and both fail closed while the stub is in place:

- `INSTALL_REQUIRE_ATTESTATION=true` requires it for every app. A per-app `false` does not override this.
- An admin sets `requireAttestation: true` on one app via `POST /api/admin/verification/apps/:appId`. Developers cannot set this field.

When required and the token is missing or the stub rejects it, verify returns `reason: attestation_required`, writes a fraud event, and does not insert `points_ledger`. Turning the flag on stops rewards for that app until a real verifier replaces the stub.

## Who can award points

Self-serve registration creates `status = pending` and `points_awarded = 0`. Pending apps cannot start a paying download, and their API secret is rejected as `app_inactive`. Only an `ADMIN_GOOGLE_SUBS` admin can set `active` and a positive point value. Catalog apps (Sapient, Adverts, and the other first-party slugs) are seeded `active` with a preset value; their secrets are still admin-only because they have no owner.

## Fraud

Rules live in `backend/src/fraud/rules.ts`. A single low or medium signal can set `REVIEW` or deny that reward. `BLOCKED` is reserved for the high-severity many-account rule (default: 8 accounts on one app-generated device). Operators can set risk back from the admin API. Nothing here auto-deletes an account.

## Where to read next

- [developer-api.md](developer-api.md) — register, start, verify
- [security-install-verification.md](security-install-verification.md) — hashing, replay, uniqueness
- [deploy-install-verification.md](deploy-install-verification.md) — env vars and Railway
- [sdk-example.md](sdk-example.md) — server and Android example
