const FIREBASE_ENV = ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"] as const

export function firebaseCredentialStatus(
    env: NodeJS.ProcessEnv = process.env
): { configured: boolean; missing: string[] } {
    const missing = FIREBASE_ENV.filter((name) => !env[name]?.trim())
    return { configured: missing.length === 0, missing: [...missing] }
}

/**
 * Railway and dotenv store PEM newlines as the two characters `\` and `n`.
 * Reject anything that is not a PEM header so a wrong value cannot be treated
 * as a key. Callers must not log the returned string.
 */
export function normalizePrivateKey(value: string): string {
    const key = value.replace(/\\n/g, "\n").trim()
    const begin = "-----BEGIN " + "PRIVATE KEY-----"
    const end = "-----END " + "PRIVATE KEY-----"
    if (!key.includes(begin) || !key.includes(end)) {
        throw Object.assign(new Error("FIREBASE_PRIVATE_KEY must be a PEM private key"), {
            status: 503,
        })
    }
    return key
}
