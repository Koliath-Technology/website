import { API_ROOT, ApiError, authHeaders, parseJson } from "./api"
import { decorateDownloadUrl } from "./downloads"

export interface StartInstallResponse {
    success: true
    status: string
    verificationToken: string
    expiresAt: string
    appId: string
    sessionId: string
    pointsAwarded: number
    pointsIfVerified: number
    alreadyRewarded: boolean
}

export function clientPlatform(): "android" | "ios" {
    if (typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent)) return "ios"
    return "android"
}

export async function startInstallVerification(slug: string): Promise<StartInstallResponse> {
    const response = await fetch(`${API_ROOT}/api/v1/installations/start`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(true),
        body: JSON.stringify({ slug, platform: clientPlatform() }),
    })
    return parseJson<StartInstallResponse>(response)
}

export async function openVerifiedDownload(options: {
    slug: string
    loggedIn: boolean
    refCode: string | null
    storeUrl?: string
    onMissingStore: (verification?: { token: string; appId: string }) => void
}): Promise<string> {
    let verification: { token: string; appId: string } | undefined
    let message =
        "Download opened. Clicking Download does not award points."

    if (!options.loggedIn) {
        message =
            "Sign in on Earn before downloading if you want this install to be eligible for verification. This click does not award points."
    } else {
        try {
            const started = await startInstallVerification(options.slug)
            verification = { token: started.verificationToken, appId: started.appId }
            message = started.alreadyRewarded
                ? "This account already has an install reward for that app. This click did not add points."
                : `Verification started. No points were added. If the app confirms the install, the server may award up to ${started.pointsIfVerified} points.`
        } catch (error) {
            const detail = error instanceof ApiError ? error.message : "Verification could not be started."
            message = `${detail} The store can still open, and this click did not award points.`
        }
    }

    if (options.storeUrl) {
        const target = decorateDownloadUrl(options.storeUrl, {
            refCode: options.refCode,
            verificationToken: verification?.token,
            appId: verification?.appId,
        })
        if (target) {
            window.open(target, "_blank", "noopener,noreferrer")
            return message
        }
    }

    if (verification && !options.storeUrl) {
        message += " No store link is configured, so the verification token could not be attached to a store URL."
    }
    options.onMissingStore(verification)
    return message
}

async function sendJson<T>(path: string, method: string, body?: unknown): Promise<T> {
    const response = await fetch(`${API_ROOT}${path}`, {
        method,
        credentials: "include",
        headers: authHeaders(method !== "GET"),
        body: body === undefined ? undefined : JSON.stringify(body),
    })
    return parseJson<T>(response)
}

export interface DeveloperApp {
    id: number
    appId: string
    slug: string | null
    name: string
    packageId: string
    platform: string
    status: string
    pointsAwarded: number
    stats?: { pending: number; verified: number; rejected: number; rewardPoints: number }
}

export function fetchDeveloperApps() {
    return sendJson<{ apps: DeveloperApp[] }>("/api/developer/apps", "GET")
}

export function registerDeveloperApp(body: {
    name: string
    packageId: string
    platform: "android" | "ios"
    company?: string
}) {
    return sendJson<{ app: DeveloperApp; message: string }>("/api/developer/apps", "POST", body)
}

export function issueDeveloperCredential(appId: string) {
    return sendJson<{ secret: string; prefix: string; message: string }>(
        `/api/developer/apps/${encodeURIComponent(appId)}/credentials`,
        "POST"
    )
}
