process.env.NODE_ENV = "test"
process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/koliath_install_test"
process.env.INSTALL_IP_HASH_SALT = "test-salt"
process.env.ADMIN_GOOGLE_SUBS = ""

import assert from "node:assert/strict"
import test from "node:test"
import { readRewardProgram } from "./program"

type DbModule = typeof import("../db")
type RewardsModule = typeof import("./service")

let db: DbModule
let rewards: RewardsModule
const program = readRewardProgram(process.env)

async function reset() {
    await db.dbPool.query(`
        TRUNCATE TABLE
            points_ledger,
            signup_referrals,
            browser_devices,
            reward_redemptions,
            referral_tracking_events,
            referral_events,
            referral_balances,
            referral_codes,
            app_account_links,
            global_users
        RESTART IDENTITY CASCADE
    `)
}

async function createUser(label: string) {
    const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const email = `${label}-${stamp}@example.com`
    const code = `KL-${stamp.slice(-8)}`.toUpperCase()
    const result = await db.dbPool.query(
        `INSERT INTO global_users (google_sub, email, display_name, global_code)
         VALUES ($1, $2, $3, $4) RETURNING id, email, global_code`,
        [`sub-${label}-${stamp}`, email, label, code]
    )
    return {
        id: Number(result.rows[0].id),
        email: String(result.rows[0].email),
        code: String(result.rows[0].global_code),
    }
}

async function ledgerCount(userId: number, eventType: string) {
    const result = await db.dbPool.query(
        `SELECT COUNT(*)::int AS n, COALESCE(SUM(points), 0)::int AS points
         FROM points_ledger WHERE user_id = $1 AND event_type = $2`,
        [userId, eventType]
    )
    return { count: Number(result.rows[0].n), points: Number(result.rows[0].points) }
}

test.before(async () => {
    db = await import("../db")
    await db.dbReady
    rewards = await import("./service")
    await reset()
})

test.beforeEach(async () => {
    await reset()
})

test.after(async () => {
    await db.dbPool.end()
})

test("first login reward is granted once under concurrency", async () => {
    const user = await createUser("first")
    const [first, second] = await Promise.all([
        rewards.awardFirstLoginReward(user.id),
        rewards.awardFirstLoginReward(user.id),
    ])
    const third = await rewards.awardFirstLoginReward(user.id)
    const granted = [first, second, third].filter((row) => row.granted)
    assert.equal(granted.length, 1)
    assert.equal(granted[0]?.points, program.firstLoginRewardCoins)
    assert.equal(third.granted, false)
    const stored = await ledgerCount(user.id, "FIRST_LOGIN_REWARD")
    assert.equal(stored.count, 1)
    assert.equal(stored.points, program.firstLoginRewardCoins)
})

test("self referral and same-device referral do not award", async () => {
    const referrer = await createUser("referrer")
    const referred = await createUser("referred")
    const self = await rewards.applySignupReferral({
        referredUserId: referrer.id,
        code: referrer.code,
        deviceKey: "device-referrer-only",
        ip: "203.0.113.8",
    })
    assert.deepEqual(self, { status: "rejected" })
    assert.equal((await ledgerCount(referrer.id, "REFERRAL_REWARD")).count, 0)
    const selfRow = await db.dbPool.query(
        `SELECT reject_reason FROM signup_referrals WHERE referred_user_id = $1`,
        [referrer.id]
    )
    assert.equal(selfRow.rows[0].reject_reason, "self_referral")

    await rewards.rememberBrowserDevice(referrer.id, "shared-browser-key")
    await rewards.rememberBrowserDevice(referred.id, "shared-browser-key")
    const farm = await rewards.applySignupReferral({
        referredUserId: referred.id,
        code: referrer.code,
        deviceKey: "shared-browser-key",
        ip: "203.0.113.9",
    })
    assert.deepEqual(farm, { status: "rejected" })
    assert.equal((await ledgerCount(referrer.id, "REFERRAL_REWARD")).count, 0)
    const farmRow = await db.dbPool.query(
        `SELECT reject_reason FROM signup_referrals WHERE referred_user_id = $1`,
        [referred.id]
    )
    assert.equal(farmRow.rows[0].reject_reason, "same_device")
})

test("a qualifying signup referral pays the referrer once", async () => {
    const referrer = await createUser("payer")
    const referred = await createUser("friend")
    await rewards.rememberBrowserDevice(referred.id, "friend-browser")
    const granted = await rewards.applySignupReferral({
        referredUserId: referred.id,
        code: referrer.code,
        deviceKey: "friend-browser",
        ip: "203.0.113.10",
    })
    assert.deepEqual(granted, { status: "granted" })
    const again = await rewards.applySignupReferral({
        referredUserId: referred.id,
        code: referrer.code,
        deviceKey: "friend-browser",
    })
    assert.deepEqual(again, { status: "granted" })
    const stored = await ledgerCount(referrer.id, "REFERRAL_REWARD")
    assert.equal(stored.count, 1)
    assert.equal(stored.points, program.referralRewardCoins)

    const loop = await rewards.applySignupReferral({
        referredUserId: referrer.id,
        code: referred.code,
        deviceKey: "referrer-other-browser",
    })
    assert.deepEqual(loop, { status: "rejected" })
    assert.equal((await ledgerCount(referred.id, "REFERRAL_REWARD")).count, 0)
})

test("eight granted referrals in an hour block the next one", async () => {
    const referrer = await createUser("fast")
    for (let i = 0; i < 8; i++) {
        const friend = await createUser(`burst-${i}`)
        await db.dbPool.query(
            `INSERT INTO signup_referrals (referrer_user_id, referred_user_id, code, status)
             VALUES ($1, $2, $3, 'granted')`,
            [referrer.id, friend.id, referrer.code]
        )
    }
    const next = await createUser("burst-next")
    const result = await rewards.applySignupReferral({
        referredUserId: next.id,
        code: referrer.code,
        deviceKey: `device-${next.id}-only`,
    })
    assert.deepEqual(result, { status: "rejected" })
    const row = await db.dbPool.query(
        `SELECT reject_reason FROM signup_referrals WHERE referred_user_id = $1`,
        [next.id]
    )
    assert.equal(row.rows[0].reject_reason, "velocity")
    assert.equal((await ledgerCount(referrer.id, "REFERRAL_REWARD")).count, 0)
})

test("gift card redeem fails closed and does not double-debit", async () => {
    const user = await createUser("redeemer")
    await assert.rejects(
        () => rewards.redeemGiftCard({ userId: user.id, email: user.email, idempotencyKey: "locked-key" }),
        (error: unknown) => error instanceof rewards.RewardDenied
    )
    const empty = await db.dbPool.query(`SELECT COUNT(*)::int AS n FROM reward_redemptions`)
    assert.equal(Number(empty.rows[0].n), 0)

    await db.dbPool.query(
        `INSERT INTO points_ledger (user_id, event_type, points, reference_id)
         VALUES ($1, 'REFERRAL_REWARD', $2, 'seed-coins')`,
        [user.id, program.giftCardCostCoins]
    )
    const short = await createUser("short-a")
    const shortB = await createUser("short-b")
    await db.dbPool.query(
        `INSERT INTO signup_referrals (referrer_user_id, referred_user_id, code, status)
         VALUES ($1, $2, 'KL-SHORT', 'granted'), ($1, $3, 'KL-SHORT', 'granted')`,
        [user.id, short.id, shortB.id]
    )
    await assert.rejects(
        () => rewards.redeemGiftCard({ userId: user.id, email: user.email, idempotencyKey: "need-referrals" }),
        (error: unknown) => error instanceof rewards.RewardDenied
    )
    assert.equal((await ledgerCount(user.id, "GIFT_CARD_REDEEM")).count, 0)

    const third = await createUser("short-c")
    await db.dbPool.query(
        `INSERT INTO signup_referrals (referrer_user_id, referred_user_id, code, status)
         VALUES ($1, $2, 'KL-SHORT', 'granted')`,
        [user.id, third.id]
    )
    const redeemed = await rewards.redeemGiftCard({
        userId: user.id,
        email: user.email,
        idempotencyKey: "gift-key-01",
    })
    assert.equal(redeemed.alreadyRedeemed, false)
    assert.equal(redeemed.points, program.giftCardCostCoins)
    assert.equal(redeemed.valueInr, program.giftCardValueInr)
    const replay = await rewards.redeemGiftCard({
        userId: user.id,
        email: user.email,
        idempotencyKey: "gift-key-01",
    })
    assert.equal(replay.alreadyRedeemed, true)
    const debit = await ledgerCount(user.id, "GIFT_CARD_REDEEM")
    assert.equal(debit.count, 1)
    assert.equal(debit.points, program.giftCardCostCoins)
    await assert.rejects(
        () => rewards.redeemGiftCard({ userId: user.id, email: user.email, idempotencyKey: "gift-key-02" }),
        (error: unknown) => error instanceof rewards.RewardDenied
    )
    assert.equal((await ledgerCount(user.id, "GIFT_CARD_REDEEM")).count, 1)
})
