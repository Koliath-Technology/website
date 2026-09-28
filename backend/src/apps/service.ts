import { dbPool } from "../db"
import { hashesEqual, mintAppSecret, mintPublicId, secretPrefix, sha256Hex } from "../installations/crypto"

export interface RegisteredApp {
    id: number
    appId: string
    slug: string | null
    name: string
    packageId: string
    platform: "android" | "ios"
    developerName: string
    company: string | null
    status: string
    pointsAwarded: number
    verificationConfig: unknown
    createdAt: string
}

export interface AppCredentialSummary {
    prefix: string
    createdAt: string
    rotatedAt: string | null
    revokedAt: string | null
}

export interface AppStats {
    pending: number
    verified: number
    rejected: number
    rewardPoints: number
}

interface AppRecord extends RegisteredApp {
    ownerUserId: number | null
}

function mapApp(row: {
    id: number
    app_id: string
    slug: string | null
    name: string
    package_id: string
    platform: "android" | "ios"
    developer_name: string
    company: string | null
    status: string
    points_awarded: number
    verification_config: unknown
    owner_user_id: number | null
    created_at: Date | string
}): AppRecord {
    return {
        id: row.id,
        appId: row.app_id,
        slug: row.slug,
        name: row.name,
        packageId: row.package_id,
        platform: row.platform,
        developerName: row.developer_name,
        company: row.company,
        status: row.status,
        pointsAwarded: row.points_awarded,
        verificationConfig: row.verification_config,
        ownerUserId: row.owner_user_id,
        createdAt: new Date(row.created_at).toISOString(),
    }
}

const APP_COLUMNS = `id, app_id, slug, name, package_id, platform, developer_name, company,
    status, points_awarded, verification_config, owner_user_id, created_at`

export async function registerDeveloperApp(input: {
    ownerUserId: number
    name: string
    packageId: string
    platform: "android" | "ios"
    developerName: string
    company?: string
    pointsAwarded: number
    slug?: string
    verificationConfig: Record<string, unknown>
}): Promise<RegisteredApp> {
    const appId = mintPublicId("app")
    try {
        const result = await dbPool.query(
            `INSERT INTO apps (
                app_id, slug, name, package_id, platform, developer_name, company,
                status, points_awarded, verification_config, owner_user_id
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $9::jsonb, $10)
             RETURNING ${APP_COLUMNS}`,
            [
                appId,
                input.slug ?? null,
                input.name,
                input.packageId,
                input.platform,
                input.developerName,
                input.company ?? null,
                input.pointsAwarded,
                JSON.stringify(input.verificationConfig),
                input.ownerUserId,
            ]
        )
        const app = mapApp(result.rows[0])
        return app
    } catch (error) {
        const err = error as { code?: string }
        if (err.code === "23505") {
            throw Object.assign(new Error("An app with that package or slug already exists"), {
                status: 409,
            })
        }
        throw error
    }
}

export async function listAppsForOwner(ownerUserId: number): Promise<RegisteredApp[]> {
    const result = await dbPool.query(
        `SELECT ${APP_COLUMNS} FROM apps WHERE owner_user_id = $1 ORDER BY created_at DESC`,
        [ownerUserId]
    )
    return result.rows.map((row) => mapApp(row))
}

export async function getAppByPublicId(appId: string): Promise<AppRecord | null> {
    const result = await dbPool.query(`SELECT ${APP_COLUMNS} FROM apps WHERE app_id = $1`, [appId])
    return result.rows[0] ? mapApp(result.rows[0]) : null
}

export async function listCredentialSummaries(appRowId: number): Promise<AppCredentialSummary[]> {
    const result = await dbPool.query(
        `SELECT secret_prefix, created_at, rotated_at, revoked_at
         FROM app_credentials
         WHERE app_row_id = $1
         ORDER BY created_at DESC`,
        [appRowId]
    )
    return result.rows.map((row) => ({
        prefix: String(row.secret_prefix),
        createdAt: new Date(row.created_at as string | Date).toISOString(),
        rotatedAt: row.rotated_at ? new Date(row.rotated_at as string | Date).toISOString() : null,
        revokedAt: row.revoked_at ? new Date(row.revoked_at as string | Date).toISOString() : null,
    }))
}

export async function appStats(appRowId: number): Promise<AppStats> {
    const counts = await dbPool.query(
        `SELECT
            (COUNT(*) FILTER (WHERE status = 'PENDING_VERIFICATION'))::int AS pending,
            (COUNT(*) FILTER (WHERE status IN ('VERIFIED', 'REWARD_GRANTED')))::int AS verified,
            (COUNT(*) FILTER (WHERE status IN ('REJECTED', 'SUSPICIOUS', 'EXPIRED')))::int AS rejected
         FROM installation_verifications
         WHERE app_row_id = $1`,
        [appRowId]
    )
    const rewards = await dbPool.query(
        `SELECT COALESCE(SUM(points), 0)::int AS points
         FROM points_ledger
         WHERE app_row_id = $1 AND event_type = 'install_reward'`,
        [appRowId]
    )
    return {
        pending: counts.rows[0]?.pending ?? 0,
        verified: counts.rows[0]?.verified ?? 0,
        rejected: counts.rows[0]?.rejected ?? 0,
        rewardPoints: rewards.rows[0]?.points ?? 0,
    }
}

/** Creates the first secret or revokes the active one and issues a replacement. Plaintext is returned once. */
export async function issueAppCredential(appRowId: number): Promise<{
    secret: string
    prefix: string
    createdAt: string
}> {
    const client = await dbPool.connect()
    try {
        await client.query("BEGIN")
        await client.query(
            `UPDATE app_credentials
             SET revoked_at = COALESCE(revoked_at, NOW()), rotated_at = NOW()
             WHERE app_row_id = $1 AND revoked_at IS NULL`,
            [appRowId]
        )
        let created: { secret: string; prefix: string; createdAt: string } | null = null
        for (let attempt = 0; attempt < 4; attempt++) {
            const minted = mintAppSecret()
            try {
                const inserted = await client.query(
                    `INSERT INTO app_credentials (app_row_id, secret_hash, secret_prefix)
                     VALUES ($1, $2, $3)
                     RETURNING created_at`,
                    [appRowId, minted.hash, minted.prefix]
                )
                created = {
                    secret: minted.secret,
                    prefix: minted.prefix,
                    createdAt: new Date(inserted.rows[0].created_at as string | Date).toISOString(),
                }
                break
            } catch (error) {
                const err = error as { code?: string; constraint?: string }
                if (err.code === "23505" && attempt < 3) continue
                throw error
            }
        }
        if (!created) throw new Error("Failed to mint app credential")
        await client.query("COMMIT")
        return created
    } catch (error) {
        await client.query("ROLLBACK")
        throw error
    } finally {
        client.release()
    }
}

export interface ResolvedCredential {
    credentialId: number
    appRowId: number
    appId: string
}

export async function authenticateAppSecret(
    secret: string
): Promise<
    | { ok: true; credential: ResolvedCredential }
    | { ok: false; reason: "invalid_credentials" | "app_inactive" }
> {
    const prefix = secretPrefix(secret)
    const candidateHash = sha256Hex(secret)
    if (!prefix) {
        hashesEqual(sha256Hex("missing-credential"), candidateHash)
        return { ok: false, reason: "invalid_credentials" }
    }

    const result = await dbPool.query(
        `SELECT c.id, c.secret_hash, c.revoked_at, a.id AS app_row_id, a.app_id, a.status
         FROM app_credentials c
         JOIN apps a ON a.id = c.app_row_id
         WHERE c.secret_prefix = $1`,
        [prefix]
    )
    const row = result.rows[0]
    const stored = row ? String(row.secret_hash) : sha256Hex("missing-credential")
    const matches = hashesEqual(stored, candidateHash)
    if (!row || row.revoked_at || !matches) {
        return { ok: false, reason: "invalid_credentials" }
    }
    if (row.status !== "active") {
        return { ok: false, reason: "app_inactive" }
    }
    return {
        ok: true,
        credential: {
            credentialId: Number(row.id),
            appRowId: Number(row.app_row_id),
            appId: String(row.app_id),
        },
    }
}

export function canManageApp(
    app: { ownerUserId: number | null },
    userId: number,
    isAdmin: boolean
): boolean {
    if (isAdmin) return true
    return app.ownerUserId != null && app.ownerUserId === userId
}
