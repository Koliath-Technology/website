import helmet from "helmet"
import type { RequestHandler } from "express"

/**
 * CSP for the public site. connect-src is this origin plus Google sign-in.
 * The admin console is a different service and is not framed from here.
 */
const securityHeaders: RequestHandler = helmet({
    contentSecurityPolicy: {
        useDefaults: true,
        directives: {
            defaultSrc: ["'self'"],
            baseUri: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'self'"],
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
        },
    },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    crossOriginResourcePolicy: { policy: "same-site" },
})

export { securityHeaders }
