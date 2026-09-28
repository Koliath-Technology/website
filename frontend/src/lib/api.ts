import { csrfCookieName } from "./adminHost"

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

export class ApiError extends Error {
    status: number

    constructor(status: number, message: string) {
        super(message)
        this.name = "ApiError"
        this.status = status
    }
}

function readCsrfCookie(): string | null {
    if (typeof document === "undefined") return null
    const name = csrfCookieName()
    for (const part of document.cookie.split("; ")) {
        if (part.startsWith(`${name}=`)) {
            return decodeURIComponent(part.slice(name.length + 1))
        }
    }
    return null
}

export function authHeaders(includeCsrf: boolean): HeadersInit {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    }
    if (includeCsrf) {
        const csrf = readCsrfCookie()
        if (csrf) headers["X-CSRF-Token"] = csrf
    }
    return headers
}

export async function parseJson<T>(response: Response): Promise<T> {
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
        const raw =
            (data as { message?: string; msg?: string }).message ||
            (data as { msg?: string }).msg ||
            "Request failed"
        const message = typeof raw === "string" ? raw : "Request failed"
        throw new ApiError(response.status, message)
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
    installPoints?: number
    accountStatus?: string
    riskStatus?: string
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
    validReferrals?: number
    rewardProgram?: RewardProgram
    giftCard?: GiftCardStatus
}

export interface RewardProgram {
    firstLoginRewardCoins: number
    appDownloadRewardCoins: number
    referralRewardCoins: number
    giftCardCostCoins: number
    giftCardValueInr: number
    referralsRequiredForRedemption: number
    verificationTokenExpiryMinutes: number
    effectiveVerificationTokenSeconds?: number
    installPayout?: string
    installLedgerEvent?: string
}

export interface GiftCardStatus {
    eligible: boolean
    costCoins: number
    valueInr: number
    referralsRequired: number
    pointsAvailable: number
    validReferrals: number
    coinsShort: number
    referralsShort: number
}

export interface Reward {
    id: number
    title: string
    points_cost: number
    category: string
    required_referrals?: number
}

export async function exchangeGoogleToken(
    idToken: string,
    attribution?: { referralCode?: string; deviceKey?: string }
): Promise<DashboardUser> {
    const body: { idToken: string; referralCode?: string; deviceKey?: string } = { idToken }
    const referralCode = attribution?.referralCode?.trim()
    const deviceKey = attribution?.deviceKey?.trim()
    if (referralCode && referralCode.length >= 4 && referralCode.length <= 20) {
        body.referralCode = referralCode
    }
    if (deviceKey && deviceKey.length >= 5 && deviceKey.length <= 160) {
        body.deviceKey = deviceKey
    }
    const response = await fetch(`${API_ROOT}/api/auth/firebase`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(false),
        body: JSON.stringify(body),
    })
    const data = await parseJson<{ success: boolean; user: DashboardUser }>(response)
    return data.user
}

export async function fetchMe(): Promise<DashboardUser> {
    const response = await fetch(`${API_ROOT}/api/me`, {
        credentials: "include",
        headers: authHeaders(false),
    })
    return parseJson<DashboardUser>(response)
}

export async function logoutSession(): Promise<void> {
    const response = await fetch(`${API_ROOT}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(true),
    })
    await parseJson<{ success: boolean }>(response)
}

export async function fetchRewardProgram(): Promise<RewardProgram> {
    const response = await fetch(`${API_ROOT}/api/rewards/program`)
    return parseJson<RewardProgram>(response)
}

export async function redeemGiftCard(idempotencyKey: string) {
    const response = await fetch(`${API_ROOT}/api/rewards/gift-card`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(true),
        body: JSON.stringify({ idempotencyKey }),
    })
    return parseJson<{ success: boolean; alreadyRedeemed: boolean; points: number; valueInr: number }>(response)
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

export async function redeemReward(rewardId: number, contactEmail?: string) {
    const response = await fetch(`${API_ROOT}/api/referrals/redeem`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(true),
        body: JSON.stringify({ rewardId, contactEmail }),
    })
    return parseJson<{ success: boolean; message: string }>(response)
}
