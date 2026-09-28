import { randomBytes } from "crypto"
import { Pool } from "pg"
import { z } from "zod"
import { careersSchema } from "./types/types"
import { config, POINTS_PER_REFERRAL } from "./config"
import { databasePoolConfig } from "./pgSsl"
import { logError } from "./redact"
import { getRule, isSourceApp, type SourceApp, type QualificationEvent } from "./rules"
import { safePictureUrl, type AuthUser } from "./auth"
import { ensureInstallSchema } from "./installations/schema"
import { sumInstallRewardPoints } from "./ledger"

export type Career = z.infer<typeof careersSchema>

export const dbPool = new Pool({
    ...databasePoolConfig(config.databaseUrl, config.databaseSslRejectUnauthorized),
    max: 10,
})
const pool = dbPool

function mintGlobalCode(): string {
    return `KL-${randomBytes(3).toString("hex").toUpperCase()}`
}

async function createTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS careers (
                id SERIAL PRIMARY KEY,
                name VARCHAR(30) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                contact BIGINT NOT NULL,
                linkedin VARCHAR(255) NOT NULL
            );
        `)

        await pool.query(`
            CREATE TABLE IF NOT EXISTS global_users (
                id SERIAL PRIMARY KEY,
                google_sub VARCHAR(64) NOT NULL UNIQUE,
                email VARCHAR(255) NOT NULL UNIQUE,
                display_name VARCHAR(255) NOT NULL,
                picture_url TEXT,
                global_code VARCHAR(20) NOT NULL UNIQUE,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                last_login_at TIMESTAMPTZ DEFAULT NOW()
            );
        `)

        await pool.query(`
            CREATE TABLE IF NOT EXISTS app_account_links (
                id SERIAL PRIMARY KEY,
                global_user_id INT NOT NULL REFERENCES global_users(id) ON DELETE CASCADE,
                source_app VARCHAR(32) NOT NULL,
                app_uid VARCHAR(128) NOT NULL,
                referral_code VARCHAR(20),
                linked_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE (source_app, app_uid),
                UNIQUE (global_user_id, source_app)
            );
        `)

        await pool.query(`
            CREATE TABLE IF NOT EXISTS referral_codes (
                code VARCHAR(20) PRIMARY KEY,
                source_app VARCHAR(32) NOT NULL,
                global_user_id INT REFERENCES global_users(id) ON DELETE SET NULL,
                owner_email VARCHAR(255),
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `)

        await pool.query(`
            ALTER TABLE referral_codes
                ADD COLUMN IF NOT EXISTS global_user_id INT REFERENCES global_users(id) ON DELETE SET NULL;
        `)
        await pool.query(`
            ALTER TABLE referral_codes
                ADD COLUMN IF NOT EXISTS owner_email VARCHAR(255);
        `)

        await pool.query(`
            CREATE TABLE IF NOT EXISTS referral_events (
                id SERIAL PRIMARY KEY,
                referrer_code VARCHAR(20) NOT NULL,
                referred_email VARCHAR(255) NOT NULL,
                device_id VARCHAR(255),
                source_app VARCHAR(32) DEFAULT 'diabetic',
                points_awarded INT DEFAULT 0,
                status VARCHAR(20) DEFAULT 'pending',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                confirmed_at TIMESTAMPTZ,
                UNIQUE (referred_email, source_app),
                UNIQUE (device_id, source_app)
            );
        `)

        // Soft-migrate legacy unique constraints if present
        try {
            await pool.query(`ALTER TABLE referral_events DROP CONSTRAINT IF EXISTS referral_events_referred_email_key`)
            await pool.query(`ALTER TABLE referral_events DROP CONSTRAINT IF EXISTS referral_events_device_id_key`)
        } catch {
            /* ignore */
        }

        await pool.query(`
            ALTER TABLE referral_events ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
        `)

        await pool.query(`
            CREATE TABLE IF NOT EXISTS referral_tracking_events (
                id SERIAL PRIMARY KEY,
                referrer_code VARCHAR(20) NOT NULL,
                event_type VARCHAR(50) NOT NULL,
                device_id VARCHAR(255) NOT NULL,
                ip_address VARCHAR(45),
                user_agent TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `)

        await pool.query(`
            CREATE TABLE IF NOT EXISTS referral_rewards (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL UNIQUE,
                required_referrals INT DEFAULT 0,
                points_cost INT NOT NULL DEFAULT 500,
                category VARCHAR(100) NOT NULL
            );
        `)

        await pool.query(`
            ALTER TABLE referral_rewards ADD COLUMN IF NOT EXISTS points_cost INT NOT NULL DEFAULT 500;
        `)

        await pool.query(`
            CREATE TABLE IF NOT EXISTS referral_balances (
                referrer_code VARCHAR(20) PRIMARY KEY,
                points_earned INT NOT NULL DEFAULT 0,
                points_spent INT NOT NULL DEFAULT 0,
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        `)

        await pool.query(`
            CREATE TABLE IF NOT EXISTS reward_redemptions (
                id SERIAL PRIMARY KEY,
                referrer_code VARCHAR(20) NOT NULL,
                reward_id INT REFERENCES referral_rewards(id),
                contact_email VARCHAR(255) NOT NULL,
                points_spent INT NOT NULL DEFAULT 0,
                status VARCHAR(20) DEFAULT 'pending',
                requested_at TIMESTAMPTZ DEFAULT NOW()
            );
        `)

        await pool.query(`
            ALTER TABLE reward_redemptions ADD COLUMN IF NOT EXISTS points_spent INT NOT NULL DEFAULT 0;
        `)

        await pool.query(`
            INSERT INTO referral_rewards (title, required_referrals, points_cost, category) VALUES
                ('$10 Amazon Voucher', 0, 500, 'Shopping'),
                ('$25 Amazon Voucher', 0, 1200, 'Shopping'),
                ('1 Year Premium App', 0, 300, 'Subscription'),
                ('₹500 Flipkart Voucher', 0, 800, 'Shopping'),
                ('Koliath Merchandise', 0, 1500, 'Merchandise')
            ON CONFLICT (title) DO UPDATE SET
                points_cost = EXCLUDED.points_cost,
                category = EXCLUDED.category;
        `)

        await ensureInstallSchema(pool)

        console.log("Tables ready")
    } catch (e) {
        logError("Error creating tables", e)
        throw e
    }
}
export const dbReady: Promise<void> = createTable()

export async function createCareer(data: Career) {
    const validated = careersSchema.parse(data)
    const result = await pool.query(
        `INSERT INTO careers (name, email, contact, linkedin)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [validated.name, validated.email, validated.contact, validated.linkedin]
    )
    return result.rows[0]
}

export async function upsertGlobalUser(auth: AuthUser) {
    const existing = await pool.query(
        `SELECT * FROM global_users WHERE google_sub = $1 OR email = $2 LIMIT 1`,
        [auth.googleSub, auth.email]
    )

    if (existing.rows[0]) {
        const row = existing.rows[0]
        await pool.query(
            `UPDATE global_users
             SET display_name = $1, picture_url = $2, last_login_at = NOW(), google_sub = $3
             WHERE id = $4`,
            [auth.name, auth.picture ?? null, auth.googleSub, row.id]
        )
        await claimCodesForUser(row.id, auth.email)
        return getGlobalUserById(row.id)
    }

    let code = mintGlobalCode()
    for (let i = 0; i < 5; i++) {
        try {
            const inserted = await pool.query(
                `INSERT INTO global_users (google_sub, email, display_name, picture_url, global_code)
                 VALUES ($1, $2, $3, $4, $5) RETURNING *`,
                [auth.googleSub, auth.email, auth.name, auth.picture ?? null, code]
            )
            const user = inserted.rows[0]
            await registerReferralCode(user.global_code, "global", user.id, user.email)
            await claimCodesForUser(user.id, user.email)
            return user
        } catch (e: unknown) {
            const err = e as { code?: string }
            if (err.code === "23505") {
                code = mintGlobalCode()
                continue
            }
            throw e
        }
    }
    throw new Error("Failed to mint unique global referral code")
}

async function claimCodesForUser(globalUserId: number, email: string) {
    await pool.query(
        `UPDATE referral_codes
         SET global_user_id = $1
         WHERE owner_email = $2 AND (global_user_id IS NULL OR global_user_id = $1)`,
        [globalUserId, email.toLowerCase()]
    )
}

export async function getGlobalUserById(id: number) {
    const result = await pool.query(`SELECT * FROM global_users WHERE id = $1`, [id])
    return result.rows[0] ?? null
}

export async function getGlobalUserByGoogleSub(googleSub: string) {
    const result = await pool.query(`SELECT * FROM global_users WHERE google_sub = $1`, [googleSub])
    return result.rows[0] ?? null
}

export async function getDashboardForUser(globalUserId: number) {
    const user = await getGlobalUserById(globalUserId)
    if (!user) return null

    const codes = await pool.query(
        `SELECT code, source_app AS "sourceApp", created_at AS "createdAt"
         FROM referral_codes
         WHERE code = $3
            OR global_user_id = $1
            OR (LOWER(owner_email) = LOWER($2) AND (global_user_id IS NULL OR global_user_id = $1))
         ORDER BY created_at ASC`,
        [globalUserId, user.email, user.global_code]
    )

    const codeList: string[] = codes.rows.map((r: { code: string }) => r.code)
    if (!codeList.includes(user.global_code)) {
        codeList.push(user.global_code)
    }

    let pointsEarned = 0
    let pointsSpent = 0
    let totalReferrals = 0
    let pendingReferrals = 0
    let confirmedReferrals = 0

    if (codeList.length > 0) {
        const balance = await pool.query(
            `SELECT COALESCE(SUM(points_earned), 0) AS earned, COALESCE(SUM(points_spent), 0) AS spent
             FROM referral_balances WHERE referrer_code = ANY($1)`,
            [codeList]
        )
        pointsEarned = parseInt(balance.rows[0].earned, 10) || 0
        pointsSpent = parseInt(balance.rows[0].spent, 10) || 0

        const counts = await pool.query(
            `SELECT status, COUNT(*)::int AS count
             FROM referral_events WHERE referrer_code = ANY($1)
             GROUP BY status`,
            [codeList]
        )
        for (const row of counts.rows) {
            totalReferrals += row.count
            if (row.status === "pending") pendingReferrals += row.count
            if (row.status === "confirmed") confirmedReferrals += row.count
        }
    }

    let installPoints = 0
    try {
        installPoints = await sumInstallRewardPoints(pool, globalUserId)
    } catch (error) {
        logError("install ledger unavailable", error)
    }
    pointsEarned += installPoints

    const links = await pool.query(
        `SELECT source_app AS "sourceApp", app_uid AS "appUid", referral_code AS "referralCode", linked_at AS "linkedAt"
         FROM app_account_links WHERE global_user_id = $1`,
        [globalUserId]
    )

    const history = await pool.query(
        `SELECT id, referrer_code AS "referrerCode", created_at AS "referredAt", status,
                points_awarded AS "pointsAwarded", source_app AS "sourceApp", confirmed_at AS "confirmedAt"
         FROM referral_events
         WHERE referrer_code = ANY($1)
         ORDER BY created_at DESC
         LIMIT 50`,
        [codeList]
    )

    const redemptions = await pool.query(
        `SELECT status, COUNT(*)::int AS count FROM reward_redemptions
         WHERE referrer_code = ANY($1) GROUP BY status`,
        [codeList]
    )
    let pendingRewards = 0
    let redeemedRewards = 0
    for (const row of redemptions.rows) {
        if (row.status === "pending") pendingRewards += row.count
        if (row.status === "fulfilled") redeemedRewards += row.count
    }

    return {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        pictureUrl: safePictureUrl(user.picture_url) ?? null,
        globalCode: user.global_code,
        codes: codes.rows,
        linkedApps: links.rows,
        pointsEarned,
        pointsSpent,
        pointsAvailable: Math.max(0, pointsEarned - pointsSpent),
        installPoints,
        accountStatus: user.account_status ?? "active",
        riskStatus: user.risk_status ?? "NORMAL",
        totalReferrals,
        pendingReferrals,
        confirmedReferrals,
        pendingRewards,
        redeemedRewards,
        referralHistory: history.rows,
    }
}

export async function linkAppAccount(
    globalUserId: number,
    sourceApp: SourceApp,
    appUid: string,
    referralCode?: string
) {
    const user = await getGlobalUserById(globalUserId)
    if (referralCode) {
        const registered = await registerReferralCode(
            referralCode,
            sourceApp,
            globalUserId,
            user?.email
        )
        if (!registered.linked) {
            throw Object.assign(new Error("Referral code is already linked to another account"), {
                status: 403,
            })
        }
    }

    try {
        await pool.query(
            `INSERT INTO app_account_links (global_user_id, source_app, app_uid, referral_code)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (global_user_id, source_app) DO UPDATE SET
                app_uid = EXCLUDED.app_uid,
                referral_code = COALESCE(EXCLUDED.referral_code, app_account_links.referral_code),
                linked_at = NOW()`,
            [globalUserId, sourceApp, appUid, referralCode ?? null]
        )
    } catch (e: unknown) {
        const err = e as { code?: string }
        if (err.code === "23505") {
            throw Object.assign(new Error("That app account is already linked"), { status: 409 })
        }
        throw e
    }

    return getDashboardForUser(globalUserId)
}

export async function registerReferralCode(
    code: string,
    sourceApp: string,
    globalUserId?: number | null,
    ownerEmail?: string | null
) {
    const normalized = code.trim().toUpperCase()
    const ownerId = globalUserId ?? null
    const email = ownerEmail?.toLowerCase() ?? null
    // Never replace an existing owner. A new global_user_id is applied only
    // while the row is unclaimed. source_app / owner_email follow the same rule.
    const result = await pool.query(
        `INSERT INTO referral_codes (code, source_app, global_user_id, owner_email)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (code) DO UPDATE SET
            source_app = CASE
                WHEN referral_codes.global_user_id IS NULL
                  OR referral_codes.global_user_id = EXCLUDED.global_user_id
                THEN EXCLUDED.source_app
                ELSE referral_codes.source_app
            END,
            global_user_id = CASE
                WHEN referral_codes.global_user_id IS NULL THEN EXCLUDED.global_user_id
                ELSE referral_codes.global_user_id
            END,
            owner_email = CASE
                WHEN referral_codes.owner_email IS NULL THEN EXCLUDED.owner_email
                WHEN referral_codes.global_user_id IS NOT NULL
                  AND referral_codes.global_user_id = EXCLUDED.global_user_id
                THEN referral_codes.owner_email
                ELSE referral_codes.owner_email
            END
         RETURNING global_user_id`,
        [normalized, sourceApp, ownerId, email]
    )
    await pool.query(
        `INSERT INTO referral_balances (referrer_code, points_earned, points_spent)
         VALUES ($1, 0, 0)
         ON CONFLICT (referrer_code) DO NOTHING`,
        [normalized]
    )
    const storedOwner = result.rows[0]?.global_user_id as number | null | undefined
    const linked = ownerId == null || (storedOwner != null && Number(storedOwner) === ownerId)
    return { code: normalized, sourceApp, linked }
}

export async function userOwnsCode(globalUserId: number, code: string): Promise<boolean> {
    const normalized = code.trim().toUpperCase()
    const user = await getGlobalUserById(globalUserId)
    if (!user) return false
    if (user.global_code === normalized) return true
    const row = await pool.query(
        `SELECT 1 FROM referral_codes
         WHERE code = $1
           AND (
                global_user_id = $2
                OR (LOWER(owner_email) = LOWER($3) AND (global_user_id IS NULL OR global_user_id = $2))
           )
         LIMIT 1`,
        [normalized, globalUserId, user.email]
    )
    return row.rows.length > 0
}

export async function getReferralStats(code: string) {
    const normalized = code.trim().toUpperCase()

    const codeRow = await pool.query(
        "SELECT code, source_app FROM referral_codes WHERE code = $1",
        [normalized]
    )

    const balanceRow = await pool.query(
        "SELECT points_earned, points_spent FROM referral_balances WHERE referrer_code = $1",
        [normalized]
    )

    const totalQuery = await pool.query(
        "SELECT COUNT(*) FROM referral_events WHERE referrer_code = $1",
        [normalized]
    )
    const totalReferrals = parseInt(totalQuery.rows[0].count, 10) || 0

    let pointsEarned = balanceRow.rows[0]
        ? parseInt(balanceRow.rows[0].points_earned, 10) || 0
        : 0
    let pointsSpent = balanceRow.rows[0]
        ? parseInt(balanceRow.rows[0].points_spent, 10) || 0
        : 0

    if (!balanceRow.rows[0] && totalReferrals > 0) {
        const pts = await pool.query(
            `SELECT COALESCE(SUM(points_awarded), 0) AS earned FROM referral_events
             WHERE referrer_code = $1 AND status = 'confirmed'`,
            [normalized]
        )
        pointsEarned = parseInt(pts.rows[0].earned, 10) || 0
    }

    const redemptionsQuery = await pool.query(
        "SELECT status, COUNT(*) FROM reward_redemptions WHERE referrer_code = $1 GROUP BY status",
        [normalized]
    )

    let pendingRewards = 0
    let redeemedRewards = 0
    for (const row of redemptionsQuery.rows) {
        if (row.status === "pending") pendingRewards += parseInt(row.count, 10)
        if (row.status === "fulfilled") redeemedRewards += parseInt(row.count, 10)
    }

    const historyQuery = await pool.query(
        `SELECT id, created_at as "referredAt", status, points_awarded as "pointsAwarded", source_app as "sourceApp"
         FROM referral_events WHERE referrer_code = $1 ORDER BY created_at DESC`,
        [normalized]
    )

    const exists = codeRow.rows.length > 0 || totalReferrals > 0 || balanceRow.rows.length > 0

    return {
        code: normalized,
        exists,
        sourceApp: codeRow.rows[0]?.source_app ?? null,
        totalReferrals,
        pointsEarned,
        pointsSpent,
        pointsAvailable: Math.max(0, pointsEarned - pointsSpent),
        pendingRewards,
        redeemedRewards,
        referralHistory: historyQuery.rows,
    }
}

export async function getAllRewards() {
    const result = await pool.query(
        "SELECT id, title, points_cost, category, required_referrals FROM referral_rewards ORDER BY points_cost ASC"
    )
    return result.rows
}

export async function createRedemption(code: string, rewardId: number, contactEmail: string) {
    const normalized = code.trim().toUpperCase()
    const client = await pool.connect()
    try {
        await client.query("BEGIN")

        const rewardResult = await client.query(
            "SELECT id, points_cost, title FROM referral_rewards WHERE id = $1 FOR SHARE",
            [rewardId]
        )
        if (rewardResult.rows.length === 0) {
            throw Object.assign(new Error("Reward not found"), { status: 404 })
        }
        const reward = rewardResult.rows[0]
        const cost = parseInt(reward.points_cost, 10)

        await client.query(
            `INSERT INTO referral_balances (referrer_code, points_earned, points_spent)
             VALUES ($1, 0, 0) ON CONFLICT (referrer_code) DO NOTHING`,
            [normalized]
        )

        const balanceResult = await client.query(
            "SELECT points_earned, points_spent FROM referral_balances WHERE referrer_code = $1 FOR UPDATE",
            [normalized]
        )
        const earned = parseInt(balanceResult.rows[0].points_earned, 10) || 0
        const spent = parseInt(balanceResult.rows[0].points_spent, 10) || 0
        const owner = await client.query(
            `SELECT global_user_id FROM referral_codes WHERE code = $1`,
            [normalized]
        )
        const ownerId = owner.rows[0]?.global_user_id as number | null | undefined
        const installPoints = ownerId ? await sumInstallRewardPoints(client, Number(ownerId)) : 0
        const available = earned + installPoints - spent

        if (available < cost) {
            throw Object.assign(
                new Error(`Not enough points. Need ${cost}, have ${available}.`),
                { status: 400 }
            )
        }

        await client.query(
            "UPDATE referral_balances SET points_spent = points_spent + $1, updated_at = NOW() WHERE referrer_code = $2",
            [cost, normalized]
        )

        const redemption = await client.query(
            `INSERT INTO reward_redemptions (referrer_code, reward_id, contact_email, points_spent)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [normalized, rewardId, contactEmail.toLowerCase(), cost]
        )

        await client.query("COMMIT")
        return redemption.rows[0]
    } catch (e) {
        await client.query("ROLLBACK")
        throw e
    } finally {
        client.release()
    }
}

/**
 * Creates a pending or immediately confirmed referral depending on app rules.
 * For diabetic (confirmOn: signup), awards points immediately.
 */
export async function createReferralEvent(
    referrerCode: string,
    referredEmail: string,
    deviceId: string,
    sourceApp: string = "diabetic",
    pointsAwarded: number = POINTS_PER_REFERRAL
) {
    if (!isSourceApp(sourceApp)) {
        throw Object.assign(new Error("Unknown source app"), { status: 400 })
    }
    const rule = getRule(sourceApp)
    const status = rule.confirmOn === "signup" ? "confirmed" : "pending"
    const awarded = status === "confirmed" ? rule.points : 0

    return insertReferralEvent(referrerCode, referredEmail, deviceId, sourceApp, awarded, status)
}

async function insertReferralEvent(
    referrerCode: string,
    referredEmail: string,
    deviceId: string,
    sourceApp: string,
    pointsAwarded: number,
    status: "pending" | "confirmed"
) {
    const normalized = referrerCode.trim().toUpperCase()
    const client = await pool.connect()
    try {
        await client.query("BEGIN")

        const codeCheck = await client.query(
            "SELECT code FROM referral_codes WHERE code = $1",
            [normalized]
        )
        if (codeCheck.rows.length === 0) {
            throw Object.assign(new Error("Unknown referral code"), {
                status: 404,
                code: "UNKNOWN_CODE",
            })
        }

        const event = await client.query(
            `INSERT INTO referral_events
                (referrer_code, referred_email, device_id, source_app, points_awarded, status, confirmed_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [
                normalized,
                referredEmail.toLowerCase(),
                deviceId,
                sourceApp,
                pointsAwarded,
                status,
                status === "confirmed" ? new Date() : null,
            ]
        )

        if (status === "confirmed" && pointsAwarded > 0) {
            await client.query(
                `INSERT INTO referral_balances (referrer_code, points_earned, points_spent)
                 VALUES ($1, $2, 0)
                 ON CONFLICT (referrer_code) DO UPDATE SET
                    points_earned = referral_balances.points_earned + $2,
                    updated_at = NOW()`,
                [normalized, pointsAwarded]
            )
        }

        await client.query("COMMIT")
        return event.rows[0]
    } catch (e) {
        await client.query("ROLLBACK")
        throw e
    } finally {
        client.release()
    }
}

/**
 * Trusted apps call this when a referred user meets the qualification event
 * (e.g. Sapient day_active, Adverts purchase).
 */
export async function qualifyReferral(
    referrerCode: string,
    referredEmail: string,
    deviceId: string,
    sourceApp: SourceApp,
    event: QualificationEvent
) {
    const rule = getRule(sourceApp)
    const normalized = referrerCode.trim().toUpperCase()
    const email = referredEmail.toLowerCase()

    if (event === "signup" && rule.trackPendingOnSignup) {
        // Create pending (or confirmed for diabetic)
        try {
            return await createReferralEvent(normalized, email, deviceId, sourceApp)
        } catch (e: unknown) {
            const err = e as { code?: string }
            if (err.code === "23505") {
                // already tracked — fall through to possible confirmation
            } else {
                throw e
            }
        }
    }

    if (event !== rule.confirmOn && !(event === "signup" && rule.confirmOn === "signup")) {
        return {
            success: true,
            status: "ignored",
            message: `Event '${event}' does not confirm rewards for ${rule.label}. Waiting for '${rule.confirmOn}'.`,
        }
    }

    const client = await pool.connect()
    try {
        await client.query("BEGIN")

        const codeCheck = await client.query("SELECT code FROM referral_codes WHERE code = $1", [
            normalized,
        ])
        if (codeCheck.rows.length === 0) {
            throw Object.assign(new Error("Unknown referral code"), {
                status: 404,
                code: "UNKNOWN_CODE",
            })
        }

        let existing = await client.query(
            `SELECT * FROM referral_events
             WHERE referrer_code = $1 AND referred_email = $2 AND source_app = $3
             FOR UPDATE`,
            [normalized, email, sourceApp]
        )

        if (existing.rows.length === 0) {
            existing = await client.query(
                `SELECT * FROM referral_events
                 WHERE referrer_code = $1 AND device_id = $2 AND source_app = $3
                 FOR UPDATE`,
                [normalized, deviceId, sourceApp]
            )
        }

        if (existing.rows.length === 0) {
            // First time seeing this qualification — insert confirmed
            const inserted = await client.query(
                `INSERT INTO referral_events
                    (referrer_code, referred_email, device_id, source_app, points_awarded, status, confirmed_at)
                 VALUES ($1, $2, $3, $4, $5, 'confirmed', NOW()) RETURNING *`,
                [normalized, email, deviceId, sourceApp, rule.points]
            )
            await client.query(
                `INSERT INTO referral_balances (referrer_code, points_earned, points_spent)
                 VALUES ($1, $2, 0)
                 ON CONFLICT (referrer_code) DO UPDATE SET
                    points_earned = referral_balances.points_earned + $2,
                    updated_at = NOW()`,
                [normalized, rule.points]
            )
            await client.query("COMMIT")
            return { success: true, status: "confirmed", pointsAwarded: rule.points, event: inserted.rows[0] }
        }

        const row = existing.rows[0]
        if (row.status === "confirmed") {
            await client.query("COMMIT")
            return { success: true, status: "already_confirmed", pointsAwarded: 0 }
        }

        await client.query(
            `UPDATE referral_events
             SET status = 'confirmed', points_awarded = $1, confirmed_at = NOW()
             WHERE id = $2`,
            [rule.points, row.id]
        )
        await client.query(
            `INSERT INTO referral_balances (referrer_code, points_earned, points_spent)
             VALUES ($1, $2, 0)
             ON CONFLICT (referrer_code) DO UPDATE SET
                points_earned = referral_balances.points_earned + $2,
                updated_at = NOW()`,
            [normalized, rule.points]
        )
        await client.query("COMMIT")
        return { success: true, status: "confirmed", pointsAwarded: rule.points }
    } catch (e) {
        await client.query("ROLLBACK")
        throw e
    } finally {
        client.release()
    }
}

export async function trackReferralEvent(
    code: string,
    eventType: string,
    deviceId: string,
    ipAddress?: string,
    userAgent?: string
) {
    const normalized = code.trim().toUpperCase()
    const recentEvent = await pool.query(
        `SELECT id FROM referral_tracking_events
         WHERE referrer_code = $1 AND event_type = $2 AND device_id = $3
           AND created_at > NOW() - INTERVAL '1 hour'`,
        [normalized, eventType, deviceId]
    )

    if (recentEvent.rows.length === 0) {
        await pool.query(
            `INSERT INTO referral_tracking_events (referrer_code, event_type, device_id, ip_address, user_agent)
             VALUES ($1, $2, $3, $4, $5)`,
            [normalized, eventType, deviceId, ipAddress ?? null, userAgent ?? null]
        )
    }
}

export async function validateReferralCode(code: string): Promise<boolean> {
    const normalized = code.trim().toUpperCase()
    if (!/^[A-Z]{2}-[A-Z0-9]{4,12}$|^[A-Z0-9]{4,12}$/.test(normalized)) {
        return false
    }
    const result = await pool.query("SELECT code FROM referral_codes WHERE code = $1", [normalized])
    return result.rows.length > 0
}
