import "dotenv/config"
import { accountCreateSettings } from "./accountVelocity"
import { resolveCorsOrigins } from "./securityPolicy"

function required(name: string, fallback?: string): string {
    const value = process.env[name] ?? fallback
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`)
    }
    return value
}

const isProd = process.env.NODE_ENV === "production"
const corsOrigins = resolveCorsOrigins(process.env.CORS_ORIGINS, process.env.NODE_ENV)
const accountCreate = accountCreateSettings(process.env)

if (isProd && corsOrigins.length === 0) {
    console.error(
        "CORS allowlist is empty after production filtering. Browser credentialed requests are denied."
    )
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
    corsOrigins,
    /** New global accounts per IP. Does not change referral qualification. */
    accountCreateLimit: accountCreate.limit,
    accountCreateWindowMs: accountCreate.windowMs,
    cookieSecure: isProd,
    /**
     * Remote Postgres defaults to accept Railway's proxy certificate.
     * Set DATABASE_SSL_REJECT_UNAUTHORIZED=true when the certificate is trusted.
     */
    databaseSslRejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true",
}

export const POINTS_PER_REFERRAL = 100
