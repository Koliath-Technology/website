import type { Pool } from "pg"

const CATALOG = [
    {
        appId: "app_sapient_android",
        slug: "sapient",
        name: "Sapient",
        packageId: "in.koliath.sapient",
        platform: "android",
        points: 100,
    },
    {
        appId: "app_adverts_android",
        slug: "adverts",
        name: "Adverts",
        packageId: "in.koliath.adverts",
        platform: "android",
        points: 100,
    },
    {
        appId: "app_adverts_rewards_android",
        slug: "adverts-rewards",
        name: "Adverts Rewards",
        packageId: "in.koliath.advertsrewards",
        platform: "android",
        points: 50,
    },
    {
        appId: "app_advert_cohort_android",
        slug: "advert-cohort",
        name: "Advert Cohort",
        packageId: "in.koliath.advertcohort",
        platform: "android",
        points: 75,
    },
    {
        appId: "app_diabetic_buddy_android",
        slug: "diabetic-buddy",
        name: "Diabetic Buddy",
        packageId: "in.koliath.diabeticbuddy",
        platform: "android",
        points: 100,
    },
] as const

export async function ensureInstallSchema(pool: Pool): Promise<void> {
    await pool.query(`
        ALTER TABLE global_users
            ADD COLUMN IF NOT EXISTS account_status VARCHAR(20) NOT NULL DEFAULT 'active';
    `)
    await pool.query(`
        ALTER TABLE global_users
            ADD COLUMN IF NOT EXISTS risk_status VARCHAR(20) NOT NULL DEFAULT 'NORMAL';
    `)

    await pool.query(`
        DO $$ BEGIN
            ALTER TABLE global_users
                ADD CONSTRAINT global_users_account_status_check
                CHECK (account_status IN ('active', 'suspended'));
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    `)
    await pool.query(`
        DO $$ BEGIN
            ALTER TABLE global_users
                ADD CONSTRAINT global_users_risk_status_check
                CHECK (risk_status IN ('NORMAL', 'REVIEW', 'BLOCKED'));
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    `)

    await pool.query(`
        CREATE TABLE IF NOT EXISTS apps (
            id SERIAL PRIMARY KEY,
            app_id VARCHAR(64) NOT NULL UNIQUE,
            slug VARCHAR(64) UNIQUE,
            name VARCHAR(120) NOT NULL,
            package_id VARCHAR(255) NOT NULL,
            platform VARCHAR(16) NOT NULL CHECK (platform IN ('android', 'ios')),
            developer_name VARCHAR(255) NOT NULL,
            company VARCHAR(255),
            status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
            points_awarded INT NOT NULL DEFAULT 0 CHECK (points_awarded >= 0 AND points_awarded <= 10000),
            verification_config JSONB NOT NULL DEFAULT '{}'::jsonb,
            owner_user_id INT REFERENCES global_users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (package_id, platform)
        );
    `)

    await pool.query(`
        CREATE TABLE IF NOT EXISTS app_credentials (
            id SERIAL PRIMARY KEY,
            app_row_id INT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
            secret_hash TEXT NOT NULL,
            secret_prefix VARCHAR(48) NOT NULL UNIQUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            rotated_at TIMESTAMPTZ,
            revoked_at TIMESTAMPTZ
        );
    `)
    await pool.query(`
        CREATE INDEX IF NOT EXISTS app_credentials_active_idx
            ON app_credentials (app_row_id)
            WHERE revoked_at IS NULL;
    `)

    await pool.query(`
        CREATE TABLE IF NOT EXISTS devices (
            id SERIAL PRIMARY KEY,
            device_key VARCHAR(160) NOT NULL UNIQUE,
            platform VARCHAR(16) NOT NULL CHECK (platform IN ('android', 'ios')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `)

    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_devices (
            id SERIAL PRIMARY KEY,
            user_id INT NOT NULL REFERENCES global_users(id) ON DELETE CASCADE,
            device_id INT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
            first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (user_id, device_id)
        );
    `)

    await pool.query(`
        CREATE TABLE IF NOT EXISTS app_installations (
            id SERIAL PRIMARY KEY,
            app_row_id INT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
            device_id INT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
            installation_id VARCHAR(128) NOT NULL,
            user_id INT REFERENCES global_users(id) ON DELETE SET NULL,
            first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (app_row_id, installation_id)
        );
    `)
    await pool.query(`
        CREATE INDEX IF NOT EXISTS app_installations_device_idx
            ON app_installations (device_id, app_row_id);
    `)

    await pool.query(`
        CREATE TABLE IF NOT EXISTS installation_verifications (
            id SERIAL PRIMARY KEY,
            public_id VARCHAR(40) NOT NULL UNIQUE,
            user_id INT NOT NULL REFERENCES global_users(id) ON DELETE CASCADE,
            app_row_id INT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
            token_hash TEXT NOT NULL UNIQUE,
            token_prefix VARCHAR(24) NOT NULL UNIQUE,
            session_id VARCHAR(64) NOT NULL,
            hinted_installation_id VARCHAR(128),
            installation_id VARCHAR(128),
            device_id INT REFERENCES devices(id) ON DELETE SET NULL,
            status VARCHAR(32) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL,
            verified_at TIMESTAMPTZ,
            rewarded_at TIMESTAMPTZ,
            consumed_at TIMESTAMPTZ,
            reject_reason VARCHAR(64),
            ip_hash TEXT,
            user_agent_hash TEXT,
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb
        );
    `)
    await pool.query(`
        CREATE INDEX IF NOT EXISTS installation_verifications_user_app_idx
            ON installation_verifications (user_id, app_row_id, created_at DESC);
    `)
    await pool.query(`
        CREATE INDEX IF NOT EXISTS installation_verifications_status_idx
            ON installation_verifications (status, created_at DESC);
    `)

    await pool.query(`
        CREATE TABLE IF NOT EXISTS installation_status_events (
            id BIGSERIAL PRIMARY KEY,
            verification_id INT NOT NULL REFERENCES installation_verifications(id) ON DELETE CASCADE,
            from_status VARCHAR(32),
            to_status VARCHAR(32) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `)

    await pool.query(`
        CREATE TABLE IF NOT EXISTS points_ledger (
            id BIGSERIAL PRIMARY KEY,
            user_id INT NOT NULL REFERENCES global_users(id) ON DELETE RESTRICT,
            installation_id VARCHAR(128),
            verification_id INT REFERENCES installation_verifications(id) ON DELETE RESTRICT,
            app_row_id INT REFERENCES apps(id) ON DELETE RESTRICT,
            event_type VARCHAR(64) NOT NULL,
            points INT NOT NULL CHECK (points >= 0),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb
        );
    `)
    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS points_ledger_user_app_install_reward
            ON points_ledger (user_id, app_row_id)
            WHERE event_type = 'install_reward';
    `)
    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS points_ledger_installation_install_reward
            ON points_ledger (app_row_id, installation_id)
            WHERE event_type = 'install_reward' AND installation_id IS NOT NULL;
    `)
    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS points_ledger_verification_install_reward
            ON points_ledger (verification_id)
            WHERE event_type = 'install_reward' AND verification_id IS NOT NULL;
    `)
    await pool.query(`
        CREATE INDEX IF NOT EXISTS points_ledger_user_idx
            ON points_ledger (user_id, created_at DESC);
    `)

    await pool.query(`
        CREATE TABLE IF NOT EXISTS fraud_events (
            id BIGSERIAL PRIMARY KEY,
            user_id INT REFERENCES global_users(id) ON DELETE SET NULL,
            app_row_id INT REFERENCES apps(id) ON DELETE SET NULL,
            device_id INT REFERENCES devices(id) ON DELETE SET NULL,
            verification_id INT REFERENCES installation_verifications(id) ON DELETE SET NULL,
            rule_id VARCHAR(64) NOT NULL,
            severity VARCHAR(16) NOT NULL,
            action VARCHAR(32) NOT NULL,
            detail JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `)
    await pool.query(`
        CREATE INDEX IF NOT EXISTS fraud_events_created_idx
            ON fraud_events (created_at DESC);
    `)
    await pool.query(`
        CREATE INDEX IF NOT EXISTS fraud_events_user_idx
            ON fraud_events (user_id, created_at DESC);
    `)

    await pool.query(`
        CREATE TABLE IF NOT EXISTS verification_attempts (
            id BIGSERIAL PRIMARY KEY,
            app_row_id INT,
            user_id INT,
            ip_hash TEXT,
            token_prefix VARCHAR(24),
            outcome VARCHAR(32) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `)
    await pool.query(`
        CREATE INDEX IF NOT EXISTS verification_attempts_ip_idx
            ON verification_attempts (ip_hash, created_at DESC);
    `)

    await seedCatalogApps(pool)
}

export async function seedCatalogApps(pool: Pick<Pool, "query">): Promise<void> {
    for (const app of CATALOG) {
        await pool.query(
            `INSERT INTO apps (
                app_id, slug, name, package_id, platform, developer_name, company,
                status, points_awarded, verification_config
             ) VALUES ($1, $2, $3, $4, $5, 'Koliath', 'Koliath', 'active', $6, '{}'::jsonb)
             ON CONFLICT (app_id) DO NOTHING`,
            [app.appId, app.slug, app.name, app.packageId, app.platform, app.points]
        )
    }
}
