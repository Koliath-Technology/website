/**
 * Env-driven rewards program. The backend is the source of truth.
 * Install payouts stay on apps.points_awarded (ledger event install_reward,
 * the public APP_INSTALL name). This module does not talk to the database.
 */

export const LEDGER_EVENT = {
    FIRST_LOGIN_REWARD: "FIRST_LOGIN_REWARD",
    /** Existing install-verification event. Do not rename; unique indexes depend on it. */
    APP_INSTALL: "install_reward",
    REFERRAL_REWARD: "REFERRAL_REWARD",
    GIFT_CARD_REDEEM: "GIFT_CARD_REDEEM",
} as const

/** Granted signup referrals per referrer per hour before new ones are rejected. */
export const REFERRAL_VELOCITY_PER_HOUR = 8

export type RewardProgram = {
    firstLoginRewardCoins: number
    appDownloadRewardCoins: number
    referralRewardCoins: number
    giftCardCostCoins: number
    giftCardValueInr: number
    referralsRequiredForRedemption: number
    verificationTokenExpiryMinutes: number
}

function clampInt(value: string | undefined, fallback: number, min: number, max: number): number {
    if (value == null || value.trim() === "") return fallback
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return fallback
    return Math.min(max, Math.max(min, Math.floor(parsed)))
}

export function readRewardProgram(env: NodeJS.ProcessEnv = process.env): RewardProgram {
    return {
        firstLoginRewardCoins: clampInt(env.FIRST_LOGIN_REWARD_COINS, 10, 0, 100_000),
        appDownloadRewardCoins: clampInt(env.APP_DOWNLOAD_REWARD_COINS, 25, 0, 10_000),
        referralRewardCoins: clampInt(env.REFERRAL_REWARD_COINS, 20, 0, 100_000),
        giftCardCostCoins: clampInt(env.GIFT_CARD_COST_COINS, 200, 1, 1_000_000),
        giftCardValueInr: clampInt(env.GIFT_CARD_VALUE_INR, 100, 1, 1_000_000),
        referralsRequiredForRedemption: clampInt(env.REFERRALS_REQUIRED_FOR_REDEMPTION, 3, 0, 10_000),
        verificationTokenExpiryMinutes: clampInt(env.VERIFICATION_TOKEN_EXPIRY_MINUTES, 1440, 1, 1440),
    }
}

export const rewardProgram = readRewardProgram()

export type GiftCardAssessment = {
    eligible: boolean
    costCoins: number
    valueInr: number
    referralsRequired: number
    pointsAvailable: number
    validReferrals: number
    coinsShort: number
    referralsShort: number
}

export function assessGiftCard(input: {
    pointsAvailable: number
    validReferrals: number
    program?: RewardProgram
}): GiftCardAssessment {
    const program = input.program ?? rewardProgram
    const pointsAvailable = Math.max(0, Math.floor(input.pointsAvailable))
    const validReferrals = Math.max(0, Math.floor(input.validReferrals))
    const coinsShort = Math.max(0, program.giftCardCostCoins - pointsAvailable)
    const referralsShort = Math.max(0, program.referralsRequiredForRedemption - validReferrals)
    return {
        eligible: coinsShort === 0 && referralsShort === 0,
        costCoins: program.giftCardCostCoins,
        valueInr: program.giftCardValueInr,
        referralsRequired: program.referralsRequiredForRedemption,
        pointsAvailable,
        validReferrals,
        coinsShort,
        referralsShort,
    }
}

export type SignupReferralSignals = {
    referrerUserId: number
    referredUserId: number
    referrerEmail: string
    referredEmail: string
    referrerRisk: string
    referredRisk: string
    referrerAccount: string
    referredAccount: string
    mutualLoop: boolean
    deviceSharedWithOtherUser: boolean
    recentGranted: number
    velocityLimit?: number
}

export type SignupReferralDecision = {
    grant: boolean
    reason: "ok" | "self_referral" | "blocked_account" | "referral_loop" | "same_device" | "velocity"
}

export function signupReferralDecision(input: SignupReferralSignals): SignupReferralDecision {
    const samePerson =
        input.referrerUserId === input.referredUserId ||
        input.referrerEmail.trim().toLowerCase() === input.referredEmail.trim().toLowerCase()
    if (samePerson) return { grant: false, reason: "self_referral" }

    const blocked = (risk: string, account: string) =>
        risk === "BLOCKED" || account === "suspended"
    if (
        blocked(input.referrerRisk, input.referrerAccount) ||
        blocked(input.referredRisk, input.referredAccount)
    ) {
        return { grant: false, reason: "blocked_account" }
    }

    if (input.mutualLoop) return { grant: false, reason: "referral_loop" }
    if (input.deviceSharedWithOtherUser) return { grant: false, reason: "same_device" }

    const limit = input.velocityLimit ?? REFERRAL_VELOCITY_PER_HOUR
    if (input.recentGranted >= limit) return { grant: false, reason: "velocity" }
    return { grant: true, reason: "ok" }
}

/** Client-facing referral result. Fraud reasons stay in the database. */
export function publicReferralOutcome(decision: SignupReferralDecision): { status: "granted" | "rejected" } {
    return { status: decision.grant ? "granted" : "rejected" }
}
