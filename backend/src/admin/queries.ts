import { dbPool } from "../db"

function limitOf(value: unknown): number {
    const parsed = typeof value === "string" ? Number.parseInt(value, 10) : 50
    if (!Number.isFinite(parsed)) return 50
    return Math.min(100, Math.max(1, parsed))
}

export async function adminOverview() {
    const [users, apps, installs, rewards, fraud, risk] = await Promise.all([
        dbPool.query(`SELECT COUNT(*)::int AS n FROM global_users`),
        dbPool.query(`SELECT COUNT(*)::int AS n FROM apps`),
        dbPool.query(
            `SELECT status, COUNT(*)::int AS n
             FROM installation_verifications
             GROUP BY status`
        ),
        dbPool.query(
            `SELECT COALESCE(SUM(points), 0)::int AS points, COUNT(*)::int AS n
             FROM points_ledger WHERE event_type = 'install_reward'`
        ),
        dbPool.query(
            `SELECT COUNT(*)::int AS n FROM fraud_events
             WHERE created_at > NOW() - INTERVAL '24 hours'`
        ),
        dbPool.query(
            `SELECT risk_status, COUNT(*)::int AS n FROM global_users GROUP BY risk_status`
        ),
    ])
    return {
        users: users.rows[0]?.n ?? 0,
        apps: apps.rows[0]?.n ?? 0,
        installations: installs.rows,
        rewardCount: rewards.rows[0]?.n ?? 0,
        rewardPoints: rewards.rows[0]?.points ?? 0,
        fraudEventsLastDay: fraud.rows[0]?.n ?? 0,
        risk: risk.rows,
    }
}

export async function adminUsers(rawLimit: unknown) {
    const limit = limitOf(rawLimit)
    const result = await dbPool.query(
        `SELECT id, google_sub, email, display_name, account_status, risk_status,
                global_code, created_at, last_login_at
         FROM global_users
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit]
    )
    return result.rows
}

export async function adminUserAudit(userId: number) {
    const user = await dbPool.query(
        `SELECT id, google_sub, email, display_name, account_status, risk_status,
                global_code, created_at, last_login_at
         FROM global_users WHERE id = $1`,
        [userId]
    )
    if (!user.rows[0]) return null
    const [devices, installations, verifications, ledger, fraud] = await Promise.all([
        dbPool.query(
            `SELECT d.id, d.device_key, d.platform, ud.first_seen_at, ud.last_seen_at
             FROM user_devices ud
             JOIN devices d ON d.id = ud.device_id
             WHERE ud.user_id = $1
             ORDER BY ud.last_seen_at DESC
             LIMIT 50`,
            [userId]
        ),
        dbPool.query(
            `SELECT ai.installation_id, ai.first_seen_at, ai.last_seen_at, a.app_id, a.name, d.device_key
             FROM app_installations ai
             JOIN apps a ON a.id = ai.app_row_id
             JOIN devices d ON d.id = ai.device_id
             WHERE ai.user_id = $1
             ORDER BY ai.last_seen_at DESC
             LIMIT 50`,
            [userId]
        ),
        dbPool.query(
            `SELECT v.public_id, v.status, v.reject_reason, v.created_at, v.expires_at,
                    v.verified_at, v.rewarded_at, v.installation_id, a.app_id, a.name
             FROM installation_verifications v
             JOIN apps a ON a.id = v.app_row_id
             WHERE v.user_id = $1
             ORDER BY v.created_at DESC
             LIMIT 50`,
            [userId]
        ),
        dbPool.query(
            `SELECT id, event_type, points, installation_id, created_at, metadata
             FROM points_ledger
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT 50`,
            [userId]
        ),
        dbPool.query(
            `SELECT id, rule_id, severity, action, detail, created_at
             FROM fraud_events
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT 50`,
            [userId]
        ),
    ])
    return {
        user: user.rows[0],
        devices: devices.rows,
        installations: installations.rows,
        verifications: verifications.rows,
        ledger: ledger.rows,
        fraudEvents: fraud.rows,
    }
}

export async function adminSetUserStatus(
    userId: number,
    patch: { riskStatus?: string; accountStatus?: string }
) {
    const result = await dbPool.query(
        `UPDATE global_users
         SET risk_status = COALESCE($2, risk_status),
             account_status = COALESCE($3, account_status)
         WHERE id = $1
         RETURNING id, google_sub, email, account_status, risk_status`,
        [userId, patch.riskStatus ?? null, patch.accountStatus ?? null]
    )
    return result.rows[0] ?? null
}

export async function adminApps() {
    const result = await dbPool.query(
        `SELECT a.id, a.app_id, a.slug, a.name, a.package_id, a.platform, a.developer_name,
                a.company, a.status, a.points_awarded, a.created_at,
                u.google_sub AS owner_google_sub,
                (SELECT COUNT(*)::int FROM installation_verifications v
                  WHERE v.app_row_id = a.id AND v.status = 'REWARD_GRANTED') AS rewards
         FROM apps a
         LEFT JOIN global_users u ON u.id = a.owner_user_id
         ORDER BY a.created_at DESC
         LIMIT 100`
    )
    return result.rows
}

export async function adminUpdateApp(
    appId: string,
    patch: { status?: string; pointsAwarded?: number }
) {
    const result = await dbPool.query(
        `UPDATE apps
         SET status = COALESCE($2, status),
             points_awarded = COALESCE($3, points_awarded),
             updated_at = NOW()
         WHERE app_id = $1
         RETURNING app_id, name, status, points_awarded`,
        [appId, patch.status ?? null, patch.pointsAwarded ?? null]
    )
    return result.rows[0] ?? null
}

export async function adminInstallations(status: string | undefined, rawLimit: unknown) {
    const limit = limitOf(rawLimit)
    const result = status
        ? await dbPool.query(
              `SELECT v.public_id, v.status, v.reject_reason, v.created_at, v.expires_at,
                      v.verified_at, v.rewarded_at, v.installation_id, a.app_id, a.name,
                      u.id AS user_id, u.google_sub, u.risk_status
               FROM installation_verifications v
               JOIN apps a ON a.id = v.app_row_id
               JOIN global_users u ON u.id = v.user_id
               WHERE v.status = $1
               ORDER BY v.created_at DESC
               LIMIT $2`,
              [status, limit]
          )
        : await dbPool.query(
              `SELECT v.public_id, v.status, v.reject_reason, v.created_at, v.expires_at,
                      v.verified_at, v.rewarded_at, v.installation_id, a.app_id, a.name,
                      u.id AS user_id, u.google_sub, u.risk_status
               FROM installation_verifications v
               JOIN apps a ON a.id = v.app_row_id
               JOIN global_users u ON u.id = v.user_id
               ORDER BY v.created_at DESC
               LIMIT $1`,
              [limit]
          )
    return result.rows
}

export async function adminRewards(rawLimit: unknown) {
    const limit = limitOf(rawLimit)
    const result = await dbPool.query(
        `SELECT l.id, l.points, l.event_type, l.installation_id, l.created_at,
                u.id AS user_id, u.google_sub, a.app_id, a.name
         FROM points_ledger l
         JOIN global_users u ON u.id = l.user_id
         LEFT JOIN apps a ON a.id = l.app_row_id
         WHERE l.event_type = 'install_reward'
         ORDER BY l.created_at DESC
         LIMIT $1`,
        [limit]
    )
    return result.rows
}

export async function adminFraudEvents(rawLimit: unknown) {
    const limit = limitOf(rawLimit)
    const result = await dbPool.query(
        `SELECT f.id, f.rule_id, f.severity, f.action, f.detail, f.created_at,
                u.id AS user_id, u.google_sub, u.risk_status, a.app_id
         FROM fraud_events f
         LEFT JOIN global_users u ON u.id = f.user_id
         LEFT JOIN apps a ON a.id = f.app_row_id
         ORDER BY f.created_at DESC
         LIMIT $1`,
        [limit]
    )
    return result.rows
}

export async function adminDevices(rawLimit: unknown) {
    const limit = limitOf(rawLimit)
    const result = await dbPool.query(
        `SELECT d.id, d.device_key, d.platform, d.created_at, d.last_seen_at,
                COUNT(DISTINCT ud.user_id)::int AS accounts
         FROM devices d
         LEFT JOIN user_devices ud ON ud.device_id = d.id
         GROUP BY d.id
         ORDER BY accounts DESC, d.last_seen_at DESC
         LIMIT $1`,
        [limit]
    )
    return result.rows
}
