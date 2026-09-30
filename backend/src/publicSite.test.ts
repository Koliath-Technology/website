process.env.NODE_ENV = "test"
process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/koliath_install_test"

import assert from "node:assert/strict"
import http from "node:http"
import type { Server } from "node:http"
import test from "node:test"
import cookieParser from "cookie-parser"
import express from "express"
import {
    clearSessionCookies,
    requireAuth,
    sessionCookieAttributes,
    sessionCookieScope,
    setSessionCookies,
} from "./auth"
import { ADMIN_CONSOLE_URL, createPublicCors, isLegacyAdminPage, legacyAdminRedirect } from "./publicHttp"
import { securityHeaders } from "./securityHeaders"

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

function siteApp() {
    const app = express()
    app.use(securityHeaders)
    app.use(
        createPublicCors(["http://localhost:5173", "https://koliath.in", "https://www.koliath.in"])
    )
    app.get("/api/health", (_req, res) => {
        res.status(200).json({ ok: true })
    })
    app.use("/api", (_req, res) => {
        res.status(404).json({ success: false, message: "Not found" })
    })
    app.use(legacyAdminRedirect)
    app.use((req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
            next()
            return
        }
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

test("legacy admin paths are only the old console routes", () => {
    assert.equal(isLegacyAdminPage("/admin"), true)
    assert.equal(isLegacyAdminPage("/admin/"), true)
    assert.equal(isLegacyAdminPage("/Admin"), true)
    assert.equal(isLegacyAdminPage("/admin/users"), true)
    assert.equal(isLegacyAdminPage("/administrator"), false)
    assert.equal(isLegacyAdminPage("/api/admin"), false)
    assert.equal(isLegacyAdminPage("/api/admin/verification/overview"), false)
    assert.equal(isLegacyAdminPage("/earn"), false)
})

test("public session cookies ignore host and never use the old admin names", () => {
    for (const host of ["koliath.in", "admin.koliath.in", "localhost"]) {
        const scope = sessionCookieScope(host)
        assert.equal(scope.session, "koliath_session")
        assert.equal(scope.csrf, "koliath_csrf")
        assert.equal(scope.sameSite, "lax")
        const attributes = sessionCookieAttributes(scope, true, true, 1000)
        assert.equal("domain" in attributes, false)
        assert.equal(attributes.path, "/")
        assert.equal(attributes.sameSite, "lax")
    }
})

test("the public site does not mount admin APIs and redirects /admin", async () => {
    const server = await listen(siteApp())
    try {
        for (const host of ["koliath.in", "www.koliath.in", "admin.koliath.in", "localhost"]) {
            const adminApi = await request(server.port, {
                path: "/api/admin/verification/overview",
                hostHeader: host,
                origin: "https://koliath.in",
            })
            assert.equal(adminApi.status, 404)
            assert.match(adminApi.body, /Not found/)
            assert.equal(adminApi.body.includes("SPA-INDEX"), false)

            const page = await request(server.port, {
                path: "/admin",
                hostHeader: host,
            })
            assert.equal(page.status, 302)
            assert.equal(page.headers.location, ADMIN_CONSOLE_URL)
            assert.equal(page.body.includes("SPA-INDEX"), false)
        }

        const nested = await request(server.port, {
            path: "/admin/users",
            hostHeader: "koliath.in",
        })
        assert.equal(nested.status, 302)
        assert.equal(nested.headers.location, ADMIN_CONSOLE_URL)

        const lookalike = await request(server.port, {
            path: "/administrator",
            hostHeader: "koliath.in",
        })
        assert.equal(lookalike.status, 200)
        assert.equal(lookalike.body, "SPA-INDEX")

        const home = await request(server.port, {
            path: "/",
            hostHeader: "koliath.in",
        })
        assert.equal(home.status, 200)
        assert.equal(home.body, "SPA-INDEX")

        const earn = await request(server.port, {
            path: "/earn",
            hostHeader: "www.koliath.in",
        })
        assert.equal(earn.status, 200)

        const health = await request(server.port, {
            path: "/api/health",
            hostHeader: "koliath.in",
            origin: "https://koliath.in",
        })
        assert.equal(health.status, 200)
        assert.equal(health.headers["access-control-allow-origin"], "https://koliath.in")
        assert.match(headerValue(health.headers["content-security-policy"]), /frame-ancestors 'self'/)
        assert.equal(health.headers["cross-origin-resource-policy"], "same-site")

        const sameOnAdminHost = await request(server.port, {
            path: "/api/health",
            hostHeader: "admin.koliath.in",
            origin: "https://www.koliath.in",
        })
        assert.equal(sameOnAdminHost.status, 200)
        assert.equal(sameOnAdminHost.headers["access-control-allow-origin"], "https://www.koliath.in")
        assert.match(
            headerValue(sameOnAdminHost.headers["content-security-policy"]),
            /frame-ancestors 'self'/
        )

        const evil = await request(server.port, {
            path: "/api/health",
            hostHeader: "koliath.in",
            origin: "https://evil.example",
        })
        assert.equal(evil.status, 403)
        assert.match(evil.body, /Origin not allowed/)
        assert.equal(evil.headers["access-control-allow-origin"], undefined)
    } finally {
        await server.close()
    }
})

test("session cookies stay the public pair on every host", async () => {
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
        for (const host of ["koliath.in", "admin.koliath.in"]) {
            const issued = await request(server.port, {
                path: "/api/auth/firebase",
                method: "POST",
                hostHeader: host,
            })
            const cookies = setCookieHeaders(issued.headers)
            assert.equal(cookies.some((cookie) => cookie.startsWith("koliath_session=")), true)
            assert.equal(cookies.some((cookie) => cookie.startsWith("koliath_csrf=")), true)
            assert.equal(cookies.some((cookie) => cookie.includes("admin_session")), false)
            assert.equal(cookies.some((cookie) => cookie.includes("admin_csrf")), false)
            for (const cookie of cookies) {
                assert.equal(/domain=/i.test(cookie), false)
                assert.match(cookie, /SameSite=Lax/)
                assert.match(cookie, /Path=\//)
            }
            const session = cookies.find((cookie) => cookie.startsWith("koliath_session=")) ?? ""
            const csrf = cookies.find((cookie) => cookie.startsWith("koliath_csrf=")) ?? ""
            assert.match(session, /HttpOnly/i)
            assert.equal(/HttpOnly/i.test(csrf), false)
        }

        const oldAdminCookie = await request(server.port, {
            path: "/mutate",
            method: "POST",
            hostHeader: "admin.koliath.in",
            cookie: "koliath_admin_session=stolen; koliath_admin_csrf=abc",
            headers: { "X-CSRF-Token": "abc" },
        })
        assert.equal(oldAdminCookie.status, 401)

        const missingCsrf = await request(server.port, {
            path: "/mutate",
            method: "POST",
            hostHeader: "koliath.in",
            cookie: "koliath_session=stolen; koliath_csrf=abc",
        })
        assert.equal(missingCsrf.status, 403)
        assert.match(missingCsrf.body, /CSRF check failed/)

        const passedCsrf = await request(server.port, {
            path: "/mutate",
            method: "POST",
            hostHeader: "koliath.in",
            cookie: "koliath_session=stolen; koliath_csrf=abc",
            headers: { "X-CSRF-Token": "abc" },
        })
        assert.notEqual(passedCsrf.status, 403)
        assert.ok(passedCsrf.status === 401 || passedCsrf.status === 503)

        const cleared = await request(server.port, {
            path: "/api/auth/logout",
            method: "POST",
            hostHeader: "koliath.in",
        })
        const clearedNames = setCookieHeaders(cleared.headers).map((cookie) => cookie.split("=")[0])
        assert.deepEqual(clearedNames.sort(), ["koliath_csrf", "koliath_session"])
    } finally {
        await server.close()
    }
})

test("the running server redirects /admin and does not mount /api/admin", async () => {
    const { app } = await import("./index")
    const server = await listen(app)
    try {
        const page = await request(server.port, {
            path: "/admin",
            hostHeader: "koliath.in",
        })
        assert.equal(page.status, 302)
        assert.equal(page.headers.location, ADMIN_CONSOLE_URL)
        assert.equal(page.body.includes("AdminVerification"), false)

        const nested = await request(server.port, {
            path: "/admin/users",
            hostHeader: "www.koliath.in",
        })
        assert.equal(nested.status, 302)
        assert.equal(nested.headers.location, ADMIN_CONSOLE_URL)

        const adminApi = await request(server.port, {
            path: "/api/admin/verification/overview",
            hostHeader: "admin.koliath.in",
            origin: "https://koliath.in",
        })
        assert.equal(adminApi.status, 404)
        assert.match(adminApi.body, /Not found/)

        const health = await request(server.port, {
            path: "/api/health",
            hostHeader: "koliath.in",
        })
        assert.equal(health.status, 200)
        assert.match(health.body, /koliath-rewards/)
    } finally {
        await server.close()
    }
})
