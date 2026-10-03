import { z } from "zod"

const sourceAppEnum = z.enum([
    "diabetic",
    "sapient",
    "adverts",
    "adverts_rewards",
    "advert_cohort",
])

export const referralStatsQuerySchema = z.object({
    code: z.string().min(4).max(20).transform((c) => c.toUpperCase()),
})

export const redeemRewardSchema = z.object({
    rewardId: z.number().int().positive(),
    contactEmail: z.string().email().optional(),
})

export const referralEventSchema = z.object({
    referrerCode: z.string().min(4).max(20).transform((c) => c.toUpperCase()),
    referredEmail: z.string().email(),
    deviceId: z.string().min(5).max(128),
    sourceApp: sourceAppEnum.optional().default("diabetic"),
})

export const registerReferralSchema = z.object({
    code: z.string().min(4).max(20).transform((c) => c.toUpperCase()),
    sourceApp: sourceAppEnum,
    ownerEmail: z.string().email().optional(),
})

export const referralTrackingSchema = z.object({
    code: z.string().min(4).max(20).transform((c) => c.toUpperCase()),
    eventType: z.enum(["click", "visit", "install_attempt"]),
    deviceId: z.string().min(5).max(128),
})

export const googleSessionSchema = z.object({
    idToken: z.string().min(20),
})

export const linkAppAccountSchema = z.object({
    sourceApp: sourceAppEnum,
    appUid: z.string().min(3).max(128),
    referralCode: z
        .string()
        .min(4)
        .max(20)
        .transform((c) => c.toUpperCase())
        .optional(),
})

export const qualifyReferralSchema = z.object({
    referrerCode: z.string().min(4).max(20).transform((c) => c.toUpperCase()),
    referredEmail: z.string().email(),
    deviceId: z.string().min(5).max(128),
    sourceApp: sourceAppEnum,
    event: z.enum(["signup", "day_active", "purchase", "install", "profile_completed"]),
})
