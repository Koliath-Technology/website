export const INSTALL_STATUS = {
    DOWNLOAD_STARTED: "DOWNLOAD_STARTED",
    PENDING_VERIFICATION: "PENDING_VERIFICATION",
    VERIFIED: "VERIFIED",
    REWARD_GRANTED: "REWARD_GRANTED",
    REJECTED: "REJECTED",
    EXPIRED: "EXPIRED",
    SUSPICIOUS: "SUSPICIOUS",
} as const

export type InstallStatus = (typeof INSTALL_STATUS)[keyof typeof INSTALL_STATUS]

export const REWARD_EVENT = "install_reward"

export const RISK_STATUS = {
    NORMAL: "NORMAL",
    REVIEW: "REVIEW",
    BLOCKED: "BLOCKED",
} as const

export type RiskStatus = (typeof RISK_STATUS)[keyof typeof RISK_STATUS]

export const ACCOUNT_STATUS = {
    ACTIVE: "active",
    SUSPENDED: "suspended",
} as const
