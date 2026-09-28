import type { Pool, PoolClient } from "pg"

type Queryable = Pick<Pool | PoolClient, "query">

/** Sum of install-reward credits. Referral balances stay in referral_balances. */
export async function sumInstallRewardPoints(client: Queryable, userId: number): Promise<number> {
    const result = await client.query(
        `SELECT COALESCE(SUM(points), 0)::text AS earned
         FROM points_ledger
         WHERE user_id = $1 AND event_type = 'install_reward'`,
        [userId]
    )
    return parseInt(result.rows[0]?.earned ?? "0", 10) || 0
}
