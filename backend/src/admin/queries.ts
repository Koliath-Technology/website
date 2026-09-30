import { dbPool } from "../db"

/**
 * Test helper for approving an app the way the admin console used to.
 * HTTP admin routes are not mounted on this service. Operators use
 * https://admin.koliath.in (Koliath-Technology/website-admin).
 */
export async function adminUpdateApp(
    appId: string,
    patch: { status?: string; pointsAwarded?: number; requireAttestation?: boolean }
) {
    const result = await dbPool.query(
        `UPDATE apps
         SET status = COALESCE($2, status),
             points_awarded = COALESCE($3, points_awarded),
             verification_config = CASE
                WHEN $4::boolean IS NULL THEN verification_config
                ELSE COALESCE(verification_config, '{}'::jsonb)
                     || jsonb_build_object('requireAttestation', $4::boolean)
             END,
             updated_at = NOW()
         WHERE app_id = $1
         RETURNING app_id, name, status, points_awarded, verification_config`,
        [
            appId,
            patch.status ?? null,
            patch.pointsAwarded ?? null,
            patch.requireAttestation ?? null,
        ]
    )
    return result.rows[0] ?? null
}
