import { Router } from "express"
import rateLimit from "express-rate-limit"
import { requireAuth } from "../auth"
import { logError } from "../redact"
import { getGlobalUserByGoogleSub, upsertGlobalUser } from "../db"
import { authenticateAppSecret } from "../apps/service"
import { startInstallSchema, verifyInstallSchema } from "./schemas"
import { startInstallation, verifyInstallation } from "./service"

const router = Router()

const startLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many download attempts" },
})

const verifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { verified: false, reward_status: "rejected", points: 0, reason: "rate_limited" },
})

function readAppSecret(header: string | undefined, alt: string | undefined): string {
    if (header?.startsWith("Bearer ")) return header.slice(7).trim()
    return alt?.trim() ?? ""
}

router.post("/start", startLimiter, requireAuth, async (req, res) => {
    const body = startInstallSchema.safeParse(req.body)
    if (!body.success) {
        return res.status(400).json({ success: false, message: "Invalid request" })
    }
    try {
        let user = await getGlobalUserByGoogleSub(req.authUser!.googleSub)
        if (!user) user = await upsertGlobalUser(req.authUser!)
        const started = await startInstallation({
            userId: user.id,
            slug: body.data.slug,
            appId: body.data.appId,
            platform: body.data.platform,
            installationId: body.data.installationId,
            ip: req.ip,
            userAgent: req.get("user-agent") ?? undefined,
        })
        res.setHeader("Cache-Control", "no-store")
        res.status(201).json(started)
    } catch (error) {
        const err = error as { status?: number; message?: string }
        if (err.status === 403 || err.status === 404) {
            return res.status(err.status).json({ success: false, message: err.message })
        }
        logError("install start failed", error)
        res.status(500).json({ success: false, message: "Failed to start install verification" })
    }
})

router.post("/verify", verifyLimiter, async (req, res) => {
    const secret = readAppSecret(req.get("authorization"), req.get("x-koliath-app-secret"))
    const authResult = await authenticateAppSecret(secret)
    if (!authResult.ok) {
        const status = authResult.reason === "app_inactive" ? 403 : 401
        return res.status(status).json({
            verified: false,
            reward_status: "rejected",
            points: 0,
            reason: authResult.reason,
        })
    }

    const body = verifyInstallSchema.safeParse(req.body)
    if (!body.success) {
        return res.status(400).json({
            verified: false,
            reward_status: "rejected",
            points: 0,
            reason: "invalid_request",
        })
    }

    if (body.data.app_id !== authResult.credential.appId) {
        return res.status(400).json({
            verified: false,
            reward_status: "rejected",
            points: 0,
            reason: "wrong_app",
        })
    }

    try {
        const attestation = body.data.attestation
        const result = await verifyInstallation({
            appRowId: authResult.credential.appRowId,
            appId: body.data.app_id,
            verificationToken: body.data.verification_token,
            installationId: body.data.installation_id,
            platform: body.data.platform,
            deviceKey: body.data.device_key,
            osVersion: body.data.os_version,
            appVersion: body.data.app_version,
            attestation: attestation
                ? {
                      playIntegrityToken: attestation.play_integrity_token,
                      appAttestAssertion: attestation.app_attest_assertion,
                      deviceCheckToken: attestation.device_check_token,
                  }
                : undefined,
            ip: req.ip,
            userAgent: req.get("user-agent") ?? undefined,
        })
        res.setHeader("Cache-Control", "no-store")
        res.status(result.httpStatus).json(result.body)
    } catch (error) {
        logError("install verify failed", error)
        res.status(500).json({
            verified: false,
            reward_status: "rejected",
            points: 0,
            reason: "unavailable",
        })
    }
})

export const installationRouter = router
