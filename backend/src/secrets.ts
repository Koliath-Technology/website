import { createHash, timingSafeEqual } from "crypto"

/**
 * Compare two secrets without a direct `===` on the raw values.
 * SHA-256 digests are fixed length, so the final compare does not leak
 * which byte differed. Callers still fail closed on an empty expected secret.
 */
export function secretsEqual(left: string, right: string): boolean {
    const a = createHash("sha256").update(left, "utf8").digest()
    const b = createHash("sha256").update(right, "utf8").digest()
    return timingSafeEqual(a, b)
}
