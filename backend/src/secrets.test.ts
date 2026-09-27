import assert from "node:assert/strict"
import test from "node:test"
import { secretsEqual } from "./secrets"
import { redact } from "./redact"
import { databasePoolConfig } from "./pgSsl"

test("secretsEqual matches identical values and rejects others", () => {
    assert.equal(secretsEqual("same-secret", "same-secret"), true)
    assert.equal(secretsEqual("same-secret", "same-secret "), false)
    assert.equal(secretsEqual("short", "a-much-longer-secret"), false)
})

test("redact removes database URLs and JWTs from log text", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    const text = redact(`failed postgres://app:example@db.internal:5432/mydb token ${jwt}`)
    assert.equal(text.includes("example@"), false)
    assert.equal(text.includes(jwt), false)
    assert.match(text, /postgres:\/\/\[redacted\]/)
    assert.match(text, /\[redacted-jwt\]/)
})

test("database SSL is strict only when requested, and local URLs stay plain", () => {
    const local = databasePoolConfig("postgres://postgres:postgres@localhost:5433/mydb", false)
    assert.equal(local.ssl, undefined)

    const relaxed = databasePoolConfig(
        "postgres://app:example@db.railway.internal:5432/railway",
        false
    )
    assert.deepEqual(relaxed.ssl, { rejectUnauthorized: false })

    const strict = databasePoolConfig(
        "postgres://app:example@db.example:5432/railway?sslmode=require",
        true
    )
    assert.deepEqual(strict.ssl, { rejectUnauthorized: true })
    assert.equal(strict.connectionString.includes("sslmode"), false)
})
