import type { PoolClient } from "pg"
import { config } from "../config"
import { dbPool } from "../db"
import { decideFraud, mergeThresholds, type FraudSignal, type FraudThresholds } from "../fraud/rules"
import { sumInstallRewardPoints } from "../ledger"
import { inspectAttestation, type AttestationInput } from "./attestation"
import { ACCOUNT_STATUS, INSTALL_STATUS, REWARD_EVENT, RISK_STATUS } from "./constants"
import { hashIp, mintPublicId, mintVerificationToken, sha256Hex, tokenPrefix, hashesEqual } from "./crypto"

export interface VerifyBody {
    verified: boolean
    reward_status: "granted" | "already_granted" | "rejected"
    points: number
    reason?: string
}

export interface VerifyResult {
    httpStatus: number
    body: VerifyBody
}

export interface VerifyInput {
    appRowId: number
    appId: string
    verificationToken: string
    installationId: string
    platform: "android" | "ios"
    deviceKey?: string
    osVersion?: string
    appVersion?: string
    attestation?: AttestationInput
    ip?: string
    userAgent?: string
    thresholds?: Partial<FraudThresholds>
}

export interface StartInput {
    userId: number
    slug?: string
    appId?: string
    platform?: "android" | "ios"
    installationId?: string
    ip?: string
    userAgent?: string
}

export interface StartResult {
    success: true
    status: typeof INSTALL_STATUS.PENDING_VERIFICATION
    verificationToken: string
    expiresAt: string
    appId: string
    sessionId: string
    pointsAwarded: 0
    pointsIfVerified: number
    alreadyRewarded: boolean
}

interface AppRow {
    id: number
    app_id: string
    slug: string | null
    platform: "android" | "ios"
    status: string
    points_awarded: number
    verification_config: unknown
}

function httpResult(httpStatus: number, body: VerifyBody): VerifyResult {
    return { httpStatus, body }
}

function rejected(httpStatus: number, reason: string): VerifyResult {
    return httpResult(httpStatus, { verified: false, reward_status: "rejected", points: 0, reason })
}

function isUniqueViolation(error: unknown, constraintPrefix: string): boolean {
    const err = error as { code?: string; constraint?: string }
    return err.code === "23505" && typeof err.constraint === "string" && err.constraint.startsWith(constraintPrefix)
}

function tokenTtlSeconds(verificationConfig: unknown): number {
    const fallback = config.installTokenTtlSeconds
    if (!verificationConfig || typeof verificationConfig !== "object") return fallback
    const raw = (verificationConfig as { tokenTtlSeconds?: unknown }).tokenTtlSeconds
    const parsed = typeof raw === "number" ? raw : Number.NaN
    if (!Number.isFinite(parsed)) return fallback
    return Math.min(86400, Math.max(60, Math.floor(parsed)))
}

function requireAttestation(verificationConfig: unknown): boolean {
    if (config.installRequireAttestation) return true
    if (!verificationConfig || typeof verificationConfig !== "object") return false
    return (verificationConfig as { requireAttestation?: unknown }).requireAttestation === true
}

async function pushStatus(
    client: PoolClient,
    verificationId: number,
    fromStatus: string | null,
    toStatus: string
) {
    await client.query(
        `INSERT INTO installation_status_events (verification_id, from_status, to_status)
         VALUES ($1, $2, $3)`,
        [verificationId, fromStatus, toStatus]
    )
}

async function recordAttempt(
    db: Pick<PoolClient, "query">,
    row: {
        appRowId?: number | null
        userId?: number | null
        ipHash: string | null
        tokenPrefix: string | null
        outcome: string
    }
) {
    await db.query(
        `INSERT INTO verification_attempts (app_row_id, user_id, ip_hash, token_prefix, outcome)
         VALUES ($1, $2, $3, $4, $5)`,
        [row.appRowId ?? null, row.userId ?? null, row.ipHash, row.tokenPrefix, row.outcome]
    )
}

async function findApp(
    input: { slug?: string; appId?: string; platform?: "android" | "ios" }
): Promise<AppRow | null> {
    if (input.appId) {
        const result = await dbPool.query(
            `SELECT id, app_id, slug, platform, status, points_awarded, verification_config
             FROM apps WHERE app_id = $1`,
            [input.appId]
        )
        return (result.rows[0] as AppRow | undefined) ?? null
    }
    const result = await dbPool.query(
        `SELECT id, app_id, slug, platform, status, points_awarded, verification_config
         FROM apps
         WHERE slug = $1
         ORDER BY CASE WHEN platform = $2 THEN 0 ELSE 1 END, id ASC
         LIMIT 1`,
        [input.slug, input.platform ?? "android"]
    )
    return (result.rows[0] as AppRow | undefined) ?? null
}

function rewardsEnabled(app: AppRow): boolean {
    return app.status === "active" && Number(app.points_awarded) > 0
}

export async function startInstallation(input: StartInput): Promise<StartResult> {
    const app = await findApp(input)
    if (!app) {
        throw Object.assign(new Error("Unknown app"), { status: 404 })
    }
    if (!rewardsEnabled(app)) {
        throw Object.assign(new Error("App is not approved for install rewards"), { status: 403 })
    }

    const client = await dbPool.connect()
    try {
        await client.query("BEGIN")
        const user = await client.query(
            `SELECT id, account_status, risk_status FROM global_users WHERE id = $1 FOR UPDATE`,
            [input.userId]
        )
        if (!user.rows[0]) {
            throw Object.assign(new Error("Account not found"), { status: 404 })
        }
        if (
            user.rows[0].account_status === ACCOUNT_STATUS.SUSPENDED ||
            user.rows[0].risk_status === RISK_STATUS.BLOCKED
        ) {
            throw Object.assign(
                new Error("Install verification is unavailable for this account"),
                { status: 403 }
            )
        }

        const rewarded = await client.query(
            `SELECT 1 FROM points_ledger
             WHERE user_id = $1 AND app_row_id = $2 AND event_type = $3
             LIMIT 1`,
            [input.userId, app.id, REWARD_EVENT]
        )
        const alreadyRewarded = rewarded.rows.length > 0
        const sessionId = mintPublicId("session")
        const publicId = mintPublicId("verification")
        const ttl = tokenTtlSeconds(app.verification_config)
        const ipHash = input.ip ? hashIp(config.installIpHashSalt, input.ip) : null
        const uaHash = input.userAgent ? sha256Hex(input.userAgent) : null

        let insertedId = 0
        let expiresAt = new Date()
        let plaintext = ""
        for (let attempt = 0; attempt < 4; attempt++) {
            const minted = mintVerificationToken()
            try {
                const inserted = await client.query(
                    `INSERT INTO installation_verifications (
                        public_id, user_id, app_row_id, token_hash, token_prefix, session_id,
                        hinted_installation_id, status, expires_at, ip_hash, user_agent_hash
                     ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, NOW() + ($9::int * INTERVAL '1 second'), $10, $11
                     ) RETURNING id, expires_at`,
                    [
                        publicId,
                        input.userId,
                        app.id,
                        minted.hash,
                        minted.prefix,
                        sessionId,
                        input.installationId ?? null,
                        INSTALL_STATUS.DOWNLOAD_STARTED,
                        ttl,
                        ipHash,
                        uaHash,
                    ]
                )
                insertedId = inserted.rows[0].id as number
                expiresAt = new Date(inserted.rows[0].expires_at as string | Date)
                plaintext = minted.token
                break
            } catch (error) {
                if (isUniqueViolation(error, "installation_verifications_token") && attempt < 3) {
                    continue
                }
                throw error
            }
        }
        if (!insertedId || !plaintext) {
            throw new Error("Failed to mint verification token")
        }

        await pushStatus(client, insertedId, null, INSTALL_STATUS.DOWNLOAD_STARTED)
        await client.query(
            `UPDATE installation_verifications SET status = $2 WHERE id = $1`,
            [insertedId, INSTALL_STATUS.PENDING_VERIFICATION]
        )
        await pushStatus(
            client,
            insertedId,
            INSTALL_STATUS.DOWNLOAD_STARTED,
            INSTALL_STATUS.PENDING_VERIFICATION
        )
        await client.query("COMMIT")

        return {
            success: true,
            status: INSTALL_STATUS.PENDING_VERIFICATION,
            verificationToken: plaintext,
            expiresAt: expiresAt.toISOString(),
            appId: app.app_id,
            sessionId,
            pointsAwarded: 0,
            pointsIfVerified: alreadyRewarded ? 0 : Number(app.points_awarded) || 0,
            alreadyRewarded,
        }
    } catch (error) {
        await client.query("ROLLBACK")
        throw error
    } finally {
        client.release()
    }
}

async function countRecentFailures(ipHash: string): Promise<number> {
    const result = await dbPool.query(
        `SELECT COUNT(*)::int AS n
         FROM verification_attempts
         WHERE ip_hash = $1
           AND outcome NOT IN ('granted', 'already_granted', 'rewards_disabled')
           AND created_at > NOW() - INTERVAL '1 hour'`,
        [ipHash]
    )
    return result.rows[0]?.n ?? 0
}

async function writeFraud(
    client: PoolClient,
    row: {
        userId: number
        appRowId: number
        deviceId: number | null
        verificationId: number
        signal: FraudSignal
    }
) {
    await client.query(
        `INSERT INTO fraud_events (
            user_id, app_row_id, device_id, verification_id, rule_id, severity, action, detail
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
        [
            row.userId,
            row.appRowId,
            row.deviceId,
            row.verificationId,
            row.signal.id,
            row.signal.severity,
            row.signal.effect,
            JSON.stringify(row.signal.detail ?? {}),
        ]
    )
}

async function raiseRisk(client: PoolClient, userId: number, riskStatus: string) {
    if (riskStatus === RISK_STATUS.NORMAL) return
    await client.query(
        `UPDATE global_users
         SET risk_status = CASE
            WHEN risk_status = 'BLOCKED' THEN 'BLOCKED'
            WHEN $2 = 'BLOCKED' THEN 'BLOCKED'
            WHEN risk_status = 'REVIEW' OR $2 = 'REVIEW' THEN 'REVIEW'
            ELSE risk_status
         END
         WHERE id = $1`,
        [userId, riskStatus]
    )
}

async function collectSignals(
    client: PoolClient,
    input: {
        userId: number
        appRowId: number
        deviceId: number
        installationId: string
        thresholds: FraudThresholds
        ipHash: string | null
        attestationOk: boolean
    }
): Promise<FraudSignal[]> {
    const signals: FraudSignal[] = []

    const accounts = await client.query(
        `SELECT COUNT(DISTINCT user_id)::int AS n FROM user_devices WHERE device_id = $1`,
        [input.deviceId]
    )
    const accountCount = accounts.rows[0]?.n ?? 0
    if (accountCount >= input.thresholds.deviceAccountsBlock) {
        signals.push({
            id: "device_many_accounts",
            severity: "high",
            effect: "deny_reward",
            suggestedRisk: "BLOCKED",
            detail: { accounts: accountCount },
        })
    } else if (accountCount >= input.thresholds.deviceAccountsDeny) {
        signals.push({
            id: "device_many_accounts",
            severity: "medium",
            effect: "deny_reward",
            suggestedRisk: "REVIEW",
            detail: { accounts: accountCount },
        })
    } else if (accountCount >= input.thresholds.deviceAccountsFlag) {
        signals.push({
            id: "device_many_accounts",
            severity: "low",
            effect: "flag",
            suggestedRisk: "REVIEW",
            detail: { accounts: accountCount },
        })
    }

    const priorDeviceReward = await client.query(
        `SELECT 1
         FROM points_ledger
         WHERE app_row_id = $1
           AND event_type = $2
           AND installation_id IN (
                SELECT installation_id FROM app_installations
                WHERE device_id = $3 AND app_row_id = $1
           )
         LIMIT 1`,
        [input.appRowId, REWARD_EVENT, input.deviceId]
    )
    if (priorDeviceReward.rows.length > 0) {
        signals.push({
            id: "same_device_same_app_reward",
            severity: "medium",
            effect: "deny_reward",
            suggestedRisk: "REVIEW",
            detail: {},
        })
    }

    const installationOwner = await client.query(
        `SELECT user_id FROM app_installations
         WHERE app_row_id = $1 AND installation_id = $2`,
        [input.appRowId, input.installationId]
    )
    const ownerId = installationOwner.rows[0]?.user_id as number | null | undefined
    if (ownerId && Number(ownerId) !== input.userId) {
        signals.push({
            id: "installation_linked_other_account",
            severity: "medium",
            effect: "deny_reward",
            suggestedRisk: "REVIEW",
            detail: {},
        })
    }

    const downloads = await client.query(
        `SELECT COUNT(*)::int AS n
         FROM installation_verifications
         WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
        [input.userId]
    )
    const downloadCount = downloads.rows[0]?.n ?? 0
    if (downloadCount >= input.thresholds.downloadsPerUserPerHourDeny) {
        signals.push({
            id: "download_velocity",
            severity: "medium",
            effect: "deny_reward",
            suggestedRisk: "REVIEW",
            detail: { downloads: downloadCount },
        })
    } else if (downloadCount >= input.thresholds.downloadsPerUserPerHourFlag) {
        signals.push({
            id: "download_velocity",
            severity: "low",
            effect: "flag",
            suggestedRisk: "REVIEW",
            detail: { downloads: downloadCount },
        })
    }

    if (input.ipHash) {
        const failures = await client.query(
            `SELECT COUNT(*)::int AS n
             FROM verification_attempts
             WHERE ip_hash = $1
               AND outcome NOT IN ('granted', 'already_granted', 'rewards_disabled')
               AND created_at > NOW() - INTERVAL '1 hour'`,
            [input.ipHash]
        )
        const failureCount = failures.rows[0]?.n ?? 0
        if (failureCount >= input.thresholds.verifyFailuresPerIpPerHour) {
            signals.push({
                id: "verify_velocity",
                severity: "medium",
                effect: "deny_reward",
                suggestedRisk: "REVIEW",
                detail: { failures: failureCount },
            })
        }
    }

    if (!input.attestationOk) {
        signals.push({
            id: "attestation_required",
            severity: "medium",
            effect: "deny_reward",
            suggestedRisk: "REVIEW",
            detail: {},
        })
    }

    return signals
}

async function finishRejected(
    client: PoolClient,
    row: {
        id: number
        fromStatus: string
        toStatus: string
        reason: string
        userId: number
        appRowId: number
        ipHash: string | null
        prefix: string
        outcome: string
    }
) {
    await client.query(
        `UPDATE installation_verifications
         SET status = $2, reject_reason = $3, consumed_at = COALESCE(consumed_at, NOW())
         WHERE id = $1`,
        [row.id, row.toStatus, row.reason]
    )
    await pushStatus(client, row.id, row.fromStatus, row.toStatus)
    await recordAttempt(client, {
        appRowId: row.appRowId,
        userId: row.userId,
        ipHash: row.ipHash,
        tokenPrefix: row.prefix,
        outcome: row.outcome,
    })
}

export async function verifyInstallation(input: VerifyInput): Promise<VerifyResult> {
    const thresholds = mergeThresholds(input.thresholds)
    const prefix = tokenPrefix(input.verificationToken)
    const ipHash = input.ip ? hashIp(config.installIpHashSalt, input.ip) : null
    const presentedHash = sha256Hex(input.verificationToken)

    if (!prefix) {
        if (ipHash) {
            await recordAttempt(dbPool, {
                ipHash,
                tokenPrefix: null,
                outcome: "invalid_token",
            })
        }
        return rejected(400, "invalid_token")
    }

    if (ipHash) {
        const failures = await countRecentFailures(ipHash)
        if (failures >= thresholds.verifyFailuresPerIpPerHour) {
            await recordAttempt(dbPool, {
                appRowId: input.appRowId,
                ipHash,
                tokenPrefix: prefix,
                outcome: "rate_limited",
            })
            return rejected(429, "rate_limited")
        }
    }

    const client = await dbPool.connect()
    try {
        await client.query("BEGIN")
        const locked = await client.query(
            `SELECT id, public_id, user_id, app_row_id, token_hash, status, expires_at,
                    consumed_at, reject_reason, installation_id
             FROM installation_verifications
             WHERE token_prefix = $1
             FOR UPDATE`,
            [prefix]
        )
        const row = locked.rows[0]
        if (!row || !hashesEqual(String(row.token_hash), presentedHash)) {
            await recordAttempt(client, {
                appRowId: input.appRowId,
                ipHash,
                tokenPrefix: prefix,
                outcome: "invalid_token",
            })
            await client.query("COMMIT")
            return rejected(400, "invalid_token")
        }

        const verificationId = row.id as number
        const userId = Number(row.user_id)
        const fromStatus = String(row.status)

        if (Number(row.app_row_id) !== input.appRowId || input.appId.length === 0) {
            await finishRejected(client, {
                id: verificationId,
                fromStatus,
                toStatus: INSTALL_STATUS.REJECTED,
                reason: "wrong_app",
                userId,
                appRowId: input.appRowId,
                ipHash,
                prefix,
                outcome: "wrong_app",
            })
            await client.query("COMMIT")
            return rejected(400, "wrong_app")
        }

        if (row.consumed_at || fromStatus === INSTALL_STATUS.REWARD_GRANTED) {
            if (fromStatus === INSTALL_STATUS.REWARD_GRANTED) {
                await writeFraud(client, {
                    userId,
                    appRowId: input.appRowId,
                    deviceId: null,
                    verificationId,
                    signal: {
                        id: "token_replay",
                        severity: "low",
                        effect: "flag",
                        suggestedRisk: "NORMAL",
                        detail: {},
                    },
                })
                await recordAttempt(client, {
                    appRowId: input.appRowId,
                    userId,
                    ipHash,
                    tokenPrefix: prefix,
                    outcome: "already_granted",
                })
                await client.query("COMMIT")
                return httpResult(200, {
                    verified: true,
                    reward_status: "already_granted",
                    points: 0,
                })
            }
            const prior = String(row.reject_reason ?? "")
            const reason =
                fromStatus === INSTALL_STATUS.EXPIRED || prior === "expired"
                    ? "expired"
                    : prior === "wrong_app"
                      ? "wrong_app"
                      : "replay"
            await recordAttempt(client, {
                appRowId: input.appRowId,
                userId,
                ipHash,
                tokenPrefix: prefix,
                outcome: reason,
            })
            await client.query("COMMIT")
            return rejected(400, reason)
        }

        const expiresAt = new Date(row.expires_at as string | Date)
        if (expiresAt.getTime() <= Date.now()) {
            await finishRejected(client, {
                id: verificationId,
                fromStatus,
                toStatus: INSTALL_STATUS.EXPIRED,
                reason: "expired",
                userId,
                appRowId: input.appRowId,
                ipHash,
                prefix,
                outcome: "expired",
            })
            await client.query("COMMIT")
            return rejected(400, "expired")
        }

        const user = await client.query(
            `SELECT id, account_status, risk_status FROM global_users WHERE id = $1 FOR UPDATE`,
            [userId]
        )
        const account = user.rows[0]
        if (!account) {
            await client.query("ROLLBACK")
            return rejected(400, "invalid_token")
        }

        const app = await client.query(
            `SELECT id, app_id, platform, status, points_awarded, verification_config
             FROM apps WHERE id = $1 FOR SHARE`,
            [input.appRowId]
        )
        const appRow = app.rows[0] as AppRow | undefined
        if (!appRow || appRow.status !== "active" || appRow.app_id !== input.appId) {
            await finishRejected(client, {
                id: verificationId,
                fromStatus,
                toStatus: INSTALL_STATUS.REJECTED,
                reason: "wrong_app",
                userId,
                appRowId: input.appRowId,
                ipHash,
                prefix,
                outcome: "wrong_app",
            })
            await client.query("COMMIT")
            return rejected(400, "wrong_app")
        }

        if (appRow.platform !== input.platform) {
            await recordAttempt(client, {
                appRowId: input.appRowId,
                userId,
                ipHash,
                tokenPrefix: prefix,
                outcome: "invalid_request",
            })
            await client.query("COMMIT")
            return rejected(400, "invalid_request")
        }

        if (
            account.account_status === ACCOUNT_STATUS.SUSPENDED ||
            account.risk_status === RISK_STATUS.BLOCKED
        ) {
            await writeFraud(client, {
                userId,
                appRowId: input.appRowId,
                deviceId: null,
                verificationId,
                signal: {
                    id: "account_ineligible",
                    severity: "high",
                    effect: "deny_reward",
                    suggestedRisk: "BLOCKED",
                    detail: {},
                },
            })
            await finishRejected(client, {
                id: verificationId,
                fromStatus,
                toStatus: INSTALL_STATUS.REJECTED,
                reason: "not_eligible",
                userId,
                appRowId: input.appRowId,
                ipHash,
                prefix,
                outcome: "rejected",
            })
            await client.query("COMMIT")
            return rejected(200, "rejected")
        }

        const deviceKey = input.deviceKey ? `app:${input.deviceKey}` : `inst:${input.installationId}`
        const device = await client.query(
            `INSERT INTO devices (device_key, platform)
             VALUES ($1, $2)
             ON CONFLICT (device_key) DO UPDATE SET
                last_seen_at = NOW(),
                platform = EXCLUDED.platform
             RETURNING id`,
            [deviceKey, input.platform]
        )
        const deviceId = Number(device.rows[0].id)

        await client.query(
            `INSERT INTO user_devices (user_id, device_id)
             VALUES ($1, $2)
             ON CONFLICT (user_id, device_id) DO UPDATE SET last_seen_at = NOW()`,
            [userId, deviceId]
        )
        await client.query(
            `INSERT INTO app_installations (app_row_id, device_id, installation_id, user_id)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (app_row_id, installation_id) DO UPDATE SET
                last_seen_at = NOW(),
                device_id = EXCLUDED.device_id,
                user_id = COALESCE(app_installations.user_id, EXCLUDED.user_id)`,
            [input.appRowId, deviceId, input.installationId, userId]
        )

        const attestation = await inspectAttestation(input.attestation, {
            requireAttestation: requireAttestation(appRow.verification_config),
        })
        const signals = await collectSignals(client, {
            userId,
            appRowId: input.appRowId,
            deviceId,
            installationId: input.installationId,
            thresholds,
            ipHash,
            attestationOk: attestation.okForReward,
        })
        const decision = decideFraud(signals)
        for (const signal of signals) {
            await writeFraud(client, {
                userId,
                appRowId: input.appRowId,
                deviceId,
                verificationId,
                signal,
            })
        }
        await raiseRisk(client, userId, decision.riskStatus)

        const metadata = {
            attestation: attestation.status,
            attestationProvider: attestation.provider,
            osVersion: input.osVersion ?? null,
            appVersion: input.appVersion ?? null,
        }
        await client.query(
            `UPDATE installation_verifications
             SET installation_id = $2, device_id = $3, metadata = metadata || $4::jsonb
             WHERE id = $1`,
            [verificationId, input.installationId, deviceId, JSON.stringify(metadata)]
        )

        if (!decision.grantReward) {
            const denying = signals.filter((signal) => signal.effect === "deny_reward")
            const attestationOnly =
                denying.length === 1 && denying[0]?.id === "attestation_required"
            await finishRejected(client, {
                id: verificationId,
                fromStatus,
                toStatus: INSTALL_STATUS.SUSPICIOUS,
                reason: attestationOnly ? "attestation_required" : "suspicious",
                userId,
                appRowId: input.appRowId,
                ipHash,
                prefix,
                outcome: "rejected",
            })
            await client.query("COMMIT")
            return rejected(200, attestationOnly ? "attestation_required" : "rejected")
        }

        const points = Math.max(0, Math.min(10000, Number(appRow.points_awarded) || 0))
        if (points <= 0) {
            await recordAttempt(client, {
                appRowId: input.appRowId,
                userId,
                ipHash,
                tokenPrefix: prefix,
                outcome: "rewards_disabled",
            })
            await client.query("COMMIT")
            return rejected(403, "rewards_disabled")
        }

        await client.query(
            `UPDATE installation_verifications
             SET status = $2, verified_at = NOW(), consumed_at = NOW()
             WHERE id = $1`,
            [verificationId, INSTALL_STATUS.VERIFIED]
        )
        await pushStatus(client, verificationId, fromStatus, INSTALL_STATUS.VERIFIED)

        try {
            await client.query("SAVEPOINT reward_insert")
            await client.query(
                `INSERT INTO points_ledger (
                    user_id, installation_id, verification_id, app_row_id, event_type, points, metadata
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
                [
                    userId,
                    input.installationId,
                    verificationId,
                    input.appRowId,
                    REWARD_EVENT,
                    points,
                    JSON.stringify({ appId: appRow.app_id, publicId: row.public_id }),
                ]
            )
            await client.query("RELEASE SAVEPOINT reward_insert")
        } catch (error) {
            if (!isUniqueViolation(error, "points_ledger_")) throw error
            await client.query("ROLLBACK TO SAVEPOINT reward_insert")
            await finishRejected(client, {
                id: verificationId,
                fromStatus: INSTALL_STATUS.VERIFIED,
                toStatus: INSTALL_STATUS.REJECTED,
                reason: "already_rewarded",
                userId,
                appRowId: input.appRowId,
                ipHash,
                prefix,
                outcome: "already_granted",
            })
            await client.query("COMMIT")
            return httpResult(200, {
                verified: true,
                reward_status: "already_granted",
                points: 0,
            })
        }

        await client.query(
            `UPDATE installation_verifications
             SET status = $2, rewarded_at = NOW()
             WHERE id = $1`,
            [verificationId, INSTALL_STATUS.REWARD_GRANTED]
        )
        await pushStatus(client, verificationId, INSTALL_STATUS.VERIFIED, INSTALL_STATUS.REWARD_GRANTED)
        await recordAttempt(client, {
            appRowId: input.appRowId,
            userId,
            ipHash,
            tokenPrefix: prefix,
            outcome: "granted",
        })
        await client.query("COMMIT")
        return httpResult(200, {
            verified: true,
            reward_status: "granted",
            points,
        })
    } catch (error) {
        await client.query("ROLLBACK")
        throw error
    } finally {
        client.release()
    }
}

export async function installPointsForUser(userId: number): Promise<number> {
    return sumInstallRewardPoints(dbPool, userId)
}
