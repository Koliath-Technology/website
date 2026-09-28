import helmet from "helmet"
import type { RequestHandler } from "express"

/**
 * CSP shared by both hosts. The admin host tightens framing and resource
 * policy so https://koliath.in cannot frame or read the console.
 * connect-src stays on this origin plus Google sign-in. It does not list
 * the marketing origin.
 */
function cspDirectives(frameAncestors: string[]) {
    return {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors,
        formAction: ["'self'"],
        scriptSrc: ["'self'", "https://accounts.google.com", "https://apis.google.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https://*.googleusercontent.com", "https://*.gstatic.com"],
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
    }
}

export function createSecurityHeaders(isAdminHost: (hostname: string) => boolean): RequestHandler {
    const publicHelmet = helmet({
        contentSecurityPolicy: {
            useDefaults: true,
            directives: cspDirectives(["'self'"]),
        },
        crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
        crossOriginResourcePolicy: { policy: "same-site" },
    })
    const adminHelmet = helmet({
        contentSecurityPolicy: {
            useDefaults: true,
            directives: cspDirectives(["'none'"]),
        },
        crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
        crossOriginResourcePolicy: { policy: "same-origin" },
    })

    return (req, res, next) => {
        if (!isAdminHost(req.hostname)) {
            return publicHelmet(req, res, next)
        }
        res.setHeader("X-Robots-Tag", "noindex, nofollow")
        return adminHelmet(req, res, next)
    }
}
