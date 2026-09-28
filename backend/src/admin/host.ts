import cors from "cors"
import type { RequestHandler, Response } from "express"
import { config } from "../config"
import { createSecurityHeaders } from "../securityHeaders"

/**
 * Host gate for the admin console.
 *
 * Production admin APIs accept only admin.koliath.in unless ADMIN_HOSTS names
 * other non-marketing hosts. koliath.in and www.koliath.in are never allowed,
 * including when someone puts them in ADMIN_HOSTS or ADMIN_CORS_ORIGINS.
 * Development also allows localhost so local QA can call the admin API.
 * The browser UI is served only on the dedicated admin host (not on localhost),
 * so the marketing origin never receives the admin SPA.
 */

const PUBLIC_MARKETING_HOSTS = new Set(["koliath.in", "www.koliath.in"])
const LOCAL_DEV_HOSTS = new Set(["localhost", "127.0.0.1", "::1"])
const CANONICAL_ADMIN_ORIGIN = "https://admin.koliath.in"
const CANONICAL_ADMIN_HOST = "admin.koliath.in"

const DEV_ADMIN_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://admin.localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

export interface AdminRuntime {
    isProd: boolean
    apiHosts: readonly string[]
    dedicatedHosts: readonly string[]
    adminCorsOrigins: readonly string[]
    publicCorsOrigins: readonly string[]
    adminOrigin: string
}

export interface AdminPolicyInput {
    isProd: boolean
    adminHosts?: string
    adminOrigin?: string
    adminCorsOrigins?: string
    publicCorsOrigins: readonly string[]
}

export interface HostSecurity {
    runtime: AdminRuntime
    selectCors: RequestHandler
    requireAdminHost: RequestHandler
    adminCors: RequestHandler
    adminUiGate: RequestHandler
    securityHeaders: RequestHandler
}

type OriginDelegate = (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void
) => void

export function normalizeHostname(value: string | undefined | null): string {
    if (!value) return ""
    let host = value.trim().toLowerCase()
    if (!host) return ""
    if (host.includes("://")) {
        try {
            host = new URL(host).hostname.toLowerCase()
        } catch {
            return ""
        }
    }
    if (host.startsWith("[")) {
        const end = host.indexOf("]")
        host = end === -1 ? host.slice(1) : host.slice(1, end)
    } else {
        const colon = host.lastIndexOf(":")
        if (colon > -1 && host.indexOf(":") === colon && /^\d+$/.test(host.slice(colon + 1))) {
            host = host.slice(0, colon)
        }
    }
    if (host.endsWith(".")) host = host.slice(0, -1)
    return host
}

function parseList(raw: string | undefined): string[] {
    return (raw ?? "")
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
}

export function isPublicMarketingHost(hostname: string): boolean {
    return PUBLIC_MARKETING_HOSTS.has(normalizeHostname(hostname))
}

export function isLocalDevHost(hostname: string): boolean {
    return LOCAL_DEV_HOSTS.has(normalizeHostname(hostname))
}

function isDevOnlyHost(hostname: string): boolean {
    const host = normalizeHostname(hostname)
    return isLocalDevHost(host) || host === "admin.localhost" || host.endsWith(".localhost")
}

export function isPublicMarketingOrigin(origin: string): boolean {
    try {
        return isPublicMarketingHost(new URL(origin).hostname)
    } catch {
        return false
    }
}

export function normalizeOrigin(origin: string): string | null {
    try {
        const url = new URL(origin)
        if (url.protocol !== "https:" && url.protocol !== "http:") return null
        return url.origin.toLowerCase()
    } catch {
        return null
    }
}

export function resolveAdminApiHosts(isProd: boolean, adminHostsRaw: string | undefined): string[] {
    const configured = parseList(adminHostsRaw)
        .map((host) => normalizeHostname(host))
        .filter((host) => host.length > 0 && !isPublicMarketingHost(host))
        .filter((host) => (isProd ? !isDevOnlyHost(host) : true))
    if (configured.length > 0) return [...new Set(configured)]
    const hosts = [CANONICAL_ADMIN_HOST]
    if (!isProd) hosts.push("admin.localhost", "localhost", "127.0.0.1", "::1")
    return hosts
}

export function resolveDedicatedAdminHosts(apiHosts: readonly string[]): string[] {
    const dedicated = apiHosts.filter((host) => !isLocalDevHost(host))
    return dedicated.length > 0 ? [...dedicated] : [CANONICAL_ADMIN_HOST]
}

export function resolveAdminOrigin(raw: string | undefined): string {
    const normalized = normalizeOrigin((raw ?? "").trim())
    if (!normalized || isPublicMarketingOrigin(normalized)) return CANONICAL_ADMIN_ORIGIN
    return normalized
}

export function resolveAdminCorsOrigins(input: {
    isProd: boolean
    adminOrigin: string
    adminCorsOriginsRaw?: string
}): string[] {
    const fromEnv = parseList(input.adminCorsOriginsRaw)
        .map((origin) => normalizeOrigin(origin))
        .filter((origin): origin is string => Boolean(origin))
        .filter((origin) => !isPublicMarketingOrigin(origin))
    const base = fromEnv.length > 0 ? fromEnv : [input.adminOrigin]
    const extras = input.isProd ? [] : DEV_ADMIN_ORIGINS
    const merged = [...base, ...extras].filter((origin) => !isPublicMarketingOrigin(origin))
    const unique = [...new Set(merged)]
    return unique.length > 0 ? unique : [CANONICAL_ADMIN_ORIGIN]
}

export function buildAdminRuntime(input: AdminPolicyInput): AdminRuntime {
    const adminOrigin = resolveAdminOrigin(input.adminOrigin)
    const apiHosts = resolveAdminApiHosts(input.isProd, input.adminHosts)
    return {
        isProd: input.isProd,
        apiHosts,
        dedicatedHosts: resolveDedicatedAdminHosts(apiHosts),
        adminOrigin,
        adminCorsOrigins: resolveAdminCorsOrigins({
            isProd: input.isProd,
            adminOrigin,
            adminCorsOriginsRaw: input.adminCorsOrigins,
        }),
        publicCorsOrigins: input.publicCorsOrigins.filter((origin) => origin.trim().length > 0),
    }
}

let cachedRuntime: AdminRuntime | undefined

export function adminRuntime(): AdminRuntime {
    if (!cachedRuntime) {
        cachedRuntime = buildAdminRuntime({
            isProd: config.isProd,
            adminHosts: config.adminHosts,
            adminOrigin: config.adminOrigin,
            adminCorsOrigins: config.adminCorsOrigins,
            publicCorsOrigins: config.corsOrigins,
        })
    }
    return cachedRuntime
}

export function isAdminApiHostname(hostname: string, runtime: AdminRuntime = adminRuntime()): boolean {
    const host = normalizeHostname(hostname)
    return host.length > 0 && runtime.apiHosts.includes(host)
}

export function isDedicatedAdminHostname(hostname: string, runtime: AdminRuntime = adminRuntime()): boolean {
    const host = normalizeHostname(hostname)
    return host.length > 0 && runtime.dedicatedHosts.includes(host)
}

function requestPath(path: string): string {
    const bare = path.split("?")[0]?.split("#")[0] ?? path
    return bare.toLowerCase()
}

export function isAdminApiPath(path: string): boolean {
    const bare = requestPath(path).replace(/\/+$/, "") || "/"
    return bare === "/api/admin" || bare.startsWith("/api/admin/")
}

export function isAdminUiPath(path: string): boolean {
    const bare = requestPath(path).replace(/\/+$/, "") || "/"
    return bare === "/admin" || bare.startsWith("/admin/")
}

/** Vite places the admin console chunk under this prefix. Keep in sync with frontend/vite.config.ts. */
export function isAdminConsoleAsset(path: string): boolean {
    const bare = requestPath(path)
    return bare === "/assets/admin" || bare.startsWith("/assets/admin/")
}

export type AdminUiDecision = "continue" | "redirect" | "not-found"

export function adminUiDecision(hostname: string, path: string, runtime: AdminRuntime): AdminUiDecision {
    const asset = isAdminConsoleAsset(path)
    const page = isAdminUiPath(path)
    if (!asset && !page) return "continue"
    const dedicated = isDedicatedAdminHostname(hostname, runtime)
    if (asset) return dedicated ? "continue" : "not-found"
    if (dedicated) return "redirect"
    if (!runtime.isProd && isLocalDevHost(hostname)) return "continue"
    return "not-found"
}

/**
 * True when an allowlisted admin is acting on an app they do not own.
 * Catalog apps have a null owner. That action is refused off the admin API host.
 */
export function catalogAdminRequiresAdminHost(
    isAdmin: boolean,
    ownerUserId: number | null,
    callerUserId: number
): boolean {
    if (!isAdmin) return false
    return ownerUserId == null || ownerUserId !== callerUserId
}

export function catalogAdminHostDenial(
    hostname: string,
    isAdmin: boolean,
    ownerUserId: number | null,
    callerUserId: number,
    runtime: AdminRuntime = adminRuntime()
): { status: 403; message: string } | null {
    if (!catalogAdminRequiresAdminHost(isAdmin, ownerUserId, callerUserId)) return null
    if (isAdminApiHostname(hostname, runtime)) return null
    return { status: 403, message: "Admin host required" }
}

function originDelegate(allowlist: readonly string[], blockMarketing: boolean): OriginDelegate {
    return (origin, callback) => {
        if (!origin) {
            callback(null, true)
            return
        }
        if (blockMarketing && isPublicMarketingOrigin(origin)) {
            callback(new Error("Not allowed by CORS"))
            return
        }
        const candidate = blockMarketing ? (normalizeOrigin(origin) ?? origin) : origin
        if (allowlist.includes(candidate)) {
            callback(null, true)
            return
        }
        callback(new Error("Not allowed by CORS"))
    }
}

function notFound(res: Response, method: string): void {
    res.setHeader("Cache-Control", "no-store")
    res.setHeader("X-Robots-Tag", "noindex, nofollow")
    if (method === "GET" || method === "HEAD") {
        res.status(404).type("html").send("<!doctype html><title>Not found</title><p>Not found</p>")
        return
    }
    res.status(404).json({ success: false, message: "Not found" })
}

export function createHostSecurity(runtime: AdminRuntime): HostSecurity {
    const publicCors = cors({
        origin: originDelegate(runtime.publicCorsOrigins, false),
        credentials: true,
    })
    const adminCors = cors({
        origin: originDelegate(runtime.adminCorsOrigins, true),
        credentials: true,
    })

    const selectCors: RequestHandler = (req, res, next) => {
        if (isAdminApiPath(req.path)) {
            next()
            return
        }
        if (isDedicatedAdminHostname(req.hostname, runtime)) {
            adminCors(req, res, next)
            return
        }
        publicCors(req, res, next)
    }

    const requireAdminHost: RequestHandler = (req, res, next) => {
        if (isAdminApiHostname(req.hostname, runtime)) {
            next()
            return
        }
        res.setHeader("Cache-Control", "no-store")
        res.setHeader("X-Robots-Tag", "noindex, nofollow")
        res.status(403).json({ success: false, message: "Admin host required" })
    }

    const adminUiGate: RequestHandler = (req, res, next) => {
        const decision = adminUiDecision(req.hostname, req.path, runtime)
        if (decision === "continue") {
            next()
            return
        }
        if (decision === "redirect") {
            res.setHeader("Cache-Control", "no-store")
            res.redirect(302, "/")
            return
        }
        notFound(res, req.method)
    }

    return {
        runtime,
        selectCors,
        requireAdminHost,
        adminCors,
        adminUiGate,
        securityHeaders: createSecurityHeaders((hostname) => isDedicatedAdminHostname(hostname, runtime)),
    }
}
