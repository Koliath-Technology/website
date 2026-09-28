import { Router } from "express"
import rateLimit from "express-rate-limit"
import { isAdminSubject } from "../admin/guard"
import { requireAuth } from "../auth"
import { config } from "../config"
import { getGlobalUserByGoogleSub, upsertGlobalUser } from "../db"
import { logError } from "../redact"
import { registerAppSchema } from "../installations/schemas"
import {
    appStats,
    canManageApp,
    getAppByPublicId,
    issueAppCredential,
    listAppsForOwner,
    listCredentialSummaries,
    registerDeveloperApp,
} from "./service"

const router = Router()

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many app registrations" },
})

const credentialLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many credential rotations" },
})

router.get("/apps", requireAuth, async (req, res) => {
    try {
        let user = await getGlobalUserByGoogleSub(req.authUser!.googleSub)
        if (!user) user = await upsertGlobalUser(req.authUser!)
        const apps = await listAppsForOwner(user.id)
        const withStats = await Promise.all(
            apps.map(async (app) => ({
                ...app,
                stats: await appStats(app.id),
            }))
        )
        res.setHeader("Cache-Control", "no-store")
        res.status(200).json({ apps: withStats })
    } catch (error) {
        logError("list developer apps failed", error)
        res.status(500).json({ success: false, message: "Failed to list apps" })
    }
})

router.post("/apps", registerLimiter, requireAuth, async (req, res) => {
    const body = registerAppSchema.safeParse(req.body)
    if (!body.success) {
        return res.status(400).json({ success: false, message: "Invalid request" })
    }
    try {
        let user = await getGlobalUserByGoogleSub(req.authUser!.googleSub)
        if (!user) user = await upsertGlobalUser(req.authUser!)
        const app = await registerDeveloperApp({
            ownerUserId: user.id,
            name: body.data.name,
            packageId: body.data.packageId,
            platform: body.data.platform,
            developerName: body.data.developerName ?? user.display_name,
            company: body.data.company,
            slug: body.data.slug,
            verificationConfig: {
                tokenTtlSeconds: body.data.verificationConfig?.tokenTtlSeconds,
            },
        })
        res.setHeader("Cache-Control", "no-store")
        res.status(201).json({
            app,
            credential: null,
            message:
                "App registered as pending with zero points. An admin must approve it and set the reward before installs can earn points.",
        })
    } catch (error) {
        const err = error as { status?: number; message?: string }
        if (err.status === 409) {
            return res.status(409).json({ success: false, message: err.message })
        }
        logError("register app failed", error)
        res.status(500).json({ success: false, message: "Failed to register app" })
    }
})

router.get("/apps/:appId", requireAuth, async (req, res) => {
    try {
        let user = await getGlobalUserByGoogleSub(req.authUser!.googleSub)
        if (!user) user = await upsertGlobalUser(req.authUser!)
        const appId = String(req.params.appId)
        const app = await getAppByPublicId(appId)
        if (!app) return res.status(404).json({ success: false, message: "App not found" })
        if (!canManageApp(app, user.id, isAdminSubject(req.authUser, config.adminGoogleSubs))) {
            return res.status(403).json({ success: false, message: "Forbidden" })
        }
        const [credentials, stats] = await Promise.all([
            listCredentialSummaries(app.id),
            appStats(app.id),
        ])
        res.setHeader("Cache-Control", "no-store")
        res.status(200).json({
            app,
            credentials,
            stats,
            docs: "/docs/developer-api.md",
        })
    } catch (error) {
        logError("developer app detail failed", error)
        res.status(500).json({ success: false, message: "Failed to load app" })
    }
})

router.post("/apps/:appId/credentials", credentialLimiter, requireAuth, async (req, res) => {
    try {
        let user = await getGlobalUserByGoogleSub(req.authUser!.googleSub)
        if (!user) user = await upsertGlobalUser(req.authUser!)
        const app = await getAppByPublicId(String(req.params.appId))
        if (!app) return res.status(404).json({ success: false, message: "App not found" })
        if (!canManageApp(app, user.id, isAdminSubject(req.authUser, config.adminGoogleSubs))) {
            return res.status(403).json({ success: false, message: "Forbidden" })
        }
        const credential = await issueAppCredential(app.id)
        res.setHeader("Cache-Control", "no-store")
        res.status(201).json({
            appId: app.appId,
            prefix: credential.prefix,
            secret: credential.secret,
            createdAt: credential.createdAt,
            message: "Copy this secret now. It is stored only as a hash and cannot be shown again.",
        })
    } catch (error) {
        logError("credential issue failed", error)
        res.status(500).json({ success: false, message: "Failed to issue credential" })
    }
})

export const developerRouter = router
