import fs from "fs"
import path from "path"
import type { Pool } from "pg"

/**
 * Applies backend/migrations/*.sql in filename order.
 * Each file runs in one transaction and is recorded in schema_migrations.
 * Statements are idempotent. Boot calls this before listen, which is the
 * Railway migrate path. cwd does not matter; the folder sits next to dist/.
 */
export async function applySqlMigrations(pool: Pool): Promise<void> {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `)

    const dir = path.resolve(__dirname, "../migrations")
    if (!fs.existsSync(dir)) {
        throw new Error(`Migration directory missing at ${dir}`)
    }
    const files = fs
        .readdirSync(dir)
        .filter((name) => name.endsWith(".sql"))
        .sort()

    for (const file of files) {
        const seen = await pool.query(`SELECT 1 FROM schema_migrations WHERE id = $1`, [file])
        if (seen.rows.length > 0) continue

        const sql = fs.readFileSync(path.join(dir, file), "utf8")
        const client = await pool.connect()
        try {
            await client.query("BEGIN")
            await client.query(sql)
            await client.query(`INSERT INTO schema_migrations (id) VALUES ($1)`, [file])
            await client.query("COMMIT")
        } catch (error) {
            await client.query("ROLLBACK")
            throw error
        } finally {
            client.release()
        }
    }
}
