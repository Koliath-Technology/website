# Rewards program

The Earn page and admin console read coin amounts from the API. Environment variables are the source of truth. Google sign-in stays on Firebase Auth. There is no second login system.

Install verification, device rows, Play Integrity / App Attest hooks, and the `points_ledger` install payout already exist. This program adds first-login coins, signup referrals, and the gift card on top of that ledger.

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `FIRST_LOGIN_REWARD_COINS` | 10 | Coins the first time a Google account is activated. |
| `APP_DOWNLOAD_REWARD_COINS` | 25 | Published download reward. The ledger pays each app's `points_awarded` after verify. |
| `REFERRAL_REWARD_COINS` | 20 | Coins for one qualifying signup referral. |
| `GIFT_CARD_COST_COINS` | 200 | Coins required to redeem. |
| `GIFT_CARD_VALUE_INR` | 100 | Face value in INR. |
| `REFERRALS_REQUIRED_FOR_REDEMPTION` | 3 | Granted signup referrals required. |
| `VERIFICATION_TOKEN_EXPIRY_MINUTES` | 1440 | Token life when `INSTALL_TOKEN_TTL_SECONDS` is unset. |

`INSTALL_TOKEN_TTL_SECONDS`, when set, overrides the minutes value. A per-app `verificationConfig.tokenTtlSeconds` still overrides both. All three are clamped to 60–86400 seconds.

Admin host variables are unchanged: `ADMIN_ORIGIN`, `ADMIN_HOSTS`, `ADMIN_CORS_ORIGINS`, `ADMIN_GOOGLE_SUBS`. An empty allowlist still denies the admin API. The console is only on `https://admin.koliath.in/`.

## Routes

| Method | Path | Who |
| --- | --- | --- |
| `GET` | `/api/rewards/program` | Public. Coin amounts and the effective token lifetime. No secrets. |
| `POST` | `/api/auth/firebase` | Existing Google session exchange. Optional `referralCode` and `deviceKey` apply only when the account is created. |
| `GET` | `/api/me` | Balance includes the program ledger. `giftCard.eligible` is the redeem flag. |
| `POST` | `/api/v1/installations/start` | Existing. Download click. No points. |
| `POST` | `/api/v1/installations/verify` | Existing. `{verified, reward_status, points}` after anti-fraud. Rejection does not include rule internals. |
| `POST` | `/api/rewards/gift-card` | Signed-in, CSRF. Body `{idempotencyKey, denominationInr?}`. Re-checks coins and referrals inside a transaction. |
| `GET` | `/api/admin/verification/overview` | Admin host only. Includes the program object. |

Invite links are `https://koliath.in/signup?ref=CODE`. `/signup` keeps the query string and opens Google sign-in.

## Reused

- Firebase ID token verification and the host-scoped session cookies
- `points_ledger` and its install unique indexes (`event_type = install_reward`, the public name `APP_INSTALL`)
- `devices`, `user_devices`, `app_installations`, fraud rules, and attestation stubs in `backend/src/installations/attestation.ts`
- App registry (`apps`, credentials, pending until an admin sets status and points)
- Older per-app qualify webhooks (`referral_events`, `referral_balances`). Those points still count in the balance. They do not count as gift-card referrals.

## New

- `FIRST_LOGIN_REWARD`, `REFERRAL_REWARD`, and `GIFT_CARD_REDEEM` ledger rows. Points are always `>= 0`. Gift spends are debit rows, subtracted from the balance.
- Unique indexes so one user cannot take first-login twice, one referred user cannot pay two referrers, and one idempotency key cannot debit twice.
- `signup_referrals` and `browser_devices`. A shared browser or install device key fails closed. A missing device key does not, by itself, deny the referral.
- `reward_redemptions.user_id`, `denomination_inr`, and `idempotency_key` for later denominations.
- Optional `apps.description`.

Server app secrets stay in `app_credentials` and are shown once to the developer portal. The example verifier is `examples/sdk/verify-server.ts`. Do not put that secret in a mobile app.

## Smoke

1. Set the reward variables and `ADMIN_GOOGLE_SUBS` on the existing Railway service. Point `admin.koliath.in` at that service.
2. `GET /api/rewards/program` returns the coin amounts.
3. Sign in with Google on `https://koliath.in/signup?ref=SOMEONE`. The new account receives first-login coins once. A second sign-in does not add them again. Self-referral and a shared device key do not pay the referrer.
4. Download while signed in, then `POST /api/v1/installations/verify` from the app server. A click alone leaves the ledger unchanged.
5. With enough coins and 3 granted referrals, `POST /api/rewards/gift-card` debits once. The same `idempotencyKey` does not debit again. A short balance or too few referrals returns `Gift card is locked` and writes nothing.
6. Open `https://admin.koliath.in/` with an allowlisted Google account. Overview shows the program. `https://koliath.in/admin` stays a 404.

```bash
npm test --prefix backend
```
