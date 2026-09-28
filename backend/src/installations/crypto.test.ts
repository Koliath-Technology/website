import assert from "node:assert/strict"
import test from "node:test"
import { hashesEqual, mintAppSecret, mintVerificationToken, secretPrefix, sha256Hex, tokenPrefix } from "./crypto"
import { verifyInstallSchema } from "./schemas"
import { inspectAttestation } from "./attestation"

test("verification tokens are hashed and only the prefix is recoverable", () => {
    const minted = mintVerificationToken()
    assert.equal(minted.hash, sha256Hex(minted.token))
    assert.notEqual(minted.hash, minted.token)
    assert.equal(tokenPrefix(minted.token), minted.prefix)
    assert.equal(hashesEqual(minted.hash, sha256Hex(minted.token)), true)
    assert.equal(hashesEqual(minted.hash, sha256Hex("kvt_other")), false)
})

test("app secrets are hashed and the lookup prefix stops at the dot", () => {
    const minted = mintAppSecret()
    assert.equal(secretPrefix(minted.secret), minted.prefix)
    assert.equal(minted.hash, sha256Hex(minted.secret))
    assert.equal(minted.secret.includes(minted.hash), false)
    assert.equal(hashesEqual(minted.hash, sha256Hex("kol_nope.nope")), false)
})

test("verify schema rejects IMEI and MAC values", () => {
    const base = {
        verification_token: "kvt_exampletokenvalue123456",
        app_id: "app_example",
        platform: "android" as const,
    }
    assert.equal(
        verifyInstallSchema.safeParse({ ...base, installation_id: "490154203237518" }).success,
        false
    )
    assert.equal(
        verifyInstallSchema.safeParse({ ...base, installation_id: "aa:bb:cc:dd:ee:ff" }).success,
        false
    )
    assert.equal(
        verifyInstallSchema.safeParse({ ...base, installation_id: "install-ok-1", imei: "490154203237518" }).success,
        false
    )
    assert.equal(verifyInstallSchema.safeParse({ ...base, installation_id: "install-ok-1" }).success, true)
})

test("attestation is skipped unless a token is sent, and a token is not accepted without a verifier", async () => {
    const skipped = await inspectAttestation(undefined, { requireAttestation: false })
    assert.equal(skipped.status, "skipped")
    assert.equal(skipped.okForReward, true)

    const required = await inspectAttestation(undefined, { requireAttestation: true })
    assert.equal(required.okForReward, false)

    const present = await inspectAttestation(
        { playIntegrityToken: "play-integrity-token-value" },
        { requireAttestation: false }
    )
    assert.equal(present.status, "not_configured")
    assert.equal(present.okForReward, true)
})
