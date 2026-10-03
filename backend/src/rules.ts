/**
 * Per-app referral qualification rules.
 * Points are paid only after the app's use check, and only once the
 * referrer already has three referrals. Rewards stay locked before that.
 */
export type SourceApp = "diabetic" | "sapient" | "adverts" | "adverts_rewards" | "advert_cohort"

export type QualificationEvent =
    | "signup"
    | "day_active"
    | "purchase"
    | "install"
    | "profile_completed"

export const REFERRALS_REQUIRED = 3

export const REWARD_GATE_COPY =
    "You get no reward points until you have three referrals. Before that, rewards stay locked."

export interface AppReferralRule {
    app: SourceApp
    slug: string
    label: string
    /**
     * Plain-language use check. Null means this listing has no defined check,
     * so the public line must not invent one.
     */
    useCheck: string | null
    /** Event that confirms the use check for the referrer */
    confirmOn: QualificationEvent
    /** Points awarded on confirmation, after the three-referral gate is already met */
    points: number
    /** Whether signup alone creates a pending referral */
    trackPendingOnSignup: boolean
}

export function publicRewardRule(label: string, useCheck: string | null): string {
    const gate = "only if you already have three referrals"
    if (!useCheck) {
        return `Points for ${label} are paid only after that app's own use check, and ${gate}.`
    }
    return `${useCheck}, and ${gate}.`
}

export const APP_REFERRAL_RULES: Record<SourceApp, AppReferralRule> = {
    sapient: {
        app: "sapient",
        slug: "sapient",
        label: "Sapient",
        useCheck: "Points for Sapient are awarded only when the person completes their profile",
        confirmOn: "profile_completed",
        points: 100,
        trackPendingOnSignup: true,
    },
    adverts: {
        app: "adverts",
        slug: "adverts",
        label: "Adverts",
        useCheck: "Points for Adverts are awarded only after the person completes a purchase",
        confirmOn: "purchase",
        points: 100,
        trackPendingOnSignup: true,
    },
    adverts_rewards: {
        app: "adverts_rewards",
        slug: "adverts-rewards",
        label: "Adverts Rewards",
        useCheck:
            "Points for Adverts Rewards are awarded only after the person completes their first verified watch session",
        confirmOn: "day_active",
        points: 50,
        trackPendingOnSignup: true,
    },
    advert_cohort: {
        app: "advert_cohort",
        slug: "advert-cohort",
        label: "Advert Cohort",
        useCheck:
            "Points for Advert Cohort are awarded only after the person creates a profile and sets a rate card",
        confirmOn: "day_active",
        points: 75,
        trackPendingOnSignup: true,
    },
    diabetic: {
        app: "diabetic",
        slug: "diabetic-buddy",
        label: "Diabetic Buddy",
        useCheck:
            "Points for Diabetic Buddy are awarded only after the person signs up and completes first-day onboarding",
        confirmOn: "signup",
        points: 100,
        trackPendingOnSignup: true,
    },
}

export function isSourceApp(value: string): value is SourceApp {
    return value in APP_REFERRAL_RULES
}

export function getRule(app: SourceApp): AppReferralRule {
    return APP_REFERRAL_RULES[app]
}

export function publicSlugFor(app: SourceApp): string {
    return APP_REFERRAL_RULES[app].slug
}

export function isPublicSlug(value: string): boolean {
    return Object.values(APP_REFERRAL_RULES).some((rule) => rule.slug === value)
}

/** Points for a passed use check. The three-referral gate must already be met. */
export function pointsForQualifyingEvent(existingReferrals: number, rulePoints: number): number {
    if (existingReferrals >= REFERRALS_REQUIRED) return rulePoints
    return 0
}

export function rewardsUnlocked(totalReferrals: number): boolean {
    return totalReferrals >= REFERRALS_REQUIRED
}

export function spendablePoints(totalReferrals: number, earned: number, spent: number): number {
    if (!rewardsUnlocked(totalReferrals)) return 0
    return Math.max(0, earned - spent)
}

export function listPublicRules() {
    return Object.values(APP_REFERRAL_RULES).map((rule) => ({
        app: rule.app,
        slug: rule.slug,
        label: rule.label,
        description: publicRewardRule(rule.label, rule.useCheck),
        confirmOn: rule.confirmOn,
        points: rule.points,
    }))
}
