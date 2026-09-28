import type { RiskStatus } from "../installations/constants"

export type FraudSeverity = "low" | "medium" | "high"
export type FraudEffect = "flag" | "deny_reward"

export interface FraudSignal {
    id: string
    severity: FraudSeverity
    effect: FraudEffect
    /** Desired account risk. The decider may lower this so one weak signal cannot block. */
    suggestedRisk: RiskStatus
    detail?: Record<string, unknown>
}

export interface FraudThresholds {
    /** Distinct accounts on one app-generated device before a review flag. */
    deviceAccountsFlag: number
    /** Distinct accounts before the reward is denied and the user is marked REVIEW. */
    deviceAccountsDeny: number
    /** Distinct accounts before rewards are denied and risk becomes BLOCKED. */
    deviceAccountsBlock: number
    downloadsPerUserPerHourFlag: number
    downloadsPerUserPerHourDeny: number
    /** Failed or rejected verify attempts from one hashed IP in an hour. */
    verifyFailuresPerIpPerHour: number
}

export const DEFAULT_FRAUD_THRESHOLDS: FraudThresholds = {
    deviceAccountsFlag: 3,
    deviceAccountsDeny: 5,
    deviceAccountsBlock: 8,
    downloadsPerUserPerHourFlag: 6,
    downloadsPerUserPerHourDeny: 12,
    verifyFailuresPerIpPerHour: 10,
}

export interface FraudDecision {
    grantReward: boolean
    riskStatus: RiskStatus
    signals: FraudSignal[]
}

const RISK_RANK: Record<RiskStatus, number> = {
    NORMAL: 0,
    REVIEW: 1,
    BLOCKED: 2,
}

/**
 * Deterministic fraud decision.
 * BLOCKED is only reached from a high-severity signal. A single weak (low or
 * medium) signal can flag the account as REVIEW or deny that reward, and it
 * cannot permanent-block the account. Existing BLOCKED/REVIEW rows are
 * preserved by the caller; this function only reports the status implied by
 * the signals in front of it.
 */
export function decideFraud(signals: FraudSignal[]): FraudDecision {
    if (signals.length === 0) {
        return { grantReward: true, riskStatus: "NORMAL", signals }
    }

    const grantReward = !signals.some((signal) => signal.effect === "deny_reward")
    let riskStatus: RiskStatus = "NORMAL"

    for (const signal of signals) {
        let suggested = signal.suggestedRisk
        if (suggested === "BLOCKED" && signal.severity !== "high") {
            suggested = "REVIEW"
        }
        if (RISK_RANK[suggested] > RISK_RANK[riskStatus]) {
            riskStatus = suggested
        }
    }

    return { grantReward, riskStatus, signals }
}

export function mergeThresholds(overrides?: Partial<FraudThresholds>): FraudThresholds {
    return { ...DEFAULT_FRAUD_THRESHOLDS, ...overrides }
}
