/**
 * Optional store links. Leave the env vars empty locally — download buttons
 * then send people to Contact instead of a fake store URL.
 * Production builds drop any link that still points at localhost.
 */
function publicDownloadUrl(value: string | undefined): string | undefined {
    const raw = value?.trim()
    if (!raw) return undefined
    try {
        const url = new URL(raw)
        const https = url.protocol === "https:"
        const localHttp = url.protocol === "http:" && !import.meta.env.PROD
        if (!https && !localHttp) return undefined
        if (import.meta.env.PROD && /localhost|127\.0\.0\.1/i.test(url.hostname)) return undefined
        return url.toString()
    } catch {
        return undefined
    }
}

export const downloadUrls: Record<string, string | undefined> = {
    sapient: publicDownloadUrl(import.meta.env.VITE_DOWNLOAD_SAPIENT),
    adverts: publicDownloadUrl(import.meta.env.VITE_DOWNLOAD_ADVERTS),
    "adverts-rewards": publicDownloadUrl(import.meta.env.VITE_DOWNLOAD_ADVERTS_REWARDS),
    "advert-cohort": publicDownloadUrl(import.meta.env.VITE_DOWNLOAD_ADVERT_COHORT),
    "diabetic-buddy": publicDownloadUrl(import.meta.env.VITE_DOWNLOAD_DIABETIC_BUDDY),
}

export function decorateDownloadUrl(
    url: string,
    options: { refCode: string | null; verificationToken?: string; appId?: string }
): string {
    const withRef = withReferral(url, options.refCode)
    try {
        const next = new URL(withRef || url)
        if (next.protocol !== "https:" && next.protocol !== "http:") return ""
        if (options.verificationToken && options.appId) {
            if (next.hostname === "play.google.com") {
                const current = next.searchParams.get("referrer") ?? ""
                const piece = `koliath_verification_token=${encodeURIComponent(options.verificationToken)}&koliath_app_id=${encodeURIComponent(options.appId)}`
                next.searchParams.set("referrer", current ? `${current}&${piece}` : piece)
            } else {
                next.searchParams.set("koliath_verification_token", options.verificationToken)
                next.searchParams.set("koliath_app_id", options.appId)
            }
        }
        return next.toString()
    } catch {
        return ""
    }
}

export function withReferral(url: string, refCode: string | null): string {
    try {
        const next = new URL(url, window.location.origin)
        if (next.protocol !== "https:" && next.protocol !== "http:") return ""
        if (refCode && !next.searchParams.get("ref")) next.searchParams.set("ref", refCode)
        return next.toString()
    } catch {
        return ""
    }
}
