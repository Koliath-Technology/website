import fs from "fs"
import path from "path"
import express from "express"
import cors from "cors"
import helmet from "helmet"
import rateLimit from "express-rate-limit"
import { z } from "zod"
import { config } from "./config"
import { requireAuth, requireAppWebhook, verifyGoogleIdToken } from "./auth"
import { listPublicRules } from "./rules"
import {
    careersSchema,
    referralStatsQuerySchema,
    redeemRewardSchema,
    referralEventSchema,
    referralTrackingSchema,
    registerReferralSchema,
    googleSessionSchema,
    linkAppAccountSchema,
    qualifyReferralSchema,
    contactInquirySchema,
} from "./types/types"
import {
    createCareer,
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
} from "./db"

const app = express()

app.set("trust proxy", 1)

app.use(
    helmet({
        contentSecurityPolicy: false,
        crossOriginResourcePolicy: { policy: "cross-origin" },
    })
)

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
    res.status(200).json({ rules: listPublicRules() })
})

const contactLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { success: false, message: "Too many contact requests" },
})

/**
 * Accepts brochure / hub inquiries without a mailbox integration.
 * The process log is the dev inbox. Production should tail these logs or
 * forward them until an email provider is configured — no secrets required.
 */
app.post("/api/contact", contactLimiter, (req, res) => {
    const body = contactInquirySchema.safeParse(req.body)
    if (!body.success) {
        return res.status(400).json({ success: false, message: "Check the form and try again." })
    }

    console.log(
        JSON.stringify({
            type: "contact_inquiry",
            at: new Date().toISOString(),
            ...body.data,
        })
    )

    res.status(202).json({
        success: true,
        message: "Received. We will reply by email.",
    })
})

app.post("/careers", async (req, res) => {
    const body = careersSchema.safeParse(req.body)
    if (!body.success) {
        return res.status(400).json({ msg: z.treeifyError(body.error) })
    }

    const { name, email, contact, linkedin } = body.data
    try {
        await createCareer({ name, email, contact, linkedin })
    } catch {
        return res.status(500).json({
            msg: "Application already exists or database unavailable",
        })
    }

    res.status(200).json({
        msg: "Career application received successfully",
        data: { name, email, contact, linkedin },
    })
})

/** Exchange Google ID token for a Koliath global session profile. */
app.post("/api/auth/google", authLimiter, async (req, res) => {
    const body = googleSessionSchema.safeParse(req.body)
    if (!body.success) {
        return res.status(400).json({ success: false, message: "idToken is required" })
    }

    try {
        const authUser = await verifyGoogleIdToken(body.data.idToken)
        const user = await upsertGlobalUser(authUser)
        const dashboard = await getDashboardForUser(user.id)
        res.status(200).json({
            success: true,
            user: dashboard,
        })
    } catch (e: unknown) {
        console.error(e)
        const status =
            typeof e === "object" && e && "status" in e ? Number((e as { status: number }).status) : 401
        const message = e instanceof Error ? e.message : "Authentication failed"
        res.status(status).json({ success: false, message })
    }
})

/** Authenticated dashboard for the signed-in Google account. */
app.get("/api/me", requireAuth, async (req, res) => {
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
        console.error(e)
        res.status(500).json({ success: false, message: "Failed to load profile" })
    }
})

app.post("/api/me/link-app", requireAuth, async (req, res) => {
    const body = linkAppAccountSchema.safeParse(req.body)
    if (!body.success) {
        return res.status(400).json({ msg: z.treeifyError(body.error) })
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
    } catch (e) {
        console.error(e)
        res.status(500).json({ success: false, message: "Failed to link app account" })
    }
})

app.post("/api/referrals/register", requireAppWebhook, async (req, res) => {
    const body = registerReferralSchema.safeParse(req.body)
    if (!body.success) {
        return res.status(400).json({ msg: z.treeifyError(body.error) })
    }

    try {
        const result = await registerReferralCode(
            body.data.code,
            body.data.sourceApp,
            null,
            body.data.ownerEmail ?? null
        )
        res.status(200).json({ success: true, ...result })
    } catch (e) {
        console.error(e)
        res.status(500).json({ success: false, message: "Failed to register referral code" })
    }
})

app.get("/api/referrals/stats", requireAuth, async (req, res) => {
    const query = referralStatsQuerySchema.safeParse(req.query)
    if (!query.success) {
        return res.status(400).json({ msg: z.treeifyError(query.error) })
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
        console.error(e)
        res.status(500).json({ msg: "Internal server error" })
    }
})

app.get("/api/referrals/rewards", async (_req, res) => {
    try {
        const rewards = await getAllRewards()
        res.status(200).json(rewards)
    } catch (e) {
        console.error(e)
        res.status(500).json({ msg: "Internal server error" })
    }
})

app.post("/api/referrals/redeem", requireAuth, async (req, res) => {
    const body = redeemRewardSchema.safeParse(req.body)
    if (!body.success) {
        return res.status(400).json({ msg: z.treeifyError(body.error) })
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
        console.error(e)
        const err = e as { status?: number; message?: string }
        if (err.status === 404 || err.status === 400) {
            return res.status(err.status).json({ success: false, message: err.message })
        }
        res.status(500).json({ success: false, message: "Internal server error" })
    }
})

/** Legacy path — apps should migrate to /api/referrals/qualify with webhook secret. */
app.post("/api/referrals/event", requireAppWebhook, async (req, res) => {
    const body = referralEventSchema.safeParse(req.body)
    if (!body.success) {
        return res.status(400).json({ msg: z.treeifyError(body.error) })
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
        console.error(e)
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

/** Trusted qualification webhook — Sapient day_active, Adverts purchase, etc. */
app.post("/api/referrals/qualify", requireAppWebhook, async (req, res) => {
    const body = qualifyReferralSchema.safeParse(req.body)
    if (!body.success) {
        return res.status(400).json({ msg: z.treeifyError(body.error) })
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
        console.error(e)
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

app.get("/api/referrals/validate", async (req, res) => {
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
        console.error(e)
        res.status(500).json({ success: false, message: "Internal server error" })
    }
})

app.post("/api/referrals/track", trackingLimiter, async (req, res) => {
    const body = referralTrackingSchema.safeParse(req.body)
    if (!body.success) {
        return res.status(400).json({ msg: z.treeifyError(body.error) })
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
        console.error(e)
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

app.listen(config.port, () => {
    console.log(`Koliath listening on port ${config.port}`)
})
