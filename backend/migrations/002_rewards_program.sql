-- Rewards program: first login, signup referrals, gift cards.
-- Idempotent. Applied once from backend/src/migrate.ts.
-- Install rewards stay on event_type install_reward (public name APP_INSTALL).

ALTER TABLE points_ledger ADD COLUMN IF NOT EXISTS reference_id VARCHAR(128);

CREATE UNIQUE INDEX IF NOT EXISTS points_ledger_first_login_reward
    ON points_ledger (user_id)
    WHERE event_type = 'FIRST_LOGIN_REWARD';

CREATE UNIQUE INDEX IF NOT EXISTS points_ledger_referral_reward_referred
    ON points_ledger (reference_id)
    WHERE event_type = 'REFERRAL_REWARD' AND reference_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS points_ledger_gift_redeem_ref
    ON points_ledger (user_id, reference_id)
    WHERE event_type = 'GIFT_CARD_REDEEM' AND reference_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS signup_referrals (
    id SERIAL PRIMARY KEY,
    referrer_user_id INT NOT NULL REFERENCES global_users(id),
    referred_user_id INT NOT NULL UNIQUE REFERENCES global_users(id),
    code VARCHAR(32) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('granted', 'rejected')),
    reject_reason VARCHAR(64),
    device_key VARCHAR(160),
    ip_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS signup_referrals_referrer_idx
    ON signup_referrals (referrer_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS browser_devices (
    user_id INT NOT NULL REFERENCES global_users(id) ON DELETE CASCADE,
    device_key VARCHAR(160) NOT NULL,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, device_key)
);

CREATE INDEX IF NOT EXISTS browser_devices_key_idx ON browser_devices (device_key);

ALTER TABLE reward_redemptions ADD COLUMN IF NOT EXISTS user_id INT REFERENCES global_users(id);
ALTER TABLE reward_redemptions ADD COLUMN IF NOT EXISTS denomination_inr INT;
ALTER TABLE reward_redemptions ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(80);

CREATE UNIQUE INDEX IF NOT EXISTS reward_redemptions_user_idempotency
    ON reward_redemptions (user_id, idempotency_key)
    WHERE user_id IS NOT NULL AND idempotency_key IS NOT NULL;

ALTER TABLE apps ADD COLUMN IF NOT EXISTS description TEXT;
