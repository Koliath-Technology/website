import type { NextFunction, Request, Response } from "express"
import { config } from "../config"

function listed(value: string | null | undefined, allowlist: readonly string[]): boolean {
    return typeof value === "string" && value.length > 0 && allowlist.includes(value)
}

/**
 * True when `allowlist` is non-empty and contains the Google provider subject
 * or the Firebase Auth uid. An empty list denies everyone.
 */
export function isAdminSubject(
    user: { googleSub?: string | null; firebaseUid?: string | null } | null | undefined,
    allowlist: readonly string[]
): boolean {
    if (!user || allowlist.length === 0) return false
    return listed(user.googleSub, allowlist) || listed(user.firebaseUid, allowlist)
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
    if (!isAdminSubject(req.authUser, config.adminGoogleSubs)) {
        return res.status(403).json({ success: false, message: "Forbidden" })
    }
    return next()
}
