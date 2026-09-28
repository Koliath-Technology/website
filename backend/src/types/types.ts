import { z } from "zod"

export const careersSchema = z.object({
    name: z
        .string()
        .min(3, { message: "Name must be at least 3 characters long" })
        .max(30, { message: "Name cannot exceed 30 characters" }),
    email: z.email({ message: "Please provide a valid email address" }),
    contact: z.number({ message: "Contact must be a number" }),
    linkedin: z
        .string()
        .trim()
        .min(5)
        .max(255)
        .refine((value) => {
            try {
                const url = new URL(value)
                const host = url.hostname.toLowerCase()
                return (
                    url.protocol === "https:" &&
                    (host === "linkedin.com" || host.endsWith(".linkedin.com"))
                )
            } catch {
                return false
            }
        }, { message: "LinkedIn URL must be an https link on linkedin.com" }),
})
export type CareersFormData = z.infer<typeof careersSchema>

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

export const contactInquirySchema = z.object({
    name: z.string().trim().min(2).max(80),
    email: z.email(),
    topic: z.enum(["general", "list-app", "download", "press", "careers"]),
    message: z.string().trim().min(10).max(2000),
    app: z.string().trim().max(80).optional(),
})

export const qualifyReferralSchema = z.object({
    referrerCode: z.string().min(4).max(20).transform((c) => c.toUpperCase()),
    referredEmail: z.string().email(),
    deviceId: z.string().min(5).max(128),
    sourceApp: sourceAppEnum,
    event: z.enum(["signup", "day_active", "purchase", "install"]),
})
