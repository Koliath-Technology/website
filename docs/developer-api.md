# Developer API

Base URL is the Koliath origin (`https://koliath.in` in production). Browser calls use the session cookie. Verify calls use an app secret from your server.

The app secret and the webhook secret are different. Neither belongs in frontend code or in a mobile binary.

## Register an app

`POST /api/developer/apps` with the signed-in Google session (cookie + `X-CSRF-Token`, or `Authorization: Bearer` Firebase ID token).

```json
{
  "name": "Example",
  "packageId": "in.example.app",
  "platform": "android",
  "company": "Example",
  "pointsAwarded": 100
}
```

`pointsAwarded` is capped at 1000 for self-serve registration. Response includes `app.appId` and does not include a secret.

`GET /api/developer/apps` lists your apps with pending, verified, rejected, and reward totals.

`GET /api/developer/apps/:appId` returns the app, credential prefixes (never the secret), and stats.

## Credentials

`POST /api/developer/apps/:appId/credentials`

```json
{
  "appId": "app_0123abc",
  "prefix": "kol_abc123",
  "secret": "kol_abc123.one-time-secret",
  "message": "Copy this secret now..."
}
```

The secret is returned once. The database stores `sha256(secret)` and the prefix before the dot. Calling the endpoint again revokes the previous secret.

Catalog apps owned by Koliath have no developer owner. Minting their secret requires a Google subject in `ADMIN_GOOGLE_SUBS`.

Send the secret as `Authorization: Bearer <secret>` or `X-Koliath-App-Secret`.

## Start a download

`POST /api/v1/installations/start`

Auth: browser session. Not the app secret.

```json
{ "slug": "sapient", "platform": "android" }
```

`appId` may be sent instead of `slug`. Optional `installationId` must be an app-generated id, not an IMEI or MAC.

```json
{
  "success": true,
  "status": "PENDING_VERIFICATION",
  "verificationToken": "kvt_…",
  "expiresAt": "2026-09-28T12:00:00.000Z",
  "appId": "app_sapient_android",
  "sessionId": "sess_…",
  "pointsAwarded": 0,
  "pointsIfVerified": 100,
  "alreadyRewarded": false
}
```

`pointsAwarded` is always 0. `pointsIfVerified` is informational. The website must not add it to the balance.

Default token life is 30 minutes (`INSTALL_TOKEN_TTL_SECONDS`, or `verificationConfig.tokenTtlSeconds` on the app, clamped to 60–86400).

## Verify

`POST /api/v1/installations/verify`

```http
Authorization: Bearer kol_prefix.secret
Content-Type: application/json
```

```json
{
  "verification_token": "kvt_…",
  "app_id": "app_0123abc",
  "installation_id": "4f0c0b5e-1d2a-4b55-9c1e-6a0d9e2b7c11",
  "platform": "android",
  "device_key": "8c1d9a0e-55b1-4f2a-9d33-1a2b3c4d5e6f",
  "os_version": "14",
  "app_version": "1.4.0",
  "attestation": {
    "play_integrity_token": "optional-and-not-required"
  }
}
```

`app_id` must be the app that owns the secret and the token. `installation_id` is required. `device_key` is optional and must also be app-generated.

Success:

```json
{ "verified": true, "reward_status": "granted", "points": 100 }
```

Already rewarded, including a replay of the same token or a second download for the same user and app:

```json
{ "verified": true, "reward_status": "already_granted", "points": 0 }
```

Rejection:

```json
{ "verified": false, "reward_status": "rejected", "points": 0, "reason": "expired" }
```

`reason` is one of `invalid_credentials`, `app_inactive`, `invalid_request`, `invalid_token`, `expired`, `wrong_app`, `replay`, `rejected`, `rate_limited`, `unavailable`. Fraud rule ids are not included.

| HTTP | When |
| --- | --- |
| 200 | Granted, already granted, or a fraud rejection (`reason` `rejected`) |
| 400 | Bad body, bad token, expired, wrong app, replay of a failed token |
| 401 | Missing, unknown, or revoked secret |
| 403 | App suspended, or this account cannot start verification |
| 429 | Route limit or verify-failure velocity |

Attestation fields are accepted and ignored by the live verifiers until Play Integrity or App Attest is configured. `verificationConfig.requireAttestation: true` denies the reward until a verifier exists. Leave it false.

## Rate limits

Start: 20 requests / 15 minutes. Verify: 60 / 15 minutes. Registration and credential rotation: 10 / hour. These sit on top of the general API limit.
