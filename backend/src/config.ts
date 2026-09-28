import "dotenv/config"

function required(name: string, fallback?: string): string {
    const value = process.env[name] ?? fallback
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`)
    }
    return value
}

const isProd = process.env.NODE_ENV === "production"

function clampTokenTtl(value: string | undefined): number {
    const parsed = Number(value ?? 1800)
    if (!Number.isFinite(parsed)) return 1800
    return Math.min(86400, Math.max(60, Math.floor(parsed)))
}

export const config = {
    port: Number(process.env.PORT ?? 3000),
    isProd,
    databaseUrl: required(
        "DATABASE_URL",
        isProd ? undefined : "postgres://postgres:postgres@localhost:5433/mydb"
    ),
    /** Firebase Admin. All three are required before a session or protected route succeeds. */
    firebaseProjectId: process.env.FIREBASE_PROJECT_ID ?? "",
    firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL ?? "",
    firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY ?? "",
    /** Shared secret for trusted app backends (Sapient, Adverts, Diabetic) to post qualification events. */
    appWebhookSecret: process.env.APP_WEBHOOK_SECRET ?? "",
    corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:5173,https://koliath.in,https://www.koliath.in")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    cookieSecure: isProd,
    /**
     * Remote Postgres defaults to accept Railway's proxy certificate.
     * Set DATABASE_SSL_REJECT_UNAUTHORIZED=true when the certificate is trusted.
     */
    databaseSslRejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true",
    /**
     * Google provider subjects or Firebase Auth uids allowed to open the admin API.
     * Empty denies everyone.
     */
    adminGoogleSubs: (process.env.ADMIN_GOOGLE_SUBS ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    /** Lifetime of a download verification token. Clamped to 60–86400 seconds. */
    installTokenTtlSeconds: clampTokenTtl(process.env.INSTALL_TOKEN_TTL_SECONDS),
    /** Salt for hashed client IPs used only as a fraud velocity key. */
    installIpHashSalt: process.env.INSTALL_IP_HASH_SALT || "koliath-dev-ip-salt",
    /**
     * Fleet-wide override. When true, every verify requires attestation and
     * the v1 stubs fail closed. Per-app false does not turn this off.
     */
    installRequireAttestation: process.env.INSTALL_REQUIRE_ATTESTATION === "true",
}

export const POINTS_PER_REFERRAL = 100
