import { randomBytes } from "crypto"
import type { Request, Response, NextFunction } from "express"
import { OAuth2Client } from "google-auth-library"
import { config } from "./config"
import { logError } from "./redact"
import { secretsEqual } from "./secrets"

const client = new OAuth2Client(config.googleClientId)

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

export async function verifyGoogleIdToken(idToken: string): Promise<AuthUser> {
    if (!config.googleClientId) {
        throw Object.assign(new Error("Google Sign-In is not configured"), { status: 503 })
    }
    if (idToken.length > 4096) {
        throw Object.assign(new Error("Invalid Google token"), { status: 401 })
    }

    const ticket = await client.verifyIdToken({
        idToken,
        audience: config.googleClientId,
    })
    const payload = ticket.getPayload()
    if (!payload?.sub || !payload.email) {
        throw Object.assign(new Error("Invalid Google token"), { status: 401 })
    }
    if (payload.email_verified === false) {
        throw Object.assign(new Error("Email not verified with Google"), { status: 401 })
    }

    return {
        googleSub: payload.sub,
        email: payload.email.toLowerCase(),
        name: payload.name ?? payload.email,
        picture: safePictureUrl(payload.picture),
        emailVerified: true,
        expiresAt: payload.exp ?? Math.floor(Date.now() / 1000) + 50 * 60,
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
    if (status === 503) return { status: 503, message: "Google Sign-In is not configured" }
    if (status === 403) return { status: 403, message: "Forbidden" }
    return { status: 401, message: "Authentication failed" }
}

/**
 * Google ID token via Authorization: Bearer (mobile apps) or the httpOnly
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
        req.authUser = await verifyGoogleIdToken(token)
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
            req.authUser = await verifyGoogleIdToken(token)
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
