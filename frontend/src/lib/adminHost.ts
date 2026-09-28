/** Canonical production console. The public marketing host does not serve this UI. */
export const ADMIN_CANONICAL_URL = "https://admin.koliath.in/"

/**
 * Cookie names must match backend/src/auth.ts.
 * Production admin cookies use the `__Host-` prefix (Secure, Path=/, no Domain).
 */
const PUBLIC_CSRF_COOKIE = "koliath_csrf"
const ADMIN_CSRF_COOKIE = "koliath_admin_csrf"

function normalizeHostname(hostname: string): string {
    return hostname.trim().toLowerCase().replace(/\.$/, "")
}

export function isDedicatedAdminHost(hostname?: string): boolean {
    const host = normalizeHostname(
        hostname ?? (typeof window === "undefined" ? "" : window.location.hostname)
    )
    if (host === "admin.koliath.in") return true
    if (import.meta.env.DEV && host === "admin.localhost") return true
    return false
}

export function csrfCookieName(hostname?: string): string {
    if (!isDedicatedAdminHost(hostname)) return PUBLIC_CSRF_COOKIE
    return import.meta.env.PROD ? `__Host-${ADMIN_CSRF_COOKIE}` : ADMIN_CSRF_COOKIE
}
