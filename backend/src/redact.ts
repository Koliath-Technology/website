const POSTGRES_URL = /postgres(?:ql)?:\/\/[^\s'"]+/gi
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g
const PEM = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g
const APP_SECRET = /kol_[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{8,}/g
const VERIFY_TOKEN = /kvt_[A-Za-z0-9_-]{8,}/g

/** Strip connection strings and bearer-like tokens before anything is logged. */
export function redact(value: unknown): string {
    const text =
        value instanceof Error
            ? value.message
            : typeof value === "string"
              ? value
              : "request failed"
    return text
        .replace(PEM, "[redacted-private-key]")
        .replace(POSTGRES_URL, "postgres://[redacted]")
        .replace(JWT, "[redacted-jwt]")
        .replace(APP_SECRET, "[redacted-app-secret]")
        .replace(VERIFY_TOKEN, "[redacted-verification-token]")
}

export function logError(label: string, error: unknown): void {
    console.error(label, redact(error))
}
