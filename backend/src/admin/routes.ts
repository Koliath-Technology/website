import { Router } from "express"
import { requireAuth } from "../auth"
import { logError } from "../redact"
import { adminAppUpdateSchema, adminRiskSchema } from "../installations/schemas"
import { requireAdmin } from "./guard"
import {
    adminApps,
    adminDevices,
    adminFraudEvents,
    adminInstallations,
    adminOverview,
    adminRewards,
    adminSetUserStatus,
    adminUpdateApp,
    adminUserAudit,
    adminUsers,
} from "./queries"

const router = Router()

router.use(requireAuth, requireAdmin)

router.get("/overview", async (_req, res) => {
    try {
        res.setHeader("Cache-Control", "no-store")
        res.status(200).json(await adminOverview())
    } catch (error) {
        logError("admin overview failed", error)
        res.status(500).json({ success: false, message: "Failed to load overview" })
    }
})

router.get("/users", async (req, res) => {
    try {
        res.setHeader("Cache-Control", "no-store")
        res.status(200).json({ users: await adminUsers(req.query.limit) })
    } catch (error) {
        logError("admin users failed", error)
        res.status(500).json({ success: false, message: "Failed to load users" })
    }
})

router.get("/users/:id/audit", async (req, res) => {
    const id = Number.parseInt(String(req.params.id), 10)
    if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, message: "Invalid request" })
    }
    try {
        const audit = await adminUserAudit(id)
        if (!audit) return res.status(404).json({ success: false, message: "User not found" })
        res.setHeader("Cache-Control", "no-store")
        res.status(200).json(audit)
    } catch (error) {
        logError("admin audit failed", error)
        res.status(500).json({ success: false, message: "Failed to load audit" })
    }
})

router.post("/users/:id/risk", async (req, res) => {
    const id = Number.parseInt(String(req.params.id), 10)
    const body = adminRiskSchema.safeParse(req.body)
    if (!Number.isFinite(id) || !body.success) {
        return res.status(400).json({ success: false, message: "Invalid request" })
    }
    try {
        const user = await adminSetUserStatus(id, body.data)
        if (!user) return res.status(404).json({ success: false, message: "User not found" })
        res.setHeader("Cache-Control", "no-store")
        res.status(200).json({ user })
    } catch (error) {
        logError("admin risk update failed", error)
        res.status(500).json({ success: false, message: "Failed to update user" })
    }
})

router.get("/apps", async (_req, res) => {
    try {
        res.setHeader("Cache-Control", "no-store")
        res.status(200).json({ apps: await adminApps() })
    } catch (error) {
        logError("admin apps failed", error)
        res.status(500).json({ success: false, message: "Failed to load apps" })
    }
})

router.post("/apps/:appId", async (req, res) => {
    const body = adminAppUpdateSchema.safeParse(req.body)
    if (!body.success) {
        return res.status(400).json({ success: false, message: "Invalid request" })
    }
    try {
        const app = await adminUpdateApp(String(req.params.appId), body.data)
        if (!app) return res.status(404).json({ success: false, message: "App not found" })
        res.setHeader("Cache-Control", "no-store")
        res.status(200).json({ app })
    } catch (error) {
        logError("admin app update failed", error)
        res.status(500).json({ success: false, message: "Failed to update app" })
    }
})

router.get("/installations", async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined
    try {
        res.setHeader("Cache-Control", "no-store")
        res.status(200).json({ installations: await adminInstallations(status, req.query.limit) })
    } catch (error) {
        logError("admin installations failed", error)
        res.status(500).json({ success: false, message: "Failed to load installations" })
    }
})

router.get("/rewards", async (req, res) => {
    try {
        res.setHeader("Cache-Control", "no-store")
        res.status(200).json({ rewards: await adminRewards(req.query.limit) })
    } catch (error) {
        logError("admin rewards failed", error)
        res.status(500).json({ success: false, message: "Failed to load rewards" })
    }
})

router.get("/fraud-events", async (req, res) => {
    try {
        res.setHeader("Cache-Control", "no-store")
        res.status(200).json({ events: await adminFraudEvents(req.query.limit) })
    } catch (error) {
        logError("admin fraud failed", error)
        res.status(500).json({ success: false, message: "Failed to load fraud events" })
    }
})

router.get("/devices", async (req, res) => {
    try {
        res.setHeader("Cache-Control", "no-store")
        res.status(200).json({ devices: await adminDevices(req.query.limit) })
    } catch (error) {
        logError("admin devices failed", error)
        res.status(500).json({ success: false, message: "Failed to load devices" })
    }
})

export const adminVerificationRouter = router
