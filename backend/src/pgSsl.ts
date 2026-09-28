/**
 * Railway's public proxy presents a certificate Node does not trust by default.
 * `pg` also lets `sslmode` in the URL overwrite an `ssl` option, so strip it
 * and set `rejectUnauthorized` explicitly for any non-local database.
 * Local Postgres stays without SSL. Set DATABASE_SSL_REJECT_UNAUTHORIZED=true
 * when the server certificate is trusted (private network or a pinned CA).
 */
export function databasePoolConfig(
    databaseUrl: string,
    rejectUnauthorized: boolean
): {
    connectionString: string
    ssl?: { rejectUnauthorized: boolean }
} {
    let host = ""
    try {
        host = new URL(databaseUrl).hostname
    } catch {
        host = databaseUrl.match(/@([^/:?#]+)/)?.[1] ?? ""
    }
    const local = host === "localhost" || host === "127.0.0.1" || host === "::1"
    const sslDisabled = /[?&]sslmode=disable(?:&|$)/.test(databaseUrl)
    if (local || sslDisabled) {
        return { connectionString: databaseUrl }
    }
    const connectionString = databaseUrl
        .replace(/([?&])sslmode=[^&]*&/g, "$1")
        .replace(/([?&])sslmode=[^&]*$/g, "")
        .replace(/[?&]$/g, "")
    return { connectionString, ssl: { rejectUnauthorized } }
}
