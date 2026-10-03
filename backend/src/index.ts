import fs from "fs"
import path from "path"
import express from "express"
import cors from "cors"
import helmet from "helmet"
import cookieParser from "cookie-parser"
import rateLimit from "express-rate-limit"
import { config } from "./config"
import { logError } from "./redact"
import {
    SESSION_COOKIE,
    authFailure,
    clearSessionCookies,
    csrfHeaderValid,
    requireAuth,
    requireAppWebhook,
    setSessionCookies,
    verifyFirebaseIdToken,
} from "./auth"
import { firebaseCredentialStatus } from "./firebaseCredentials"
import { listPublicRules, REFERRALS_REQUIRED, REWARD_GATE_COPY } from "./rules"
import {
    referralStatsQuerySchema,
    redeemRewardSchema,
    referralEventSchema,
    referralTrackingSchema,
    registerReferralSchema,
    googleSessionSchema,
    linkAppAccountSchema,
    qualifyReferralSchema,
} from "./types/types"
import {
    getReferralStats,
    getAllRewards,
    createRedemption,
    createReferralEvent,
    trackReferralEvent,
    validateReferralCode,
    registerReferralCode,
    upsertGlobalUser,
    getGlobalUserByGoogleSub,
    getDashboardForUser,
    linkAppAccount,
    userOwnsCode,
    qualifyReferral,
    getHubSnapshot,
    recordInstall,
} from "./db"

const app = express()

app.set("trust proxy", 1)

app.use(
    helmet({
        contentSecurityPolicy: {
            useDefaults: true,
            directives: {
                defaultSrc: ["'self'"],
                baseUri: ["'self'"],
                objectSrc: ["'none'"],
                frameAncestors: ["'self'"],
                formAction: ["'self'"],
                scriptSrc: ["'self'", "https://accounts.google.com", "https://apis.google.com"],
                styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
                imgSrc: [
                    "'self'",
                    "data:",
                    "https://*.googleusercontent.com",
                    "https://*.gstatic.com",
                ],
                connectSrc: [
                    "'self'",
                    "https://accounts.google.com",
                    "https://identitytoolkit.googleapis.com",
                    "https://securetoken.googleapis.com",
                    "https://www.googleapis.com",
                    "https://apis.google.com",
                ],
                frameSrc: [
                    "https://accounts.google.com",
                    "https://*.firebaseapp.com",
                    "https://*.web.app",
                    "https://apis.google.com",
                ],
                // TLS is terminated by Railway. Forcing an upgrade here breaks
                // the documented local HTTP smoke test.
                upgradeInsecureRequests: null,
            },
        },
        // GIS sign-in opens a Google window. same-origin COOP blocks that popup.
        crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
        crossOriginResourcePolicy: { policy: "same-site" },
    })
)

app.use((_req, res, next) => {
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    next()
})

app.use(cookieParser())

app.use(
    cors({
        origin(origin, callback) {
            if (!origin || config.corsOrigins.includes(origin)) {
                callback(null, true)
                return
            }
            callback(new Error("Not allowed by CORS"))
        },
        credentials: true,
    })
)

app.use(express.json({ limit: "32kb" }))

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
})
app.use(generalLimiter)

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 40,
    message: { success: false, message: "Too many auth attempts" },
})

const trackingLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, message: "Too many tracking requests" },
})

function health(_req: express.Request, res: express.Response) {
    res.status(200).json({ ok: true, service: "koliath-rewards" })
}

app.get("/health", health)
app.get("/api/health", health)

app.get("/api/referral-rules", (_req, res) => {
    res.status(200).json({
        referralsRequired: REFERRALS_REQUIRED,
        rewardGate: REWARD_GATE_COPY,
        rules: listPublicRules(),
    })
})

app.get("/api/hub", async (_req, res) => {
    try {
        const hub = await getHubSnapshot()
        res.status(200).json({ rewardGate: REWARD_GATE_COPY, ...hub })
    } catch (e) {
        logError("request failed", e)
        res.status(500).json({ success: false, message: "Failed to load app stats" })
    }
})

app.post("/api/hub/installs", trackingLimiter, async (req, res) => {
    const slug = typeof req.body?.slug === "string" ? req.body.slug : ""
    try {
        const hub = await recordInstall(slug)
        res.status(200).json({ rewardGate: REWARD_GATE_COPY, ...hub })
    } catch (e: unknown) {
        const err = e as { status?: number }
        if (err.status === 400) {
            return invalidRequest(res)
        }
        logError("request failed", e)
        res.status(500).json({ success: false, message: "Failed to record install" })
    }
})

const webhookLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    message: { success: false, message: "Too many webhook requests" },
})

const validateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 40,
    message: { success: false, message: "Too many validation requests" },
})

const redeemLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { success: false, message: "Too many redemption requests" },
})

function invalidRequest(res: express.Response) {
    return res.status(400).json({ success: false, message: "Invalid request" })
}

/** Exchange a Firebase ID token (Google sign-in) for a browser session cookie. */
async function establishSession(req: express.Request, res: express.Response) {
    const body = googleSessionSchema.safeParse(req.body)
    if (!body.success) {
        return res.status(400).json({ success: false, message: "idToken is required" })
    }

    try {
        const authUser = await verifyFirebaseIdToken(body.data.idToken)
        const user = await upsertGlobalUser(authUser)
        const dashboard = await getDashboardForUser(user.id)
        setSessionCookies(res, body.data.idToken, authUser.expiresAt)
        res.setHeader("Cache-Control", "no-store")
        res.status(200).json({
            success: true,
            user: dashboard,
        })
    } catch (e: unknown) {
        logError("firebase sign-in failed", e)
        const { status, message } = authFailure(e)
        res.status(status).json({ success: false, message })
    }
}

app.post("/api/auth/google", authLimiter, establishSession)
app.post("/api/auth/firebase", authLimiter, establishSession)

app.post("/api/auth/logout", (req, res) => {
    const hasSession = typeof req.cookies?.[SESSION_COOKIE] === "string" && req.cookies[SESSION_COOKIE]
    if (hasSession && !csrfHeaderValid(req)) {
        return res.status(403).json({ success: false, message: "CSRF check failed" })
    }
    clearSessionCookies(res)
    res.setHeader("Cache-Control", "no-store")
    res.status(200).json({ success: true })
})

/** Authenticated dashboard for the signed-in Google account. */
app.get("/api/me", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store")
    try {
        const user = await getGlobalUserByGoogleSub(req.authUser!.googleSub)
        if (!user) {
            const created = await upsertGlobalUser(req.authUser!)
            const dashboard = await getDashboardForUser(created.id)
            return res.status(200).json(dashboard)
        }
        const dashboard = await getDashboardForUser(user.id)
        res.status(200).json(dashboard)
    } catch (e) {
        logError("request failed", e)
        res.status(500).json({ success: false, message: "Failed to load profile" })
    }
})

app.post("/api/me/link-app", requireAuth, async (req, res) => {
    const body = linkAppAccountSchema.safeParse(req.body)
    if (!body.success) {
        return invalidRequest(res)
    }
    try {
        let user = await getGlobalUserByGoogleSub(req.authUser!.googleSub)
        if (!user) user = await upsertGlobalUser(req.authUser!)
        const dashboard = await linkAppAccount(
            user.id,
            body.data.sourceApp,
            body.data.appUid,
            body.data.referralCode
        )
        res.status(200).json({ success: true, user: dashboard })
    } catch (e: unknown) {
        logError("link app failed", e)
        const err = e as { status?: number; message?: string }
        if (err.status === 403 || err.status === 409) {
            return res.status(err.status).json({ success: false, message: err.message })
        }
        res.status(500).json({ success: false, message: "Failed to link app account" })
    }
})

app.post("/api/referrals/register", webhookLimiter, requireAppWebhook, async (req, res) => {
    const body = registerReferralSchema.safeParse(req.body)
    if (!body.success) {
        return invalidRequest(res)
    }

    try {
        const result = await registerReferralCode(
            body.data.code,
            body.data.sourceApp,
            null,
            body.data.ownerEmail ?? null
        )
        res.status(200).json({ success: true, code: result.code, sourceApp: result.sourceApp })
    } catch (e) {
        logError("request failed", e)
        res.status(500).json({ success: false, message: "Failed to register referral code" })
    }
})

app.get("/api/referrals/stats", requireAuth, async (req, res) => {
    const query = referralStatsQuerySchema.safeParse(req.query)
    if (!query.success) {
        return invalidRequest(res)
    }

    try {
        let user = await getGlobalUserByGoogleSub(req.authUser!.googleSub)
        if (!user) user = await upsertGlobalUser(req.authUser!)

        const owns = await userOwnsCode(user.id, query.data.code)
        if (!owns) {
            return res.status(403).json({
                msg: "This referral code is not linked to your Koliath account.",
            })
        }

        const stats = await getReferralStats(query.data.code)
        if (!stats.exists) {
            return res.status(404).json({
                msg: "No referral code found.",
            })
        }
        res.status(200).json(stats)
    } catch (e) {
        logError("request failed", e)
        res.status(500).json({ msg: "Internal server error" })
    }
})

app.get("/api/referrals/rewards", async (_req, res) => {
    try {
        const rewards = await getAllRewards()
        res.status(200).json(rewards)
    } catch (e) {
        logError("request failed", e)
        res.status(500).json({ msg: "Internal server error" })
    }
})

app.post("/api/referrals/redeem", redeemLimiter, requireAuth, async (req, res) => {
    const body = redeemRewardSchema.safeParse(req.body)
    if (!body.success) {
        return invalidRequest(res)
    }

    try {
        let user = await getGlobalUserByGoogleSub(req.authUser!.googleSub)
        if (!user) user = await upsertGlobalUser(req.authUser!)

        const contactEmail = (body.data.contactEmail ?? user.email).toLowerCase()
        const code = user.global_code

        const stats = await getReferralStats(code)
        if (!stats.exists) {
            return res.status(404).json({ success: false, message: "Referral account not found" })
        }

        await createRedemption(code, body.data.rewardId, contactEmail)
        res.status(200).json({
            success: true,
            message: "Redemption request submitted! We'll email your gift card within 48 hours.",
        })
    } catch (e: unknown) {
        logError("request failed", e)
        const err = e as { status?: number; message?: string }
        if (err.status === 404 || err.status === 400 || err.status === 403) {
            return res.status(err.status).json({ success: false, message: err.message })
        }
        res.status(500).json({ success: false, message: "Internal server error" })
    }
})

/** Legacy path — apps should migrate to /api/referrals/qualify with webhook secret. */
app.post("/api/referrals/event", webhookLimiter, requireAppWebhook, async (req, res) => {
    const body = referralEventSchema.safeParse(req.body)
    if (!body.success) {
        return invalidRequest(res)
    }

    try {
        const event = await createReferralEvent(
            body.data.referrerCode,
            body.data.referredEmail,
            body.data.deviceId,
            body.data.sourceApp
        )
        res.status(200).json({
            success: true,
            status: event.status,
            pointsAwarded: event.points_awarded,
        })
    } catch (e: unknown) {
        logError("request failed", e)
        const err = e as { code?: string; status?: number }
        if (err.code === "23505") {
            return res.status(400).json({
                success: false,
                message: "This device or email has already been referred for this app.",
            })
        }
        if (err.code === "UNKNOWN_CODE" || err.status === 404) {
            return res.status(404).json({
                success: false,
                message: "Unknown referral code.",
            })
        }
        res.status(500).json({ success: false, message: "Failed to process referral event" })
    }
})

/** Trusted qualification webhook — Sapient profile_completed, Adverts purchase, etc. */
app.post("/api/referrals/qualify", webhookLimiter, requireAppWebhook, async (req, res) => {
    const body = qualifyReferralSchema.safeParse(req.body)
    if (!body.success) {
        return invalidRequest(res)
    }

    try {
        const result = await qualifyReferral(
            body.data.referrerCode,
            body.data.referredEmail,
            body.data.deviceId,
            body.data.sourceApp,
            body.data.event
        )
        res.status(200).json(result)
    } catch (e: unknown) {
        logError("request failed", e)
        const err = e as { code?: string; status?: number; message?: string }
        if (err.code === "23505") {
            return res.status(400).json({
                success: false,
                message: "Duplicate referral for this app.",
            })
        }
        if (err.status === 404) {
            return res.status(404).json({ success: false, message: err.message })
        }
        res.status(500).json({ success: false, message: "Failed to qualify referral" })
    }
})

app.get("/api/referrals/validate", validateLimiter, async (req, res) => {
    const code = req.query.code
    if (!code || typeof code !== "string") {
        return res.status(400).json({ success: false, message: "Code is required" })
    }

    try {
        const isValid = await validateReferralCode(code)
        if (isValid) {
            res.status(200).json({ success: true })
        } else {
            res.status(404).json({ success: false, message: "Invalid referral code" })
        }
    } catch (e) {
        logError("request failed", e)
        res.status(500).json({ success: false, message: "Internal server error" })
    }
})

app.post("/api/referrals/track", trackingLimiter, async (req, res) => {
    const body = referralTrackingSchema.safeParse(req.body)
    if (!body.success) {
        return invalidRequest(res)
    }

    try {
        const ipAddress = req.ip || req.socket.remoteAddress || undefined
        const userAgent = req.headers["user-agent"] || undefined

        await trackReferralEvent(
            body.data.code,
            body.data.eventType,
            body.data.deviceId,
            ipAddress,
            userAgent
        )
        res.status(200).json({ success: true })
    } catch (e) {
        logError("request failed", e)
        res.status(500).json({ success: false, message: "Failed to track referral event" })
    }
})

const frontendDist = path.resolve(__dirname, "../../frontend/dist")
const frontendIndex = path.join(frontendDist, "index.html")
const hasFrontend = fs.existsSync(frontendIndex)

if (!hasFrontend && config.isProd) {
    console.error(`Frontend build missing at ${frontendIndex}. Run npm run build from the repo root.`)
    process.exit(1)
}

if (hasFrontend) {
    app.use(
        express.static(frontendDist, {
            index: "index.html",
            dotfiles: "deny",
            redirect: false,
            setHeaders(res, filePath) {
                if (filePath.endsWith(`${path.sep}index.html`)) {
                    res.setHeader("Cache-Control", "no-cache")
                }
            },
        })
    )

    // Client routes (/earn, /contact, /products, …) have no file on disk.
    // API paths and missing hashed assets stay JSON 404s.
    app.use((req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
            next()
            return
        }
        if (req.path === "/health" || req.path === "/api" || req.path.startsWith("/api/")) {
            next()
            return
        }
        if (path.extname(req.path)) {
            next()
            return
        }
        res.sendFile(frontendIndex, (err) => {
            if (err) next(err)
        })
    })
} else {
    console.warn(`Frontend build not found at ${frontendIndex}; serving API only.`)
}

app.use((_req, res) => {
    res.status(404).json({ success: false, message: "Not found" })
})

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof Error && err.message === "Not allowed by CORS") {
        res.status(403).json({ success: false, message: "Origin not allowed" })
        return
    }
    logError("unhandled", err)
    if (res.headersSent) return
    res.status(500).json({ success: false, message: "Internal server error" })
})

app.listen(config.port, () => {
    console.log(`Koliath listening on port ${config.port}`)
    const firebaseStatus = firebaseCredentialStatus()
    if (!firebaseStatus.configured) {
        const line = `Firebase Admin is not configured (${firebaseStatus.missing.join(", ")}). Login and protected routes fail closed.`
        if (config.isProd) console.error(line)
        else console.warn(line)
    }
})
