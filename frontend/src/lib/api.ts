/**
 * Same-origin `/api` when `VITE_API_BASE` is empty (Vite proxy in dev, reverse
 * proxy in production). A production build never calls localhost — that value
 * is ignored so a mis-set env cannot point the live site at a developer machine.
 */
function resolveApiRoot(): string {
    const raw = (import.meta.env.VITE_API_BASE ?? "").trim().replace(/\/$/, "")
    if (import.meta.env.PROD && /localhost|127\.0\.0\.1/i.test(raw)) {
        console.error(
            "VITE_API_BASE points at localhost in a production build; ignoring it and using same-origin /api."
        )
        return ""
    }
    return raw
}

export const API_ROOT = resolveApiRoot()

function authHeaders(token?: string | null): HeadersInit {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    }
    if (token) headers.Authorization = `Bearer ${token}`
    return headers
}

async function parseJson<T>(response: Response): Promise<T> {
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
        const message =
            (data as { message?: string; msg?: string }).message ||
            (data as { msg?: string }).msg ||
            "Request failed"
        throw new Error(typeof message === "string" ? message : "Request failed")
    }
    return data as T
}

export interface ReferralRule {
    app: string
    label: string
    description: string
    confirmOn: string
    points: number
}

export interface LinkedApp {
    sourceApp: string
    appUid: string
    referralCode: string | null
    linkedAt: string
}

export interface DashboardUser {
    id: number
    email: string
    displayName: string
    pictureUrl: string | null
    globalCode: string
    codes: Array<{ code: string; sourceApp: string; createdAt: string }>
    linkedApps: LinkedApp[]
    pointsEarned: number
    pointsSpent: number
    pointsAvailable: number
    totalReferrals: number
    pendingReferrals: number
    confirmedReferrals: number
    pendingRewards: number
    redeemedRewards: number
    referralHistory: Array<{
        id: number
        referrerCode?: string
        referredAt: string
        status: string
        pointsAwarded?: number
        sourceApp?: string
        confirmedAt?: string | null
    }>
}

export interface Reward {
    id: number
    title: string
    points_cost: number
    category: string
    required_referrals?: number
}

export async function exchangeGoogleToken(idToken: string): Promise<DashboardUser> {
    const response = await fetch(`${API_ROOT}/api/auth/google`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ idToken }),
    })
    const data = await parseJson<{ success: boolean; user: DashboardUser }>(response)
    return data.user
}

export async function fetchMe(token: string): Promise<DashboardUser> {
    const response = await fetch(`${API_ROOT}/api/me`, {
        headers: authHeaders(token),
    })
    return parseJson<DashboardUser>(response)
}

export async function fetchReferralRules(): Promise<ReferralRule[]> {
    const response = await fetch(`${API_ROOT}/api/referral-rules`)
    const data = await parseJson<{ rules: ReferralRule[] }>(response)
    return data.rules
}

export async function fetchRewards(): Promise<Reward[]> {
    const response = await fetch(`${API_ROOT}/api/referrals/rewards`)
    return parseJson<Reward[]>(response)
}

export async function redeemReward(token: string, rewardId: number, contactEmail?: string) {
    const response = await fetch(`${API_ROOT}/api/referrals/redeem`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ rewardId, contactEmail }),
    })
    return parseJson<{ success: boolean; message: string }>(response)
}
