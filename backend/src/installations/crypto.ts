import { createHash, randomBytes, timingSafeEqual } from "crypto"

export function sha256Hex(value: string): string {
    return createHash("sha256").update(value, "utf8").digest("hex")
}

/** Fixed-length digest compare. Mismatched lengths fail closed. */
export function hashesEqual(storedHex: string, candidateHex: string): boolean {
    if (storedHex.length !== candidateHex.length || storedHex.length === 0) return false
    const stored = Buffer.from(storedHex, "hex")
    const candidate = Buffer.from(candidateHex, "hex")
    if (stored.length === 0 || stored.length !== candidate.length) return false
    return timingSafeEqual(stored, candidate)
}

export function hashIp(salt: string, ip: string): string {
    return sha256Hex(`${salt}:${ip}`)
}

/**
 * Short-lived install token. Plaintext is returned once; only the hash and a
 * lookup prefix are stored.
 */
export function mintVerificationToken(): { token: string; prefix: string; hash: string } {
    const token = `kvt_${randomBytes(32).toString("base64url")}`
    return { token, prefix: token.slice(0, 16), hash: sha256Hex(token) }
}

/**
 * App API secret. Format: `kol_<prefix>.<entropy>`.
 * The prefix (including `kol_`) is stored for lookup. The full secret is not.
 */
export function mintAppSecret(): { secret: string; prefix: string; hash: string } {
    const prefix = `kol_${randomBytes(6).toString("hex")}`
    const secret = `${prefix}.${randomBytes(32).toString("base64url")}`
    return { secret, prefix, hash: sha256Hex(secret) }
}

export function secretPrefix(secret: string): string | null {
    const dot = secret.indexOf(".")
    if (!secret.startsWith("kol_") || dot <= 4) return null
    return secret.slice(0, dot)
}

export function tokenPrefix(token: string): string | null {
    if (!token.startsWith("kvt_") || token.length < 20) return null
    return token.slice(0, 16)
}

export function mintPublicId(kind: "app" | "session" | "verification"): string {
    const entropy = randomBytes(9).toString("hex")
    if (kind === "app") return `app_${entropy}`
    if (kind === "session") return `sess_${entropy}`
    return `iv_${entropy}`
}
