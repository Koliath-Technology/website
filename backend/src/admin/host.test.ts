process.env.NODE_ENV = "test"

import assert from "node:assert/strict"
import http from "node:http"
import type { Server } from "node:http"
import test from "node:test"
import cookieParser from "cookie-parser"
import express from "express"
import {
    adminUiDecision,
    buildAdminRuntime,
    catalogAdminHostDenial,
    createHostSecurity,
    isPublicMarketingHost,
    normalizeHostname,
    resolveAdminApiHosts,
    resolveAdminCorsOrigins,
    resolveAdminOrigin,
    type AdminRuntime,
} from "./host"
import {
    clearSessionCookies,
    requireAuth,
    sessionCookieAttributes,
    sessionCookieScopeFor,
    setSessionCookies,
} from "../auth"

const production = buildAdminRuntime({
    isProd: true,
    publicCorsOrigins: ["https://koliath.in", "https://www.koliath.in"],
})

const development = buildAdminRuntime({
    isProd: false,
    publicCorsOrigins: ["http://localhost:5173", "https://koliath.in", "https://www.koliath.in"],
})

function headerValue(value: string | string[] | undefined): string {
    if (!value) return ""
    return Array.isArray(value) ? value.join("\n") : value
}

function setCookieHeaders(headers: http.IncomingHttpHeaders): string[] {
    const value = headers["set-cookie"]
    if (!value) return []
    return Array.isArray(value) ? value : [value]
}

async function listen(app: express.Express): Promise<{ port: number; close: () => Promise<void> }> {
    const server = await new Promise<Server>((resolve) => {
        const listening = app.listen(0, "127.0.0.1", () => resolve(listening))
    })
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("expected a TCP port")
    return {
        port: address.port,
        close: () =>
            new Promise((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()))
            }),
    }
}

function request(
    port: number,
    options: {
        path: string
        hostHeader: string
        method?: string
        origin?: string
        cookie?: string
        headers?: Record<string, string>
    }
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                hostname: "127.0.0.1",
                port,
                path: options.path,
                method: options.method ?? "GET",
                headers: {
                    Host: options.hostHeader,
                    ...(options.origin ? { Origin: options.origin } : {}),
                    ...(options.cookie ? { Cookie: options.cookie } : {}),
                    ...(options.headers ?? {}),
                },
            },
            (res) => {
                const chunks: Buffer[] = []
                res.on("data", (chunk: Buffer) => chunks.push(chunk))
                res.on("end", () => {
                    resolve({
                        status: res.statusCode ?? 0,
                        headers: res.headers,
                        body: Buffer.concat(chunks).toString("utf8"),
                    })
                })
            }
        )
        req.on("error", reject)
        req.end()
    })
}

function apiApp(runtime: AdminRuntime) {
    const hosts = createHostSecurity(runtime)
    const app = express()
    app.use(hosts.securityHeaders)
    app.use(hosts.selectCors)
    app.get("/api/health", (_req, res) => {
        res.status(200).json({ ok: true })
    })
    app.use("/api/admin", hosts.requireAdminHost, hosts.adminCors)
    app.get("/api/admin/verification/overview", (_req, res) => {
        res.status(401).json({ success: false, message: "Authentication required" })
    })
    app.use(hosts.adminUiGate)
    app.use((_req, res) => {
        res.status(200).type("html").send("SPA-INDEX")
    })
    app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
        if (err instanceof Error && err.message === "Not allowed by CORS") {
            res.status(403).json({ success: false, message: "Origin not allowed" })
            return
        }
        next(err)
    })
    return app
}

test("normalizeHostname strips ports, dots, and schemes", () => {
    assert.equal(normalizeHostname("Admin.Koliath.in:443"), "admin.koliath.in")
    assert.equal(normalizeHostname("admin.koliath.in."), "admin.koliath.in")
    assert.equal(normalizeHostname("https://www.koliath.in/admin"), "www.koliath.in")
    assert.equal(normalizeHostname("[::1]:3000"), "::1")
    assert.equal(isPublicMarketingHost("Koliath.in"), true)
    assert.equal(isPublicMarketingHost("admin.koliath.in"), false)
})

test("production admin hosts are fail-closed to admin.koliath.in", () => {
    assert.deepEqual(resolveAdminApiHosts(true, undefined), ["admin.koliath.in"])
    assert.deepEqual(resolveAdminApiHosts(true, ""), ["admin.koliath.in"])
    assert.deepEqual(resolveAdminApiHosts(true, "koliath.in,www.koliath.in"), ["admin.koliath.in"])
    assert.deepEqual(resolveAdminApiHosts(true, "admin.koliath.in,koliath.in,localhost"), ["admin.koliath.in"])
    assert.deepEqual(resolveAdminApiHosts(true, "admin.localhost"), ["admin.koliath.in"])
    assert.equal(production.apiHosts.includes("localhost"), false)
    assert.equal(production.apiHosts.includes("koliath.in"), false)
    assert.equal(production.apiHosts.includes("www.koliath.in"), false)
    assert.deepEqual(production.dedicatedHosts, ["admin.koliath.in"])
})

test("development admin APIs also allow localhost, and the UI host stays dedicated", () => {
    assert.equal(resolveAdminApiHosts(false, undefined).includes("localhost"), true)
    assert.equal(resolveAdminApiHosts(false, undefined).includes("admin.localhost"), true)
    assert.equal(development.dedicatedHosts.includes("admin.koliath.in"), true)
    assert.equal(development.dedicatedHosts.includes("admin.localhost"), true)
    assert.equal(development.dedicatedHosts.includes("localhost"), false)
    assert.equal(resolveAdminApiHosts(false, "koliath.in,admin.koliath.in").includes("koliath.in"), false)
})

test("admin CORS never allowlists the public marketing origin", () => {
    assert.equal(resolveAdminOrigin("https://koliath.in"), "https://admin.koliath.in")
    assert.equal(resolveAdminOrigin(""), "https://admin.koliath.in")
    const stripped = resolveAdminCorsOrigins({
        isProd: true,
        adminOrigin: "https://admin.koliath.in",
        adminCorsOriginsRaw: "https://koliath.in,https://www.koliath.in,https://admin.koliath.in",
    })
    assert.deepEqual(stripped, ["https://admin.koliath.in"])
    const devOrigins = resolveAdminCorsOrigins({
        isProd: false,
        adminOrigin: "https://admin.koliath.in",
    })
    assert.equal(devOrigins.includes("https://koliath.in"), false)
    assert.equal(devOrigins.includes("http://localhost:5173"), true)
    assert.equal(production.adminCorsOrigins.includes("https://koliath.in"), false)
    assert.equal(production.adminCorsOrigins.includes("https://www.koliath.in"), false)
})

test("admin UI is not served on the marketing host", () => {
    assert.equal(adminUiDecision("koliath.in", "/admin", production), "not-found")
    assert.equal(adminUiDecision("www.koliath.in", "/admin/", production), "not-found")
    assert.equal(adminUiDecision("koliath.in", "/Admin", production), "not-found")
    assert.equal(adminUiDecision("koliath.in", "/assets/admin/admin-console-abc.js", production), "not-found")
    assert.equal(adminUiDecision("localhost", "/admin", production), "not-found")
    assert.equal(adminUiDecision("admin.koliath.in", "/admin", production), "redirect")
    assert.equal(adminUiDecision("admin.koliath.in", "/assets/admin/admin-console-abc.js", production), "continue")
    assert.equal(adminUiDecision("koliath.in", "/earn", production), "continue")
    assert.equal(adminUiDecision("koliath.in", "/administrator", production), "continue")
    assert.equal(adminUiDecision("localhost", "/admin", development), "continue")
})

test("catalog admin actions require the admin API host", () => {
    assert.equal(catalogAdminHostDenial("koliath.in", true, null, 4, production)?.message, "Admin host required")
    assert.equal(catalogAdminHostDenial("www.koliath.in", true, 9, 4, production)?.message, "Admin host required")
    assert.equal(catalogAdminHostDenial("admin.koliath.in", true, null, 4, production), null)
    assert.equal(catalogAdminHostDenial("koliath.in", true, 4, 4, production), null)
    assert.equal(catalogAdminHostDenial("koliath.in", false, null, 4, production), null)
    assert.equal(catalogAdminHostDenial("localhost", true, null, 4, development), null)
})

test("admin session cookies are host-only, Strict, and named apart from the marketing session", () => {
    const admin = sessionCookieScopeFor(true, true)
    assert.equal(admin.session, "__Host-koliath_admin_session")
    assert.equal(admin.csrf, "__Host-koliath_admin_csrf")
    assert.equal(admin.sameSite, "strict")
    const attributes = sessionCookieAttributes(admin, true, true, 1000)
    assert.equal("domain" in attributes, false)
    assert.equal(attributes.secure, true)
    assert.equal(attributes.httpOnly, true)
    assert.equal(attributes.path, "/")
    assert.equal(attributes.sameSite, "strict")

    const devAdmin = sessionCookieScopeFor(true, false)
    assert.equal(devAdmin.session, "koliath_admin_session")
    assert.equal(devAdmin.sameSite, "strict")

    const marketing = sessionCookieScopeFor(false, true)
    assert.equal(marketing.session, "koliath_session")
    assert.equal(marketing.csrf, "koliath_csrf")
    assert.equal(marketing.sameSite, "lax")
    assert.equal("domain" in sessionCookieAttributes(marketing, true, true), false)
})

test("host gate, CORS, and CSP on the mounted admin middleware", async () => {
    const server = await listen(apiApp(production))
    try {
        const marketingAdmin = await request(server.port, {
            path: "/api/admin/verification/overview",
            hostHeader: "koliath.in",
            origin: "https://koliath.in",
        })
        assert.equal(marketingAdmin.status, 403)
        assert.match(marketingAdmin.body, /Admin host required/)
        assert.equal(marketingAdmin.headers["access-control-allow-origin"], undefined)

        const wwwAdmin = await request(server.port, {
            path: "/api/admin/verification/apps",
            hostHeader: "www.koliath.in",
            method: "POST",
            origin: "https://admin.koliath.in",
        })
        assert.equal(wwwAdmin.status, 403)
        assert.match(wwwAdmin.body, /Admin host required/)

        const spoofedOrigin = await request(server.port, {
            path: "/api/admin/verification/overview",
            hostHeader: "admin.koliath.in",
            origin: "https://koliath.in",
        })
        assert.equal(spoofedOrigin.status, 403)
        assert.match(spoofedOrigin.body, /Origin not allowed/)
        assert.equal(spoofedOrigin.headers["access-control-allow-origin"], undefined)

        const wwwOrigin = await request(server.port, {
            path: "/api/admin/verification/overview",
            hostHeader: "admin.koliath.in",
            origin: "https://www.koliath.in",
        })
        assert.equal(wwwOrigin.status, 403)
        assert.equal(wwwOrigin.headers["access-control-allow-origin"], undefined)

        const preflight = await request(server.port, {
            path: "/api/admin/verification/overview",
            hostHeader: "admin.koliath.in",
            method: "OPTIONS",
            origin: "https://koliath.in",
            headers: { "Access-Control-Request-Method": "GET" },
        })
        assert.equal(preflight.status, 403)
        assert.equal(preflight.headers["access-control-allow-origin"], undefined)

        const allowed = await request(server.port, {
            path: "/api/admin/verification/overview",
            hostHeader: "admin.koliath.in",
            origin: "https://admin.koliath.in",
        })
        assert.equal(allowed.status, 401)
        assert.match(allowed.body, /Authentication required/)
        assert.equal(allowed.headers["access-control-allow-origin"], "https://admin.koliath.in")

        const allowedPreflight = await request(server.port, {
            path: "/api/admin/verification/overview",
            hostHeader: "admin.koliath.in",
            method: "OPTIONS",
            origin: "https://admin.koliath.in",
            headers: { "Access-Control-Request-Method": "GET" },
        })
        assert.equal(allowedPreflight.status, 204)
        assert.equal(allowedPreflight.headers["access-control-allow-origin"], "https://admin.koliath.in")

        const publicHealth = await request(server.port, {
            path: "/api/health",
            hostHeader: "koliath.in",
            origin: "https://koliath.in",
        })
        assert.equal(publicHealth.status, 200)
        assert.equal(publicHealth.headers["access-control-allow-origin"], "https://koliath.in")
        const publicCsp = headerValue(publicHealth.headers["content-security-policy"])
        assert.match(publicCsp, /frame-ancestors 'self'/)
        assert.equal(publicHealth.headers["cross-origin-resource-policy"], "same-site")
        assert.equal(publicHealth.headers["x-robots-tag"], undefined)

        const evil = await request(server.port, {
            path: "/api/health",
            hostHeader: "koliath.in",
            origin: "https://evil.example",
        })
        assert.equal(evil.status, 403)
        assert.match(evil.body, /Origin not allowed/)

        const adminHealthFromMarketing = await request(server.port, {
            path: "/api/health",
            hostHeader: "admin.koliath.in",
            origin: "https://koliath.in",
        })
        assert.equal(adminHealthFromMarketing.status, 403)
        assert.equal(adminHealthFromMarketing.headers["access-control-allow-origin"], undefined)

        const adminHealth = await request(server.port, {
            path: "/api/health",
            hostHeader: "admin.koliath.in",
            origin: "https://admin.koliath.in",
        })
        assert.equal(adminHealth.status, 200)
        assert.equal(adminHealth.headers["access-control-allow-origin"], "https://admin.koliath.in")
        const adminCsp = headerValue(adminHealth.headers["content-security-policy"])
        assert.match(adminCsp, /frame-ancestors 'none'/)
        assert.equal(adminCsp.includes("https://koliath.in"), false)
        assert.equal(adminCsp.includes("https://www.koliath.in"), false)
        assert.equal(adminHealth.headers["cross-origin-resource-policy"], "same-origin")
        assert.match(headerValue(adminHealth.headers["x-robots-tag"]), /noindex/)

        const hiddenAdmin = await request(server.port, {
            path: "/admin",
            hostHeader: "koliath.in",
        })
        assert.equal(hiddenAdmin.status, 404)
        assert.equal(hiddenAdmin.body.includes("SPA-INDEX"), false)
        assert.match(hiddenAdmin.body, /Not found/)

        const hiddenAsset = await request(server.port, {
            path: "/assets/admin/admin-console-abc.js",
            hostHeader: "www.koliath.in",
        })
        assert.equal(hiddenAsset.status, 404)
        assert.equal(hiddenAsset.body.includes("SPA-INDEX"), false)

        const canonical = await request(server.port, {
            path: "/admin",
            hostHeader: "admin.koliath.in",
        })
        assert.equal(canonical.status, 302)
        assert.equal(canonical.headers.location, "/")

        const consoleAsset = await request(server.port, {
            path: "/assets/admin/admin-console-abc.js",
            hostHeader: "admin.koliath.in",
        })
        assert.equal(consoleAsset.status, 200)
        assert.equal(consoleAsset.body, "SPA-INDEX")

        const marketingHome = await request(server.port, {
            path: "/",
            hostHeader: "koliath.in",
        })
        assert.equal(marketingHome.status, 200)
        assert.equal(marketingHome.body, "SPA-INDEX")
    } finally {
        await server.close()
    }
})

test("admin host ignores the marketing session cookie and does not set Domain", async () => {
    const app = express()
    app.use(cookieParser())
    app.post("/api/auth/firebase", (req, res) => {
        setSessionCookies(res, "id-token", Math.floor(Date.now() / 1000) + 3600, req.hostname)
        res.status(200).json({ ok: true })
    })
    app.post("/api/auth/logout", (req, res) => {
        clearSessionCookies(res, req.hostname)
        res.status(200).json({ ok: true })
    })
    app.post("/mutate", requireAuth, (_req, res) => {
        res.status(200).json({ ok: true })
    })
    const server = await listen(app)
    try {
        const issued = await request(server.port, {
            path: "/api/auth/firebase",
            method: "POST",
            hostHeader: "admin.koliath.in",
        })
        const cookies = setCookieHeaders(issued.headers)
        assert.equal(cookies.some((cookie) => cookie.startsWith("koliath_admin_session=")), true)
        assert.equal(cookies.some((cookie) => cookie.startsWith("koliath_admin_csrf=")), true)
        assert.equal(cookies.some((cookie) => cookie.startsWith("koliath_session=")), false)
        for (const cookie of cookies) {
            assert.equal(/domain=/i.test(cookie), false)
            assert.match(cookie, /SameSite=Strict/)
            assert.match(cookie, /Path=\//)
        }
        const session = cookies.find((cookie) => cookie.startsWith("koliath_admin_session=")) ?? ""
        const csrf = cookies.find((cookie) => cookie.startsWith("koliath_admin_csrf=")) ?? ""
        assert.match(session, /HttpOnly/i)
        assert.equal(/HttpOnly/i.test(csrf), false)

        const marketingIssued = await request(server.port, {
            path: "/api/auth/firebase",
            method: "POST",
            hostHeader: "koliath.in",
        })
        const marketingCookies = setCookieHeaders(marketingIssued.headers)
        assert.equal(marketingCookies.some((cookie) => cookie.startsWith("koliath_session=")), true)
        assert.equal(marketingCookies.some((cookie) => cookie.startsWith("koliath_admin_session=")), false)
        for (const cookie of marketingCookies) {
            assert.equal(/domain=/i.test(cookie), false)
            assert.match(cookie, /SameSite=Lax/)
        }

        const replayed = await request(server.port, {
            path: "/mutate",
            method: "POST",
            hostHeader: "admin.koliath.in",
            cookie: "koliath_session=stolen; koliath_csrf=abc",
            headers: { "X-CSRF-Token": "abc" },
        })
        assert.equal(replayed.status, 401)
        assert.match(replayed.body, /Authentication required/)

        const wrongHostCookie = await request(server.port, {
            path: "/mutate",
            method: "POST",
            hostHeader: "koliath.in",
            cookie: "koliath_admin_session=stolen; koliath_admin_csrf=abc",
            headers: { "X-CSRF-Token": "abc" },
        })
        assert.equal(wrongHostCookie.status, 401)

        const missingCsrf = await request(server.port, {
            path: "/mutate",
            method: "POST",
            hostHeader: "admin.koliath.in",
            cookie: "koliath_admin_session=stolen; koliath_admin_csrf=abc",
        })
        assert.equal(missingCsrf.status, 403)
        assert.match(missingCsrf.body, /CSRF check failed/)

        const passedCsrf = await request(server.port, {
            path: "/mutate",
            method: "POST",
            hostHeader: "admin.koliath.in",
            cookie: "koliath_admin_session=stolen; koliath_admin_csrf=abc",
            headers: { "X-CSRF-Token": "abc" },
        })
        assert.notEqual(passedCsrf.status, 403)
        assert.ok(passedCsrf.status === 401 || passedCsrf.status === 503)

        const cleared = await request(server.port, {
            path: "/api/auth/logout",
            method: "POST",
            hostHeader: "admin.koliath.in",
        })
        const clearedNames = setCookieHeaders(cleared.headers).map((cookie) => cookie.split("=")[0])
        assert.deepEqual(clearedNames.sort(), ["koliath_admin_csrf", "koliath_admin_session"])
    } finally {
        await server.close()
    }
})
