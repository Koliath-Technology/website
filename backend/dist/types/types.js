"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.qualifyReferralSchema = exports.contactInquirySchema = exports.linkAppAccountSchema = exports.googleSessionSchema = exports.referralTrackingSchema = exports.registerReferralSchema = exports.referralEventSchema = exports.redeemRewardSchema = exports.referralStatsQuerySchema = exports.careersSchema = void 0;
const zod_1 = require("zod");
exports.careersSchema = zod_1.z.object({
    name: zod_1.z
        .string()
        .min(3, { message: "Name must be at least 3 characters long" })
        .max(30, { message: "Name cannot exceed 30 characters" }),
    email: zod_1.z.email({ message: "Please provide a valid email address" }),
    contact: zod_1.z.number({ message: "Contact must be a number" }),
    linkedin: zod_1.z
        .string()
        .min(5, { message: "LinkedIn URL must be at least 5 characters long" }),
});
const sourceAppEnum = zod_1.z.enum([
    "diabetic",
    "sapient",
    "adverts",
    "adverts_rewards",
    "advert_cohort",
]);
exports.referralStatsQuerySchema = zod_1.z.object({
    code: zod_1.z.string().min(4).max(20).transform((c) => c.toUpperCase()),
});
exports.redeemRewardSchema = zod_1.z.object({
    rewardId: zod_1.z.number().int().positive(),
    contactEmail: zod_1.z.string().email().optional(),
});
exports.referralEventSchema = zod_1.z.object({
    referrerCode: zod_1.z.string().min(4).max(20).transform((c) => c.toUpperCase()),
    referredEmail: zod_1.z.string().email(),
    deviceId: zod_1.z.string().min(5).max(128),
    sourceApp: sourceAppEnum.optional().default("diabetic"),
});
exports.registerReferralSchema = zod_1.z.object({
    code: zod_1.z.string().min(4).max(20).transform((c) => c.toUpperCase()),
    sourceApp: sourceAppEnum,
    ownerEmail: zod_1.z.string().email().optional(),
});
exports.referralTrackingSchema = zod_1.z.object({
    code: zod_1.z.string().min(4).max(20).transform((c) => c.toUpperCase()),
    eventType: zod_1.z.enum(["click", "visit", "install_attempt"]),
    deviceId: zod_1.z.string().min(5).max(128),
});
exports.googleSessionSchema = zod_1.z.object({
    idToken: zod_1.z.string().min(20),
});
exports.linkAppAccountSchema = zod_1.z.object({
    sourceApp: sourceAppEnum,
    appUid: zod_1.z.string().min(3).max(128),
    referralCode: zod_1.z
        .string()
        .min(4)
        .max(20)
        .transform((c) => c.toUpperCase())
        .optional(),
});
exports.contactInquirySchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(2).max(80),
    email: zod_1.z.email(),
    topic: zod_1.z.enum(["general", "list-app", "download", "press", "careers"]),
    message: zod_1.z.string().trim().min(10).max(2000),
    app: zod_1.z.string().trim().max(80).optional(),
});
exports.qualifyReferralSchema = zod_1.z.object({
    referrerCode: zod_1.z.string().min(4).max(20).transform((c) => c.toUpperCase()),
    referredEmail: zod_1.z.string().email(),
    deviceId: zod_1.z.string().min(5).max(128),
    sourceApp: sourceAppEnum,
    event: zod_1.z.enum(["signup", "day_active", "purchase", "install"]),
});
