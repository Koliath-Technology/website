import { z } from "zod"

/** Reject MAC addresses and bare IMEI-length digit strings. App-generated ids only. */
function appGeneratedId(min = 8) {
    return z
        .string()
        .trim()
        .min(min)
        .max(128)
        .regex(/^[A-Za-z0-9_.:-]{8,128}$/)
        .refine((value) => !/^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(value), {
            message: "Permanent hardware identifiers are not accepted",
        })
        .refine((value) => !/^\d{14,17}$/.test(value), {
            message: "Permanent hardware identifiers are not accepted",
        })
}

export const startInstallSchema = z
    .object({
        slug: z
            .string()
            .trim()
            .min(2)
            .max(64)
            .regex(/^[a-z0-9-]+$/)
            .optional(),
        appId: z
            .string()
            .trim()
            .min(4)
            .max(64)
            .regex(/^app_[a-z0-9_]+$/)
            .optional(),
        platform: z.enum(["android", "ios"]).optional(),
        installationId: appGeneratedId().optional(),
    })
    .strict()
    .refine((value) => Boolean(value.slug || value.appId), {
        message: "slug or appId is required",
    })

const attestationSchema = z
    .object({
        play_integrity_token: z.string().min(10).max(8192).optional(),
        app_attest_assertion: z.string().min(10).max(8192).optional(),
        device_check_token: z.string().min(10).max(8192).optional(),
    })
    .strict()

export const verifyInstallSchema = z
    .object({
        verification_token: z.string().trim().min(20).max(200),
        app_id: z.string().trim().min(4).max(64),
        installation_id: appGeneratedId(),
        platform: z.enum(["android", "ios"]),
        device_key: appGeneratedId().optional(),
        os_version: z.string().trim().min(1).max(40).optional(),
        app_version: z.string().trim().min(1).max(40).optional(),
        attestation: attestationSchema.optional(),
    })
    .strict()

export const registerAppSchema = z
    .object({
        name: z.string().trim().min(2).max(120),
        description: z.string().trim().min(1).max(2000).optional(),
        packageId: z
            .string()
            .trim()
            .min(3)
            .max(255)
            .regex(/^[A-Za-z0-9._-]+$/),
        platform: z.enum(["android", "ios"]),
        company: z.string().trim().min(2).max(255).optional(),
        developerName: z.string().trim().min(2).max(255).optional(),
        slug: z
            .string()
            .trim()
            .min(2)
            .max(64)
            .regex(/^[a-z0-9-]+$/)
            .optional(),
        verificationConfig: z
            .object({
                tokenTtlSeconds: z.number().int().min(60).max(86400).optional(),
            })
            .strict()
            .optional(),
    })
    .strict()

export const adminRiskSchema = z
    .object({
        riskStatus: z.enum(["NORMAL", "REVIEW", "BLOCKED"]).optional(),
        accountStatus: z.enum(["active", "suspended"]).optional(),
    })
    .strict()
    .refine((value) => value.riskStatus !== undefined || value.accountStatus !== undefined, {
        message: "riskStatus or accountStatus is required",
    })

export const adminAppUpdateSchema = z
    .object({
        status: z.enum(["pending", "active", "suspended"]).optional(),
        pointsAwarded: z.number().int().min(0).max(10000).optional(),
        requireAttestation: z.boolean().optional(),
    })
    .strict()
    .refine(
        (value) =>
            value.status !== undefined ||
            value.pointsAwarded !== undefined ||
            value.requireAttestation !== undefined,
        { message: "status, pointsAwarded, or requireAttestation is required" }
    )
