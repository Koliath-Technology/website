import type { Pool, PoolClient } from "pg"
import { config } from "../config"
import { dbPool } from "../db"
import { hashIp } from "../installations/crypto"
import { sumInstallRewardPoints } from "../ledger"
import {
    LEDGER_EVENT,
    REFERRAL_VELOCITY_PER_HOUR,
    assessGiftCard,
    publicReferralOutcome,
    rewardProgram,
    signupReferralDecision,
    type GiftCardAssessment,
    type RewardProgram,
} from "./program"

type Queryable = Pick<Pool | PoolClient, "query">

export class RewardDenied extends Error {
    status: number

    constructor(status: number, message: string) {
        super(message)
        this.name = "RewardDenied"
        this.status = status
    }
}

async function programCredits(client: Queryable, userId: number): Promise<{ credits: number; debits: number }> {
    const result = await client.query(
        `SELECT
            COALESCE(SUM(points) FILTER (
                WHERE event_type IN ($2, $3)
            ), 0)::int AS credits,
            COALESCE(SUM(points) FILTER (
                WHERE event_type = $4
            ), 0)::int AS debits
         FROM points_ledger
         WHERE user_id = $1`,
        [
            userId,
            LEDGER_EVENT.FIRST_LOGIN_REWARD,
            LEDGER_EVENT.REFERRAL_REWARD,
            LEDGER_EVENT.GIFT_CARD_REDEEM,
        ]
    )
    return {
        credits: Number(result.rows[0]?.credits ?? 0),
        debits: Number(result.rows[0]?.debits ?? 0),
    }
}

export async function validReferralCount(client: Queryable, userId: number): Promise<number> {
    const result = await client.query(
        `SELECT COUNT(*)::int AS n
         FROM signup_referrals
         WHERE referrer_user_id = $1 AND status = 'granted'`,
        [userId]
    )
    return Number(result.rows[0]?.n ?? 0)
}

export async function awardFirstLoginReward(userId: number): Promise<{ granted: boolean; points: number }> {
    const points = rewardProgram.firstLoginRewardCoins
    if (points <= 0) return { granted: false, points: 0 }
    const inserted = await dbPool.query(
        `INSERT INTO points_ledger (user_id, event_type, points, reference_id, metadata)
         VALUES ($1, $2, $3, $4, '{"source":"google"}'::jsonb)
         ON CONFLICT (user_id) WHERE event_type = 'FIRST_LOGIN_REWARD'
         DO NOTHING
         RETURNING id`,
        [userId, LEDGER_EVENT.FIRST_LOGIN_REWARD, points, `user:${userId}`]
    )
    if (inserted.rows[0]) return { granted: true, points }
    return { granted: false, points: 0 }
}

export async function rememberBrowserDevice(userId: number, deviceKey: string): Promise<void> {
    const key = deviceKey.trim()
    if (key.length < 5 || key.length > 160) return
    await dbPool.query(
        `INSERT INTO browser_devices (user_id, device_key)
         VALUES ($1, $2)
         ON CONFLICT (user_id, device_key) DO NOTHING`,
        [userId, key]
    )
}

async function codeOwner(client: Queryable, code: string) {
    const normalized = code.trim().toUpperCase()
    const result = await client.query(
        `SELECT u.id, u.email, u.risk_status, u.account_status
         FROM referral_codes c
         JOIN global_users u ON u.id = c.global_user_id
         WHERE c.code = $1
         UNION
         SELECT id, email, risk_status, account_status
         FROM global_users
         WHERE global_code = $1
         LIMIT 1`,
        [normalized]
    )
    return (result.rows[0] as
        | { id: number; email: string; risk_status: string; account_status: string }
        | undefined) ?? null
}

export async function applySignupReferral(input: {
    referredUserId: number
    code: string
    deviceKey?: string
    ip?: string
}): Promise<{ status: "granted" | "rejected" }> {
    const client = await dbPool.connect()
    try {
        await client.query("BEGIN")
        const existing = await client.query(
            `SELECT status FROM signup_referrals WHERE referred_user_id = $1`,
            [input.referredUserId]
        )
        if (existing.rows[0]) {
            await client.query("COMMIT")
            return { status: existing.rows[0].status === "granted" ? "granted" : "rejected" }
        }

        const owner = await codeOwner(client, input.code)
        if (!owner) {
            await client.query("COMMIT")
            return { status: "rejected" }
        }

        const lockIds = [input.referredUserId, Number(owner.id)].sort((a, b) => a - b)
        await client.query(
            `SELECT id FROM global_users WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE`,
            [lockIds]
        )
        const referred = await client.query(
            `SELECT id, email, risk_status, account_status FROM global_users WHERE id = $1`,
            [input.referredUserId]
        )
        const referredRow = referred.rows[0]
        if (!referredRow) {
            await client.query("COMMIT")
            return { status: "rejected" }
        }

        const deviceKey = input.deviceKey?.trim() || null
        let deviceShared = false
        if (deviceKey) {
            const shared = await client.query(
                `SELECT 1
                 FROM browser_devices
                 WHERE device_key = $1 AND user_id <> $2
                 UNION
                 SELECT 1
                 FROM user_devices ud
                 JOIN devices d ON d.id = ud.device_id
                 WHERE d.device_key = $1 AND ud.user_id <> $2
                 LIMIT 1`,
                [deviceKey, input.referredUserId]
            )
            deviceShared = shared.rows.length > 0
        }

        const loop = await client.query(
            `SELECT 1 FROM signup_referrals
             WHERE referrer_user_id = $1 AND referred_user_id = $2 AND status = 'granted'
             LIMIT 1`,
            [input.referredUserId, owner.id]
        )
        const velocity = await client.query(
            `SELECT COUNT(*)::int AS n
             FROM signup_referrals
             WHERE referrer_user_id = $1
               AND status = 'granted'
               AND created_at > NOW() - INTERVAL '1 hour'`,
            [owner.id]
        )

        const decision = signupReferralDecision({
            referrerUserId: Number(owner.id),
            referredUserId: input.referredUserId,
            referrerEmail: String(owner.email),
            referredEmail: String(referredRow.email),
            referrerRisk: String(owner.risk_status ?? "NORMAL"),
            referredRisk: String(referredRow.risk_status ?? "NORMAL"),
            referrerAccount: String(owner.account_status ?? "active"),
            referredAccount: String(referredRow.account_status ?? "active"),
            mutualLoop: loop.rows.length > 0,
            deviceSharedWithOtherUser: deviceShared,
            recentGranted: Number(velocity.rows[0]?.n ?? 0),
            velocityLimit: REFERRAL_VELOCITY_PER_HOUR,
        })
        const outcome = publicReferralOutcome(decision)
        const ipHash = input.ip ? hashIp(config.installIpHashSalt, input.ip) : null
        const normalized = input.code.trim().toUpperCase()

        await client.query(
            `INSERT INTO signup_referrals (
                referrer_user_id, referred_user_id, code, status, reject_reason, device_key, ip_hash
             ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                owner.id,
                input.referredUserId,
                normalized,
                outcome.status,
                decision.grant ? null : decision.reason,
                deviceKey,
                ipHash,
            ]
        )

        if (decision.grant && rewardProgram.referralRewardCoins > 0) {
            await client.query(
                `INSERT INTO points_ledger (user_id, event_type, points, reference_id, metadata)
                 VALUES ($1, $2, $3, $4, $5::jsonb)
                 ON CONFLICT (reference_id) WHERE event_type = 'REFERRAL_REWARD' AND reference_id IS NOT NULL
                 DO NOTHING`,
                [
                    owner.id,
                    LEDGER_EVENT.REFERRAL_REWARD,
                    rewardProgram.referralRewardCoins,
                    String(input.referredUserId),
                    JSON.stringify({ code: normalized }),
                ]
            )
        }

        await client.query("COMMIT")
        return outcome
    } catch (error) {
        await client.query("ROLLBACK")
        const err = error as { code?: string }
        if (err.code === "23505") {
            const again = await client.query(
                `SELECT status FROM signup_referrals WHERE referred_user_id = $1`,
                [input.referredUserId]
            )
            return { status: again.rows[0]?.status === "granted" ? "granted" : "rejected" }
        }
        throw error
    } finally {
        client.release()
    }
}

type PointsDashboard = {
    id: number
    pointsEarned: number
    pointsSpent: number
    pointsAvailable: number
}

export async function enrichDashboard<T extends PointsDashboard>(
    dashboard: T
): Promise<
    T & {
        validReferrals: number
        rewardProgram: RewardProgram
        giftCard: GiftCardAssessment
    }
> {
    const [credits, validReferrals] = await Promise.all([
        programCredits(dbPool, dashboard.id),
        validReferralCount(dbPool, dashboard.id),
    ])
    const pointsEarned = dashboard.pointsEarned + credits.credits
    const pointsSpent = dashboard.pointsSpent + credits.debits
    const pointsAvailable = Math.max(0, pointsEarned - pointsSpent)
    return {
        ...dashboard,
        pointsEarned,
        pointsSpent,
        pointsAvailable,
        validReferrals,
        rewardProgram,
        giftCard: assessGiftCard({ pointsAvailable, validReferrals, program: rewardProgram }),
    }
}

async function balanceForRedeem(client: Queryable, userId: number): Promise<{
    pointsAvailable: number
    validReferrals: number
}> {
    const user = await client.query(`SELECT email, global_code FROM global_users WHERE id = $1`, [userId])
    const email = user.rows[0]?.email ?? ""
    const globalCode = user.rows[0]?.global_code ?? ""
    const codes = await client.query(
        `SELECT code FROM referral_codes
         WHERE global_user_id = $1
            OR code = $2
            OR (owner_email IS NOT NULL AND LOWER(owner_email) = LOWER($3))`,
        [userId, globalCode, email]
    )
    const codeList = codes.rows.map((row: { code: string }) => row.code)
    let legacyEarned = 0
    let legacySpent = 0
    if (codeList.length > 0) {
        const balance = await client.query(
            `SELECT COALESCE(SUM(points_earned), 0)::int AS earned,
                    COALESCE(SUM(points_spent), 0)::int AS spent
             FROM referral_balances WHERE referrer_code = ANY($1)`,
            [codeList]
        )
        legacyEarned = Number(balance.rows[0]?.earned ?? 0)
        legacySpent = Number(balance.rows[0]?.spent ?? 0)
    }
    const install = await sumInstallRewardPoints(client, userId)
    const credits = await programCredits(client, userId)
    const validReferrals = await validReferralCount(client, userId)
    const pointsAvailable = Math.max(0, legacyEarned + install + credits.credits - legacySpent - credits.debits)
    return { pointsAvailable, validReferrals }
}

export async function redeemGiftCard(input: {
    userId: number
    email: string
    idempotencyKey: string
    denominationInr?: number
}): Promise<{
    success: true
    alreadyRedeemed: boolean
    points: number
    valueInr: number
}> {
    const program = rewardProgram
    if (input.denominationInr != null && input.denominationInr !== program.giftCardValueInr) {
        throw new RewardDenied(400, "That gift card is not available")
    }
    const cost = program.giftCardCostCoins
    const valueInr = program.giftCardValueInr
    const client = await dbPool.connect()
    try {
        await client.query("BEGIN")
        await client.query(`SELECT id FROM global_users WHERE id = $1 FOR UPDATE`, [input.userId])

        const existing = await client.query(
            `SELECT id, points_spent, denomination_inr
             FROM reward_redemptions
             WHERE user_id = $1 AND idempotency_key = $2`,
            [input.userId, input.idempotencyKey]
        )
        if (existing.rows[0]) {
            await client.query("COMMIT")
            return {
                success: true,
                alreadyRedeemed: true,
                points: Number(existing.rows[0].points_spent) || cost,
                valueInr: Number(existing.rows[0].denomination_inr) || valueInr,
            }
        }

        const balance = await balanceForRedeem(client, input.userId)
        const assessment = assessGiftCard({ ...balance, program })
        if (!assessment.eligible) {
            throw new RewardDenied(400, "Gift card is locked")
        }

        const user = await client.query(`SELECT global_code FROM global_users WHERE id = $1`, [input.userId])
        const code = String(user.rows[0]?.global_code ?? "")
        await client.query(
            `INSERT INTO reward_redemptions (
                referrer_code, contact_email, points_spent, status, user_id, denomination_inr, idempotency_key
             ) VALUES ($1, $2, $3, 'pending', $4, $5, $6)`,
            [code, input.email.toLowerCase(), cost, input.userId, valueInr, input.idempotencyKey]
        )
        await client.query(
            `INSERT INTO points_ledger (user_id, event_type, points, reference_id, metadata)
             VALUES ($1, $2, $3, $4, $5::jsonb)`,
            [
                input.userId,
                LEDGER_EVENT.GIFT_CARD_REDEEM,
                cost,
                input.idempotencyKey,
                JSON.stringify({ denominationInr: valueInr }),
            ]
        )
        await client.query("COMMIT")
        return { success: true, alreadyRedeemed: false, points: cost, valueInr }
    } catch (error) {
        await client.query("ROLLBACK")
        const err = error as { code?: string }
        if (err.code === "23505") {
            const again = await client.query(
                `SELECT points_spent, denomination_inr
                 FROM reward_redemptions
                 WHERE user_id = $1 AND idempotency_key = $2`,
                [input.userId, input.idempotencyKey]
            )
            if (again.rows[0]) {
                return {
                    success: true,
                    alreadyRedeemed: true,
                    points: Number(again.rows[0].points_spent) || cost,
                    valueInr: Number(again.rows[0].denomination_inr) || valueInr,
                }
            }
        }
        throw error
    } finally {
        client.release()
    }
}
