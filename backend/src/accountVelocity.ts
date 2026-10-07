/**
 * In-memory cap on new Koliath accounts per client IP, per process.
 * A restart clears the window. Referral qualification and the three-referral
 * reward gate are separate and are not counted here.
 */
export function readBoundedInt(
    raw: string | undefined,
    fallback: number,
    min: number,
    max: number
): number {
    if (raw === undefined || raw.trim() === "") return fallback
    const value = Number(raw)
    if (!Number.isInteger(value) || value < min || value > max) return fallback
    return value
}

export function accountCreateSettings(env: NodeJS.ProcessEnv): { limit: number; windowMs: number } {
    return {
        limit: readBoundedInt(env.ACCOUNT_CREATE_LIMIT, 5, 1, 100),
        windowMs: readBoundedInt(env.ACCOUNT_CREATE_WINDOW_MS, 3_600_000, 60_000, 86_400_000),
    }
}

export function createAccountVelocity(
    limit: number,
    windowMs: number,
    now: () => number = Date.now
) {
    const hits = new Map<string, number[]>()

    return {
        tryConsume(key: string): boolean {
            const bucket = key.trim() || "unknown"
            const at = now()
            const recent = (hits.get(bucket) ?? []).filter((stamp) => at - stamp < windowMs)
            if (recent.length >= limit) {
                hits.set(bucket, recent)
                return false
            }
            recent.push(at)
            hits.set(bucket, recent)
            return true
        },
    }
}
