process.env.NODE_ENV = "test"
process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/koliath_install_test"
process.env.INSTALL_IP_HASH_SALT = "test-salt"

import assert from "node:assert/strict"
import type { Server } from "node:http"
import test from "node:test"

type DbModule = typeof import("../db")
type InstallModule = typeof import("./service")
type AppsModule = typeof import("../apps/service")
type AdminModule = typeof import("../admin/queries")

let db: DbModule
let installs: InstallModule
let apps: AppsModule
let admin: AdminModule

async function reset() {
    await db.dbPool.query(`
        TRUNCATE TABLE
            points_ledger,
            fraud_events,
            verification_attempts,
            installation_status_events,
            installation_verifications,
            app_installations,
            user_devices,
            devices,
            app_credentials,
            apps,
            reward_redemptions,
            signup_referrals,
            browser_devices,
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
    const result = await db.dbPool.query(
        `INSERT INTO global_users (google_sub, email, display_name, global_code)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [`sub-${label}-${stamp}`, `${label}-${stamp}@example.com`, label, `KL-${stamp.slice(-8)}`.toUpperCase()]
    )
    return Number(result.rows[0].id)
}

async function createOwnedApp(ownerId: number, points = 100) {
    const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const app = await apps.registerDeveloperApp({
        ownerUserId: ownerId,
        name: `Test ${stamp}`,
        packageId: `in.koliath.test.${stamp}`,
        platform: "android",
        developerName: "Test",
        verificationConfig: {},
    })
    await admin.adminUpdateApp(app.appId, { status: "active", pointsAwarded: points })
    const credential = await apps.issueAppCredential(app.id)
    return { app, secret: credential.secret, prefix: credential.prefix }
}

async function authorizedVerify(input: {
    secret: string
    appId: string
    token: string
    installationId: string
    deviceKey?: string
    attestation?: { playIntegrityToken?: string }
    ip?: string
    thresholds?: {
        deviceAccountsFlag?: number
        deviceAccountsDeny?: number
        deviceAccountsBlock?: number
        verifyFailuresPerIpPerHour?: number
    }
}) {
    const auth = await apps.authenticateAppSecret(input.secret)
    assert.equal(auth.ok, true)
    if (!auth.ok) throw new Error("expected credential")
    return installs.verifyInstallation({
        appRowId: auth.credential.appRowId,
        appId: input.appId,
        verificationToken: input.token,
        installationId: input.installationId,
        platform: "android",
        deviceKey: input.deviceKey,
        attestation: input.attestation,
        ip: input.ip ?? "203.0.113.10",
        thresholds: input.thresholds,
    })
}

async function rewardTotal(userId?: number) {
    const result = await db.dbPool.query(
        `SELECT COALESCE(SUM(points), 0)::int AS points, COUNT(*)::int AS n
         FROM points_ledger
         WHERE event_type = 'install_reward' AND ($1::int IS NULL OR user_id = $1)`,
        [userId ?? null]
    )
    return { points: Number(result.rows[0].points), count: Number(result.rows[0].n) }
}

test.before(async () => {
    db = await import("../db")
    await db.dbReady
    installs = await import("./service")
    apps = await import("../apps/service")
    admin = await import("../admin/queries")
    await reset()
})

test.beforeEach(async () => {
    await reset()
})

test.after(async () => {
    await db.dbPool.end()
})

test("legitimate start does not award points and verify grants them once", async () => {
    const userId = await createUser("happy")
    const { app, secret } = await createOwnedApp(userId, 80)
    const started = await installs.startInstallation({
        userId,
        appId: app.appId,
        platform: "android",
        ip: "203.0.113.10",
    })
    assert.equal(started.pointsAwarded, 0)
    assert.equal(started.status, "PENDING_VERIFICATION")
    assert.equal(started.pointsIfVerified, 80)
    assert.equal((await rewardTotal(userId)).count, 0)

    const stored = await db.dbPool.query(
        `SELECT token_hash, token_prefix, status FROM installation_verifications WHERE user_id = $1`,
        [userId]
    )
    assert.equal(stored.rows[0].status, "PENDING_VERIFICATION")
    assert.equal(String(stored.rows[0].token_hash).includes(started.verificationToken), false)
    assert.notEqual(stored.rows[0].token_hash, started.verificationToken)

    const secretRow = await db.dbPool.query(
        `SELECT secret_hash, secret_prefix FROM app_credentials WHERE secret_prefix = $1`,
        [secret.split(".")[0]]
    )
    assert.equal(String(secretRow.rows[0].secret_hash).includes(secret), false)

    const verified = await authorizedVerify({
        secret,
        appId: app.appId,
        token: started.verificationToken,
        installationId: "install-happy-1",
    })
    assert.equal(verified.httpStatus, 200)
    assert.deepEqual(verified.body, { verified: true, reward_status: "granted", points: 80 })
    assert.deepEqual(await rewardTotal(userId), { points: 80, count: 1 })

    const status = await db.dbPool.query(
        `SELECT status FROM installation_verifications WHERE user_id = $1`,
        [userId]
    )
    assert.equal(status.rows[0].status, "REWARD_GRANTED")
})

test("invalid, expired, and wrong-app tokens do not award points", async () => {
    const userId = await createUser("badtoken")
    const { app, secret } = await createOwnedApp(userId, 40)
    const other = await createOwnedApp(userId, 40)
    const started = await installs.startInstallation({
        userId,
        appId: app.appId,
        platform: "android",
        ip: "203.0.113.11",
    })

    const invalid = await authorizedVerify({
        secret,
        appId: app.appId,
        token: `${started.verificationToken.slice(0, 16)}corruptedtokenvalue`,
        installationId: "install-bad-1",
        ip: "203.0.113.11",
    })
    assert.equal(invalid.body.reason, "invalid_token")
    assert.equal(invalid.body.verified, false)

    await db.dbPool.query(
        `UPDATE installation_verifications SET expires_at = NOW() - INTERVAL '1 minute' WHERE user_id = $1`,
        [userId]
    )
    const expired = await authorizedVerify({
        secret,
        appId: app.appId,
        token: started.verificationToken,
        installationId: "install-bad-1",
        ip: "203.0.113.11",
    })
    assert.equal(expired.body.reason, "expired")
    assert.equal((await rewardTotal(userId)).count, 0)

    const fresh = await installs.startInstallation({
        userId,
        appId: app.appId,
        platform: "android",
        ip: "203.0.113.11",
    })
    const wrongApp = await authorizedVerify({
        secret: other.secret,
        appId: other.app.appId,
        token: fresh.verificationToken,
        installationId: "install-bad-2",
        ip: "203.0.113.11",
    })
    assert.equal(wrongApp.body.reason, "wrong_app")
    assert.equal((await rewardTotal()).count, 0)
})

test("replaying a successful verification awards points only once", async () => {
    const userId = await createUser("replay")
    const { app, secret } = await createOwnedApp(userId, 25)
    const started = await installs.startInstallation({
        userId,
        appId: app.appId,
        platform: "android",
        ip: "203.0.113.12",
    })
    const first = await authorizedVerify({
        secret,
        appId: app.appId,
        token: started.verificationToken,
        installationId: "install-replay-1",
        ip: "203.0.113.12",
    })
    const second = await authorizedVerify({
        secret,
        appId: app.appId,
        token: started.verificationToken,
        installationId: "install-replay-1",
        ip: "203.0.113.12",
    })
    assert.equal(first.body.reward_status, "granted")
    assert.equal(first.body.points, 25)
    assert.equal(second.body.reward_status, "already_granted")
    assert.equal(second.body.points, 0)
    assert.deepEqual(await rewardTotal(userId), { points: 25, count: 1 })
    const fraud = await db.dbPool.query(
        `SELECT rule_id FROM fraud_events WHERE user_id = $1 AND rule_id = 'token_replay'`,
        [userId]
    )
    assert.equal(fraud.rows.length, 1)
    const risk = await db.dbPool.query(`SELECT risk_status FROM global_users WHERE id = $1`, [userId])
    assert.equal(risk.rows[0].risk_status, "NORMAL")
})

test("concurrent verifies of one token grant the reward once", async () => {
    const userId = await createUser("race")
    const { app, secret } = await createOwnedApp(userId, 100)
    const started = await installs.startInstallation({
        userId,
        appId: app.appId,
        platform: "android",
        ip: "203.0.113.13",
    })
    const results = await Promise.all(
        Array.from({ length: 8 }, () =>
            authorizedVerify({
                secret,
                appId: app.appId,
                token: started.verificationToken,
                installationId: "install-race-1",
                ip: "203.0.113.13",
            })
        )
    )
    const granted = results.filter((result) => result.body.reward_status === "granted")
    const points = results.reduce((sum, result) => sum + result.body.points, 0)
    assert.equal(granted.length, 1)
    assert.equal(points, 100)
    assert.deepEqual(await rewardTotal(userId), { points: 100, count: 1 })
})

test("concurrent verifies from separate downloads still grant once", async () => {
    const userId = await createUser("twotokens")
    const { app, secret } = await createOwnedApp(userId, 60)
    const starts = await Promise.all(
        Array.from({ length: 5 }, () =>
            installs.startInstallation({
                userId,
                appId: app.appId,
                platform: "android",
                ip: "203.0.113.14",
            })
        )
    )
    const results = await Promise.all(
        starts.map((started, index) =>
            authorizedVerify({
                secret,
                appId: app.appId,
                token: started.verificationToken,
                installationId: `install-two-${index}`,
                ip: "203.0.113.14",
            })
        )
    )
    const granted = results.filter((result) => result.body.reward_status === "granted")
    assert.equal(granted.length, 1)
    assert.equal(granted[0]?.body.points, 60)
    assert.deepEqual(await rewardTotal(userId), { points: 60, count: 1 })
})

test("the same app-generated device across accounts is flagged and does not block on the first shared use", async () => {
    const firstUser = await createUser("device-a")
    const secondUser = await createUser("device-b")
    const firstApp = await createOwnedApp(firstUser, 30)
    const secondApp = await createOwnedApp(firstUser, 30)
    const firstStart = await installs.startInstallation({
        userId: firstUser,
        appId: firstApp.app.appId,
        platform: "android",
        ip: "203.0.113.15",
    })
    const secondStart = await installs.startInstallation({
        userId: secondUser,
        appId: secondApp.app.appId,
        platform: "android",
        ip: "203.0.113.16",
    })
    const thresholds = { deviceAccountsFlag: 2, deviceAccountsDeny: 50, deviceAccountsBlock: 80 }
    const first = await authorizedVerify({
        secret: firstApp.secret,
        appId: firstApp.app.appId,
        token: firstStart.verificationToken,
        installationId: "install-device-a",
        deviceKey: "device-shared-key",
        ip: "203.0.113.15",
        thresholds,
    })
    const second = await authorizedVerify({
        secret: secondApp.secret,
        appId: secondApp.app.appId,
        token: secondStart.verificationToken,
        installationId: "install-device-b",
        deviceKey: "device-shared-key",
        ip: "203.0.113.16",
        thresholds,
    })
    assert.equal(first.body.reward_status, "granted")
    assert.equal(second.body.reward_status, "granted")
    const risk = await db.dbPool.query(`SELECT risk_status FROM global_users WHERE id = $1`, [secondUser])
    assert.equal(risk.rows[0].risk_status, "REVIEW")
    assert.notEqual(risk.rows[0].risk_status, "BLOCKED")
    const fraud = await db.dbPool.query(
        `SELECT rule_id FROM fraud_events WHERE user_id = $1 AND rule_id = 'device_many_accounts'`,
        [secondUser]
    )
    assert.equal(fraud.rows.length, 1)
    assert.equal((await rewardTotal()).count, 2)
})

test("a device that already earned the same app reward does not earn it again", async () => {
    const firstUser = await createUser("same-a")
    const secondUser = await createUser("same-b")
    const { app, secret } = await createOwnedApp(firstUser, 45)
    const firstStart = await installs.startInstallation({
        userId: firstUser,
        appId: app.appId,
        platform: "android",
        ip: "203.0.113.17",
    })
    const secondStart = await installs.startInstallation({
        userId: secondUser,
        appId: app.appId,
        platform: "android",
        ip: "203.0.113.18",
    })
    await authorizedVerify({
        secret,
        appId: app.appId,
        token: firstStart.verificationToken,
        installationId: "install-same-a",
        deviceKey: "device-same-app",
        ip: "203.0.113.17",
        thresholds: { deviceAccountsFlag: 9, deviceAccountsDeny: 9, deviceAccountsBlock: 9 },
    })
    const second = await authorizedVerify({
        secret,
        appId: app.appId,
        token: secondStart.verificationToken,
        installationId: "install-same-b",
        deviceKey: "device-same-app",
        ip: "203.0.113.18",
        thresholds: { deviceAccountsFlag: 9, deviceAccountsDeny: 9, deviceAccountsBlock: 9 },
    })
    assert.equal(second.body.verified, false)
    assert.equal(second.body.reward_status, "rejected")
    assert.equal(second.body.points, 0)
    assert.deepEqual(await rewardTotal(), { points: 45, count: 1 })
    const risk = await db.dbPool.query(`SELECT risk_status FROM global_users WHERE id = $1`, [secondUser])
    assert.equal(risk.rows[0].risk_status, "REVIEW")
})

test("excessive verify failures reject the next attempt", async () => {
    const userId = await createUser("velocity")
    const { app, secret } = await createOwnedApp(userId, 15)
    const started = await installs.startInstallation({
        userId,
        appId: app.appId,
        platform: "android",
        ip: "203.0.113.19",
    })
    for (let i = 0; i < 3; i++) {
        const failed = await authorizedVerify({
            secret,
            appId: app.appId,
            token: `kvt_invalidtokenvalue${i}xxxxx`,
            installationId: "install-velocity-1",
            ip: "203.0.113.19",
            thresholds: { verifyFailuresPerIpPerHour: 3 },
        })
        assert.equal(failed.body.reason, "invalid_token")
    }
    const limited = await authorizedVerify({
        secret,
        appId: app.appId,
        token: started.verificationToken,
        installationId: "install-velocity-1",
        ip: "203.0.113.19",
        thresholds: { verifyFailuresPerIpPerHour: 3 },
    })
    assert.equal(limited.httpStatus, 429)
    assert.equal(limited.body.reason, "rate_limited")
    assert.equal((await rewardTotal(userId)).count, 0)
})

test("invalid and revoked credentials are rejected and a malformed body is not rewarded", async () => {
    const userId = await createUser("http")
    const { app, secret } = await createOwnedApp(userId, 10)
    const rotated = await apps.issueAppCredential(app.id)
    const { app: expressApp } = await import("../index")
    const server: Server = await new Promise((resolve) => {
        const listening = expressApp.listen(0, "127.0.0.1", () => resolve(listening))
    })
    const address = server.address()
    const port = typeof address === "object" && address ? address.port : 0
    const url = `http://127.0.0.1:${port}/api/v1/installations/verify`
    const payload = {
        verification_token: "kvt_notarealtokenvalue123456",
        app_id: app.appId,
        installation_id: "install-http-1",
        platform: "android",
    }
    try {
        const invalid = await fetch(url, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: "Bearer kol_notreal.notasecretvalue",
            },
            body: JSON.stringify(payload),
        })
        const invalidBody = (await invalid.json()) as { verified: boolean; reason: string }
        assert.equal(invalid.status, 401)
        assert.equal(invalidBody.verified, false)
        assert.equal(invalidBody.reason, "invalid_credentials")

        const revoked = await fetch(url, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${secret}`,
            },
            body: JSON.stringify(payload),
        })
        const revokedBody = (await revoked.json()) as { reason: string }
        assert.equal(revoked.status, 401)
        assert.equal(revokedBody.reason, "invalid_credentials")

        const malformed = await fetch(url, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${rotated.secret}`,
            },
            body: JSON.stringify({ verification_token: "short", app_id: app.appId }),
        })
        const malformedBody = (await malformed.json()) as { reason: string; points: number }
        assert.equal(malformed.status, 400)
        assert.equal(malformedBody.reason, "invalid_request")
        assert.equal(malformedBody.points, 0)
        assert.equal((await rewardTotal()).count, 0)
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()))
        })
    }
})

test("a freshly registered developer app cannot grant install rewards until an admin approves it", async () => {
    const userId = await createUser("farm")
    const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const app = await apps.registerDeveloperApp({
        ownerUserId: userId,
        name: `Farm ${stamp}`,
        packageId: `in.koliath.farm.${stamp}`,
        platform: "android",
        developerName: "Farmer",
        verificationConfig: { tokenTtlSeconds: 600 },
    })
    assert.equal(app.status, "pending")
    assert.equal(app.pointsAwarded, 0)
    const storedConfig = app.verificationConfig as { requireAttestation?: boolean; tokenTtlSeconds?: number }
    assert.equal(storedConfig.requireAttestation, undefined)
    assert.equal(storedConfig.tokenTtlSeconds, 600)

    await assert.rejects(
        () =>
            installs.startInstallation({
                userId,
                appId: app.appId,
                platform: "android",
                ip: "203.0.113.40",
            }),
        (error: unknown) => {
            const err = error as { status?: number; message?: string }
            assert.equal(err.status, 403)
            assert.match(err.message ?? "", /not approved/)
            return true
        }
    )

    const credential = await apps.issueAppCredential(app.id)
    const auth = await apps.authenticateAppSecret(credential.secret)
    assert.equal(auth.ok, false)
    if (!auth.ok) assert.equal(auth.reason, "app_inactive")
    assert.equal((await rewardTotal(userId)).count, 0)

    await admin.adminUpdateApp(app.appId, { status: "active", pointsAwarded: 40 })
    const started = await installs.startInstallation({
        userId,
        appId: app.appId,
        platform: "android",
        ip: "203.0.113.40",
    })
    const verified = await authorizedVerify({
        secret: credential.secret,
        appId: app.appId,
        token: started.verificationToken,
        installationId: "install-farm-1",
        ip: "203.0.113.40",
    })
    assert.equal(verified.body.reward_status, "granted")
    assert.equal(verified.body.points, 40)
    assert.deepEqual(await rewardTotal(userId), { points: 40, count: 1 })
})

test("zero reward points do not consume the token, and a later admin award still pays it", async () => {
    const userId = await createUser("zeropts")
    const { app, secret } = await createOwnedApp(userId, 50)
    const started = await installs.startInstallation({
        userId,
        appId: app.appId,
        platform: "android",
        ip: "203.0.113.41",
    })
    await admin.adminUpdateApp(app.appId, { pointsAwarded: 0 })
    const held = await authorizedVerify({
        secret,
        appId: app.appId,
        token: started.verificationToken,
        installationId: "install-zero-1",
        ip: "203.0.113.41",
    })
    assert.equal(held.httpStatus, 403)
    assert.equal(held.body.reason, "rewards_disabled")
    assert.equal(held.body.points, 0)
    const pending = await db.dbPool.query(
        `SELECT status, consumed_at FROM installation_verifications WHERE user_id = $1`,
        [userId]
    )
    assert.equal(pending.rows[0].status, "PENDING_VERIFICATION")
    assert.equal(pending.rows[0].consumed_at, null)
    assert.equal((await rewardTotal(userId)).count, 0)

    await admin.adminUpdateApp(app.appId, { pointsAwarded: 50 })
    const granted = await authorizedVerify({
        secret,
        appId: app.appId,
        token: started.verificationToken,
        installationId: "install-zero-1",
        ip: "203.0.113.41",
    })
    assert.equal(granted.body.reward_status, "granted")
    assert.equal(granted.body.points, 50)
    assert.deepEqual(await rewardTotal(userId), { points: 50, count: 1 })
})

test("required attestation fails closed while the Play Integrity stub is unconfigured", async () => {
    const userId = await createUser("attest")
    const { app, secret } = await createOwnedApp(userId, 20)
    const updated = await admin.adminUpdateApp(app.appId, { requireAttestation: true })
    assert.equal(updated.verification_config.requireAttestation, true)
    const started = await installs.startInstallation({
        userId,
        appId: app.appId,
        platform: "android",
        ip: "203.0.113.42",
    })
    const missing = await authorizedVerify({
        secret,
        appId: app.appId,
        token: started.verificationToken,
        installationId: "install-attest-1",
        ip: "203.0.113.42",
    })
    assert.equal(missing.httpStatus, 200)
    assert.equal(missing.body.verified, false)
    assert.equal(missing.body.reason, "attestation_required")
    assert.equal(missing.body.points, 0)

    const second = await installs.startInstallation({
        userId,
        appId: app.appId,
        platform: "android",
        ip: "203.0.113.42",
    })
    const stubbed = await authorizedVerify({
        secret,
        appId: app.appId,
        token: second.verificationToken,
        installationId: "install-attest-2",
        attestation: { playIntegrityToken: "play-integrity-token-value" },
        ip: "203.0.113.42",
    })
    assert.equal(stubbed.body.reason, "attestation_required")
    assert.equal((await rewardTotal(userId)).count, 0)
})
