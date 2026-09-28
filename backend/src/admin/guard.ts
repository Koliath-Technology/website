import type { NextFunction, Request, Response } from "express"
import { config } from "../config"

export function isAdminGoogleSub(sub: string | undefined): boolean {
    if (!sub) return false
    return config.adminGoogleSubs.includes(sub)
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
    if (!isAdminGoogleSub(req.authUser?.googleSub)) {
        return res.status(403).json({ success: false, message: "Forbidden" })
    }
    return next()
}
