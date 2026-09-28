import { randomBytes } from "crypto"
import type { Request, Response, NextFunction } from "express"
import { cert, getApps, initializeApp, type App } from "firebase-admin/app"
import { getAuth, type DecodedIdToken } from "firebase-admin/auth"
import { config } from "./config"
import { firebaseCredentialStatus, normalizePrivateKey } from "./firebaseCredentials"
import { logError } from "./redact"
import { secretsEqual } from "./secrets"

const MAX_ID_TOKEN_LENGTH = 8192

export const SESSION_COOKIE = "koliath_session"
export const CSRF_COOKIE = "koliath_csrf"

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

export interface AuthUser {
    googleSub: string
    email: string
    name: string
    picture?: string
    emailVerified: boolean
    /** Unix seconds from the verified Google token. */
    expiresAt: number
}

declare global {
    namespace Express {
        interface Request {
            authUser?: AuthUser
        }
    }
}

export function safePictureUrl(url: string | null | undefined): string | undefined {
    if (!url) return undefined
    try {
        const parsed = new URL(url)
        if (parsed.protocol !== "https:") return undefined
        const host = parsed.hostname.toLowerCase()
        if (host === "googleusercontent.com" || host.endsWith(".googleusercontent.com")) {
            return parsed.toString()
        }
        return undefined
    } catch {
        return undefined
    }
}

let adminApp: App | undefined

function firebaseAdminApp(): App {
    if (!firebaseCredentialStatus().configured) {
        throw Object.assign(new Error("Firebase Auth is not configured"), { status: 503 })
    }
    if (adminApp) return adminApp
    const existing = getApps()[0]
    if (existing) {
        adminApp = existing
        return existing
    }
    try {
        adminApp = initializeApp({
            credential: cert({
                projectId: config.firebaseProjectId,
                clientEmail: config.firebaseClientEmail,
                privateKey: normalizePrivateKey(config.firebasePrivateKey),
            }),
        })
        return adminApp
    } catch (error) {
        logError("firebase admin init failed", error)
        throw Object.assign(new Error("Firebase Auth is not configured"), { status: 503 })
    }
}

function googleSubject(decoded: DecodedIdToken): string | null {
    if (decoded.firebase?.sign_in_provider !== "google.com") return null
    const identities = decoded.firebase.identities?.["google.com"]
    const subject = Array.isArray(identities) ? identities[0] : undefined
    return typeof subject === "string" && subject.length > 0 ? subject : null
}

/**
 * Verifies a Firebase ID token from Google sign-in.
 * The account key stays the Google subject inside the Firebase token so the
 * existing global_users.google_sub ledger does not fork onto a Firebase uid.
 */
export async function verifyFirebaseIdToken(idToken: string): Promise<AuthUser> {
    if (idToken.length > MAX_ID_TOKEN_LENGTH) {
        throw Object.assign(new Error("Invalid Firebase token"), { status: 401 })
    }

    let decoded: DecodedIdToken
    try {
        decoded = await getAuth(firebaseAdminApp()).verifyIdToken(idToken)
    } catch (error: unknown) {
        const status =
            typeof error === "object" && error && "status" in error
                ? Number((error as { status: number }).status)
                : 401
        if (status === 503) throw error
        logError("firebase token rejected", error)
        throw Object.assign(new Error("Invalid Firebase token"), { status: 401 })
    }

    const subject = googleSubject(decoded)
    if (!subject || !decoded.email || decoded.email_verified === false) {
        throw Object.assign(new Error("Google account not verified"), { status: 401 })
    }

    const profile = decoded as DecodedIdToken & { name?: string; picture?: string }
    return {
        googleSub: subject,
        email: decoded.email.toLowerCase(),
        name: profile.name ?? decoded.email,
        picture: safePictureUrl(profile.picture),
        emailVerified: true,
        expiresAt: decoded.exp,
    }
}

function extractBearer(req: Request): string | null {
    const header = req.headers.authorization
    if (!header?.startsWith("Bearer ")) return null
    return header.slice(7).trim() || null
}

function sessionToken(req: Request): string | null {
    const value = req.cookies?.[SESSION_COOKIE]
    return typeof value === "string" && value.length > 0 ? value : null
}

export function csrfHeaderValid(req: Request): boolean {
    const header = req.get("x-csrf-token") ?? ""
    const cookie = req.cookies?.[CSRF_COOKIE]
    if (typeof cookie !== "string" || cookie.length === 0 || header.length === 0) return false
    return secretsEqual(header, cookie)
}

function cookieOptions(httpOnly: boolean, maxAge?: number) {
    return {
        httpOnly,
        secure: config.cookieSecure,
        sameSite: "lax" as const,
        path: "/",
        ...(maxAge !== undefined ? { maxAge } : {}),
    }
}

/** Browser session: httpOnly Google token plus a readable CSRF cookie. */
export function setSessionCookies(res: Response, idToken: string, expiresAtSec: number): void {
    const maxAge = Math.min(Math.max(expiresAtSec * 1000 - Date.now(), 0), 60 * 60 * 1000)
    const csrf = randomBytes(32).toString("hex")
    res.cookie(SESSION_COOKIE, idToken, cookieOptions(true, maxAge))
    res.cookie(CSRF_COOKIE, csrf, cookieOptions(false, maxAge))
}

export function clearSessionCookies(res: Response): void {
    res.clearCookie(SESSION_COOKIE, cookieOptions(true))
    res.clearCookie(CSRF_COOKIE, cookieOptions(false))
}

export function authFailure(error: unknown): { status: number; message: string } {
    const status =
        typeof error === "object" && error && "status" in error
            ? Number((error as { status: number }).status)
            : 401
    if (status === 503) return { status: 503, message: "Firebase Auth is not configured" }
    if (status === 403) return { status: 403, message: "Forbidden" }
    return { status: 401, message: "Authentication failed" }
}

/**
 * Firebase ID token via Authorization: Bearer (mobile apps) or the httpOnly
 * session cookie (browser). Cookie-authenticated mutations also need the
 * CSRF header that matches koliath_csrf.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
    try {
        const bearer = extractBearer(req)
        const cookie = sessionToken(req)
        if (!bearer && cookie && !SAFE_METHODS.has(req.method) && !csrfHeaderValid(req)) {
            return res.status(403).json({ success: false, message: "CSRF check failed" })
        }
        const token = bearer ?? cookie
        if (!token) {
            return res.status(401).json({ success: false, message: "Authentication required" })
        }
        req.authUser = await verifyFirebaseIdToken(token)
        return next()
    } catch (error: unknown) {
        logError("auth rejected", error)
        const { status, message } = authFailure(error)
        return res.status(status).json({ success: false, message })
    }
}

/** Optional auth — attaches user when token present, otherwise continues. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
    try {
        const token = extractBearer(req) ?? sessionToken(req)
        if (token) {
            req.authUser = await verifyFirebaseIdToken(token)
        }
    } catch (error: unknown) {
        logError("optional auth ignored", error)
    }
    return next()
}

/**
 * Shared secret for trusted mobile/backend webhooks.
 * An empty secret is accepted only when NODE_ENV is exactly "development".
 * Production, test, and an unset NODE_ENV all fail closed.
 */
export function requireAppWebhook(req: Request, res: Response, next: NextFunction) {
    if (!config.appWebhookSecret) {
        if (process.env.NODE_ENV === "development") {
            return next()
        }
        return res.status(503).json({ success: false, message: "Webhook secret not configured" })
    }
    const secret = req.headers["x-koliath-webhook-secret"]
    if (typeof secret !== "string" || !secretsEqual(secret, config.appWebhookSecret)) {
        return res.status(401).json({ success: false, message: "Invalid webhook secret" })
    }
    return next()
}
