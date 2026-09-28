/**
 * Runs on the app developer's backend. The Koliath app secret stays in this
 * process environment. Do not import this file from the website or the mobile app.
 */

export interface ConfirmInstallInput {
    apiBase: string
    appSecret: string
    verificationToken: string
    appId: string
    installationId: string
    platform: "android" | "ios"
    deviceKey?: string
    osVersion?: string
    appVersion?: string
}

export interface ConfirmInstallResult {
    verified: boolean
    reward_status: "granted" | "already_granted" | "rejected"
    points: number
    reason?: string
}

export async function confirmInstall(input: ConfirmInstallInput): Promise<ConfirmInstallResult> {
    const response = await fetch(new URL("/api/v1/installations/verify", input.apiBase), {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${input.appSecret}`,
        },
        body: JSON.stringify({
            verification_token: input.verificationToken,
            app_id: input.appId,
            installation_id: input.installationId,
            platform: input.platform,
            device_key: input.deviceKey,
            os_version: input.osVersion,
            app_version: input.appVersion,
        }),
    })
    return (await response.json()) as ConfirmInstallResult
}

// Example wiring: secret comes from the host, never from the request body.
export async function handleAppReport(body: {
    verificationToken?: string
    appId?: string
    installationId?: string
    platform?: "android" | "ios"
    deviceKey?: string
}): Promise<ConfirmInstallResult> {
    const appSecret = process.env.KOLIATH_APP_SECRET ?? ""
    const apiBase = process.env.KOLIATH_API_BASE ?? "https://koliath.in"
    if (!appSecret || !body.verificationToken || !body.appId || !body.installationId || !body.platform) {
        return { verified: false, reward_status: "rejected", points: 0, reason: "invalid_request" }
    }
    return confirmInstall({
        apiBase,
        appSecret,
        verificationToken: body.verificationToken,
        appId: body.appId,
        installationId: body.installationId,
        platform: body.platform,
        deviceKey: body.deviceKey,
    })
}
