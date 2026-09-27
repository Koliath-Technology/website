const POSTGRES_URL = /postgres(?:ql)?:\/\/[^\s'"]+/gi
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g

/** Strip connection strings and bearer-like tokens before anything is logged. */
export function redact(value: unknown): string {
    const text =
        value instanceof Error
            ? value.message
            : typeof value === "string"
              ? value
              : "request failed"
    return text.replace(POSTGRES_URL, "postgres://[redacted]").replace(JWT, "[redacted-jwt]")
}

export function logError(label: string, error: unknown): void {
    console.error(label, redact(error))
}
