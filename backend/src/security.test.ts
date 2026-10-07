import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"
import express from "express"
import {
    HEALTH_PATH,
    applySecurityMiddleware,
    collectRoutePaths,
    devOnlyRouteTable,
    devOnlyRoutesEnabled,
    expressRouteStack,
    handleCorsError,
    helmetOptions,
    hstsPolicy,
    isBlockedStaticPath,
    productionRouteViolations,
    resolveCorsOrigins,
    sessionCookieOptions,
    spaFallbackAllowed,
} from "./securityPolicy.ts"
import { accountCreateSettings, createAccountVelocity, readBoundedInt } from "./accountVelocity.ts"
import { pointsForQualifyingEvent, REFERRALS_REQUIRED, rewardsUnlocked } from "./rules.ts"

test("production CORS drops localhost and non-HTTPS origins", () => {
    const origins = resolveCorsOrigins(
        "http://localhost:5173, https://koliath.in, https://www.koliath.in, http://koliath.in, not a url",
        "production"
    )
    assert.deepEqual(origins, ["https://koliath.in", "https://www.koliath.in"])
})

test("unset production CORS is the public site only", () => {
    const origins = resolveCorsOrigins(undefined, "production")
    assert.deepEqual(origins, ["https://koliath.in", "https://www.koliath.in"])
    assert.equal(origins.some((origin) => origin.includes("localhost")), false)
})

test("development CORS keeps the local Vite origin", () => {
    const origins = resolveCorsOrigins(undefined, "development")
    assert.equal(origins.includes("http://localhost:5173"), true)
    assert.equal(origins.includes("https://koliath.in"), true)
})

test("HSTS is on outside development and off for local HTTP", () => {
    assert.equal(hstsPolicy("development"), false)
    const prod = hstsPolicy("production")
    assert.equal(prod !== false && prod.maxAge, 365 * 24 * 60 * 60)
    assert.equal(prod !== false && prod.includeSubDomains, true)
    assert.equal(prod !== false && prod.preload, false)
    assert.notEqual(hstsPolicy(undefined), false)
    const headers = helmetOptions("production")
    assert.equal(headers.frameguard.action, "deny")
    assert.equal(headers.xContentTypeOptions, true)
    assert.deepEqual(headers.contentSecurityPolicy.directives.frameAncestors, ["'none'"])
    assert.equal(headers.contentSecurityPolicy.directives.upgradeInsecureRequests, null)
    assert.equal(headers.crossOriginOpenerPolicy.policy, "same-origin-allow-popups")
})

test("session cookies are host-only Lax and Secure only when requested", () => {
    const session = sessionCookieOptions({ httpOnly: true, secure: true, maxAge: 1000 })
    assert.equal(session.httpOnly, true)
    assert.equal(session.secure, true)
    assert.equal(session.sameSite, "lax")
    assert.equal(session.path, "/")
    assert.equal(Object.hasOwn(session, "domain"), false)
    const csrf = sessionCookieOptions({ httpOnly: false, secure: false })
    assert.equal(csrf.httpOnly, false)
    assert.equal(csrf.secure, false)
    assert.equal(Object.hasOwn(csrf, "maxAge"), false)
})

test("the SPA fallback does not swallow API, health, admin, or asset paths", () => {
    assert.equal(HEALTH_PATH, "/health")
    assert.equal(spaFallbackAllowed("GET", "/earn"), true)
    assert.equal(spaFallbackAllowed("HEAD", "/contact"), true)
    assert.equal(spaFallbackAllowed("GET", "/health"), false)
    assert.equal(spaFallbackAllowed("GET", "/api/me"), false)
    assert.equal(spaFallbackAllowed("GET", "/api/admin"), false)
    assert.equal(spaFallbackAllowed("GET", "/admin"), false)
    assert.equal(spaFallbackAllowed("GET", "/debug"), false)
    assert.equal(spaFallbackAllowed("GET", "/assets/app.js"), false)
    assert.equal(spaFallbackAllowed("POST", "/earn"), false)
})

test("source maps and dotenv files are not served as static assets", () => {
    assert.equal(isBlockedStaticPath("/assets/index-abc.js.map"), true)
    assert.equal(isBlockedStaticPath("/.env"), true)
    assert.equal(isBlockedStaticPath("/assets/.env.local"), true)
    assert.equal(isBlockedStaticPath("/assets/index-abc.js"), false)
})

test("dev routes stay unmounted and admin or debug paths are rejected", () => {
    assert.equal(devOnlyRoutesEnabled("production"), false)
    assert.equal(devOnlyRoutesEnabled(undefined), false)
    assert.equal(devOnlyRoutesEnabled("development"), true)
    assert.deepEqual(devOnlyRouteTable(), [])

    const app = express()
    app.get("/health", (_req, res) => {
        res.end()
    })
    app.post("/api/debug/tokens", (_req, res) => {
        res.end()
    })
    app.get("/api/admin/users", (_req, res) => {
        res.end()
    })
    const paths = collectRoutePaths(expressRouteStack(app))
    assert.equal(paths.includes("GET /health"), true)
    assert.deepEqual(productionRouteViolations(paths), [
        "POST /api/debug/tokens",
        "GET /api/admin/users",
    ])
    assert.deepEqual(productionRouteViolations(["GET /health", "POST /api/referrals/qualify"]), [])
    assert.deepEqual(productionRouteViolations(["GET /administrator"]), [])
})

test("account creation velocity fails closed after the cap", () => {
    let now = 1_000_000
    const velocity = createAccountVelocity(2, 1_000, () => now)
    assert.equal(velocity.tryConsume("10.0.0.1"), true)
    assert.equal(velocity.tryConsume("10.0.0.1"), true)
    assert.equal(velocity.tryConsume("10.0.0.1"), false)
    assert.equal(velocity.tryConsume("10.0.0.2"), true)
    assert.equal(velocity.tryConsume("  "), true)
    assert.equal(velocity.tryConsume(""), true)
    assert.equal(velocity.tryConsume(""), false)
    now += 1_000
    assert.equal(velocity.tryConsume("10.0.0.1"), true)
})

test("account creation settings ignore empty and out-of-range values", () => {
    assert.deepEqual(accountCreateSettings({}), { limit: 5, windowMs: 3_600_000 })
    assert.deepEqual(
        accountCreateSettings({ ACCOUNT_CREATE_LIMIT: "12", ACCOUNT_CREATE_WINDOW_MS: "120000" }),
        { limit: 12, windowMs: 120_000 }
    )
    assert.equal(readBoundedInt("0", 5, 1, 100), 5)
    assert.equal(readBoundedInt("10000", 5, 1, 100), 5)
    assert.equal(readBoundedInt("nope", 5, 1, 100), 5)
})

test("the three-referral reward gate still withholds points", () => {
    assert.equal(pointsForQualifyingEvent(REFERRALS_REQUIRED - 1, 100), 0)
    assert.equal(pointsForQualifyingEvent(REFERRALS_REQUIRED, 100), 100)
    assert.equal(rewardsUnlocked(2), false)
    assert.equal(rewardsUnlocked(3), true)
})

async function withServer(
    app: ReturnType<typeof express>,
    run: (base: string) => Promise<void>
) {
    const server = app.listen(0)
    await new Promise<void>((resolve) => server.once("listening", () => resolve()))
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("expected a TCP port")
    try {
        await run(`http://127.0.0.1:${address.port}`)
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close((err) => (err ? reject(err) : resolve()))
        })
    }
}

test("security headers and CORS fail closed for a disallowed origin", async () => {
    const app = express()
    applySecurityMiddleware(app, {
        nodeEnv: "production",
        corsOrigins: resolveCorsOrigins(undefined, "production"),
    })
    app.get("/health", (_req, res) => {
        res.status(200).json({ ok: true, service: "koliath-rewards" })
    })
    app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
        if (handleCorsError(err, res)) return
        next(err)
    })

    await withServer(app, async (base) => {
        const health = await fetch(`${base}/health`)
        assert.equal(health.status, 200)
        assert.equal(health.headers.get("x-content-type-options"), "nosniff")
        assert.equal(health.headers.get("x-frame-options"), "DENY")
        assert.match(health.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/)
        assert.match(health.headers.get("content-security-policy") ?? "", /default-src 'self'/)
        assert.match(health.headers.get("strict-transport-security") ?? "", /max-age=31536000/)
        assert.match(health.headers.get("strict-transport-security") ?? "", /includeSubDomains/)
        assert.equal(health.headers.get("x-powered-by"), null)
        assert.match(health.headers.get("permissions-policy") ?? "", /camera=\(\)/)
        assert.equal(health.headers.get("cross-origin-opener-policy"), "same-origin-allow-popups")

        const blocked = await fetch(`${base}/health`, { headers: { Origin: "https://evil.example" } })
        assert.equal(blocked.status, 403)
        const blockedBody = (await blocked.json()) as { message?: string }
        assert.equal(blockedBody.message, "Origin not allowed")

        const allowed = await fetch(`${base}/health`, { headers: { Origin: "https://koliath.in" } })
        assert.equal(allowed.status, 200)
        assert.equal(allowed.headers.get("access-control-allow-origin"), "https://koliath.in")
    })
})

test("the public app keeps /health, redirects /admin, and does not mount debug APIs", async () => {
    const require = createRequire(import.meta.url)
    const { createApp } = require("../dist/app.js") as {
        createApp: () => ReturnType<typeof express>
    }
    const app = createApp()
    const paths = collectRoutePaths(expressRouteStack(app))
    assert.deepEqual(productionRouteViolations(paths), [])
    assert.equal(paths.includes("GET /health"), true)
    assert.equal(paths.includes("POST /api/referrals/qualify"), true)
    assert.equal(paths.includes("POST /api/referrals/redeem"), true)
    assert.equal(paths.some((routePath) => routePath.includes("/api/admin")), false)
    assert.equal(paths.some((routePath) => routePath.includes("/debug")), false)
    assert.equal(devOnlyRouteTable().length, 0)

    await withServer(app, async (base) => {
        const health = await fetch(`${base}/health`)
        assert.equal(health.status, 200)
        const healthBody = (await health.json()) as { ok?: boolean; service?: string }
        assert.equal(healthBody.ok, true)
        assert.equal(healthBody.service, "koliath-rewards")
        assert.equal(health.headers.get("x-content-type-options"), "nosniff")
        assert.equal(health.headers.get("x-frame-options"), "DENY")

        const alias = await fetch(`${base}/api/health`)
        assert.equal(alias.status, 200)
        assert.equal(alias.headers.get("cache-control"), "no-store")

        const admin = await fetch(`${base}/admin`, { redirect: "manual" })
        assert.equal(admin.status, 302)
        assert.equal(admin.headers.get("location"), "https://admin.koliath.in/")

        const adminApi = await fetch(`${base}/api/admin/users`)
        assert.equal(adminApi.status, 404)
        const adminBody = (await adminApi.json()) as { message?: string }
        assert.equal(adminBody.message, "Not found")

        const debug = await fetch(`${base}/api/debug`)
        assert.equal(debug.status, 404)
        const debugBody = (await debug.json()) as { success?: boolean }
        assert.equal(debugBody.success, false)

        const map = await fetch(`${base}/assets/app.js.map`)
        assert.equal(map.status, 404)
    })
})

test("development responses omit HSTS", async () => {
    const app = express()
    applySecurityMiddleware(app, {
        nodeEnv: "development",
        corsOrigins: resolveCorsOrigins(undefined, "development"),
    })
    app.get("/health", (_req, res) => {
        res.status(200).json({ ok: true })
    })
    await withServer(app, async (base) => {
        const health = await fetch(`${base}/health`)
        assert.equal(health.status, 200)
        assert.equal(health.headers.get("strict-transport-security"), null)
        assert.equal(health.headers.get("x-content-type-options"), "nosniff")
    })
})
