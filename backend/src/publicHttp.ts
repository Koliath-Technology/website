import cors from "cors"
import type { RequestHandler } from "express"
import { config } from "./config"

/** Admin console lives on the website-admin service, not this public site. */
export const ADMIN_CONSOLE_URL = "https://admin.koliath.in/"

/**
 * Old brochure paths that used to mount the admin SPA.
 * `/administrator` and `/api/admin` are not this path.
 */
export function isLegacyAdminPage(path: string): boolean {
    const bare = (path.split("?")[0]?.split("#")[0] ?? path).toLowerCase().replace(/\/+$/, "") || "/"
    return bare === "/admin" || bare.startsWith("/admin/")
}

export const legacyAdminRedirect: RequestHandler = (req, res, next) => {
    if ((req.method !== "GET" && req.method !== "HEAD") || !isLegacyAdminPage(req.path)) {
        next()
        return
    }
    res.setHeader("Cache-Control", "no-store")
    res.redirect(302, ADMIN_CONSOLE_URL)
}

export function createPublicCors(origins: readonly string[]): RequestHandler {
    return cors({
        origin(origin, callback) {
            if (!origin || origins.includes(origin)) {
                callback(null, true)
                return
            }
            callback(new Error("Not allowed by CORS"))
        },
        credentials: true,
    })
}

export const publicCors = createPublicCors(config.corsOrigins)
