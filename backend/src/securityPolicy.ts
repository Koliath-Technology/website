import type { Express, Response } from "express"
import cors from "cors"
import helmet from "helmet"

/** Railway healthcheck. Keep this path stable. */
export const HEALTH_PATH = "/health"

const PROD_ORIGINS = ["https://koliath.in", "https://www.koliath.in"]
const DEV_ORIGINS = ["http://localhost:5173", ...PROD_ORIGINS]

/**
 * Paths that must not be mounted on the public site. Admin lives on
 * admin.koliath.in. Debug handlers stay unmounted in every environment.
 */
const FORBIDDEN_ROUTE_PREFIXES = ["/api/admin", "/api/debug", "/api/dev", "/debug"]

export const PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=()"

export function devOnlyRoutesEnabled(nodeEnv: string | undefined): boolean {
    return nodeEnv === "development"
}

/** Deliberately empty. Add a path here only for a development-only handler. */
export function devOnlyRouteTable(): readonly string[] {
    return []
}

export function hstsPolicy(nodeEnv: string | undefined):
    | false
    | { maxAge: number; includeSubDomains: boolean; preload: boolean } {
    if (nodeEnv === "development") return false
    return { maxAge: 365 * 24 * 60 * 60, includeSubDomains: true, preload: false }
}

export function helmetOptions(nodeEnv: string | undefined) {
    return {
        contentSecurityPolicy: {
            useDefaults: true as const,
            directives: {
                defaultSrc: ["'self'"],
                baseUri: ["'self'"],
                objectSrc: ["'none'"],
                frameAncestors: ["'none'"],
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
        strictTransportSecurity: hstsPolicy(nodeEnv),
        frameguard: { action: "deny" as const },
        xContentTypeOptions: true as const,
        referrerPolicy: { policy: "no-referrer" as const },
        // GIS sign-in opens a Google window. same-origin COOP blocks that popup.
        crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" as const },
        crossOriginResourcePolicy: { policy: "same-site" as const },
        crossOriginEmbedderPolicy: false as const,
    }
}

export function sessionCookieOptions(input: { httpOnly: boolean; secure: boolean; maxAge?: number }) {
    return {
        httpOnly: input.httpOnly,
        secure: input.secure,
        sameSite: "lax" as const,
        path: "/",
        ...(input.maxAge !== undefined ? { maxAge: input.maxAge } : {}),
    }
}

function unique(values: string[]): string[] {
    return [...new Set(values)]
}

function productionOrigin(origin: string): boolean {
    try {
        const url = new URL(origin)
        if (url.protocol !== "https:") return false
        if (url.username || url.password) return false
        const host = url.hostname.toLowerCase()
        if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost")) {
            return false
        }
        return url.pathname === "/" && !url.search && !url.hash
    } catch {
        return false
    }
}

/**
 * Credentialed browser origins.
 * Production drops http, localhost, and malformed entries even if they were
 * set in CORS_ORIGINS. Requests with no Origin (webhooks, curl, mobile) are
 * still accepted by the CORS middleware.
 */
export function resolveCorsOrigins(raw: string | undefined, nodeEnv: string | undefined): string[] {
    const isProd = nodeEnv === "production"
    const parsed =
        raw === undefined
            ? isProd
                ? PROD_ORIGINS
                : DEV_ORIGINS
            : raw.split(",").map((part) => part.trim()).filter(Boolean)
    const origins = unique(parsed)
    return isProd ? origins.filter(productionOrigin) : origins
}

export function applySecurityMiddleware(
    app: Express,
    options: { nodeEnv: string | undefined; corsOrigins: string[] }
) {
    app.disable("x-powered-by")
    app.use(helmet(helmetOptions(options.nodeEnv)))
    app.use((_req, res, next) => {
        res.setHeader("Permissions-Policy", PERMISSIONS_POLICY)
        next()
    })
    app.use(
        cors({
            origin(origin, callback) {
                if (!origin || options.corsOrigins.includes(origin)) {
                    callback(null, true)
                    return
                }
                callback(new Error("Not allowed by CORS"))
            },
            credentials: true,
        })
    )
}

export function handleCorsError(err: unknown, res: Response): boolean {
    if (err instanceof Error && err.message === "Not allowed by CORS") {
        res.status(403).json({ success: false, message: "Origin not allowed" })
        return true
    }
    return false
}

export function spaFallbackAllowed(method: string, requestPath: string): boolean {
    if (method !== "GET" && method !== "HEAD") return false
    const pathOnly = requestPath.split("?")[0] || "/"
    if (pathOnly === HEALTH_PATH || pathOnly === "/api" || pathOnly.startsWith("/api/")) return false
    if (pathOnly === "/admin" || pathOnly.startsWith("/admin/")) return false
    if (pathOnly === "/debug" || pathOnly.startsWith("/debug/")) return false
    const slash = pathOnly.lastIndexOf("/")
    const leaf = slash >= 0 ? pathOnly.slice(slash + 1) : pathOnly
    return !leaf.includes(".")
}

export function isBlockedStaticPath(requestPath: string): boolean {
    const pathOnly = (requestPath.split("?")[0] || "/").toLowerCase()
    if (pathOnly.endsWith(".map")) return true
    const segments = pathOnly.split("/")
    return segments.some((segment) => segment === ".env" || segment.startsWith(".env") || segment.startsWith("."))
}

type RouteLayer = {
    route?: { path?: string | RegExp; methods?: Record<string, boolean> }
}

export function collectRoutePaths(stack: readonly RouteLayer[]): string[] {
    const paths: string[] = []
    for (const layer of stack) {
        if (!layer.route?.path || !layer.route.methods) continue
        const requestPath =
            typeof layer.route.path === "string" ? layer.route.path : layer.route.path.toString()
        for (const [method, enabled] of Object.entries(layer.route.methods)) {
            if (enabled) paths.push(`${method.toUpperCase()} ${requestPath}`)
        }
    }
    return paths
}

export function expressRouteStack(app: Express): RouteLayer[] {
    const routed = app as Express & { router?: { stack?: RouteLayer[] } }
    return routed.router?.stack ?? []
}

export function productionRouteViolations(routes: readonly string[]): string[] {
    return routes.filter((route) => {
        const space = route.indexOf(" ")
        const requestPath = space === -1 ? route : route.slice(space + 1)
        return FORBIDDEN_ROUTE_PREFIXES.some(
            (blocked) => requestPath === blocked || requestPath.startsWith(`${blocked}/`)
        )
    })
}
