/**
 * Platform attestation hooks.
 *
 * v1 does not call Google Play Integrity or Apple App Attest / DeviceCheck.
 * A later release can replace `verifyWithProvider` without changing the
 * install reward transaction. Skipped or unverified attestation is not proof
 * that a human installed the app.
 */

export interface AttestationInput {
    playIntegrityToken?: string
    appAttestAssertion?: string
    deviceCheckToken?: string
}

export interface AttestationAssessment {
    status: "skipped" | "not_configured" | "provider_accepted"
    provider: "play_integrity" | "app_attest" | "device_check" | null
    okForReward: boolean
    note: string
}

export interface AttestationVerifier {
    verifyPlayIntegrity(token: string): Promise<boolean>
    verifyAppAttest(assertion: string): Promise<boolean>
    verifyDeviceCheck(token: string): Promise<boolean>
}

/** No network calls. Tokens are not treated as valid. */
export const unconfiguredAttestationVerifier: AttestationVerifier = {
    async verifyPlayIntegrity() {
        return false
    },
    async verifyAppAttest() {
        return false
    },
    async verifyDeviceCheck() {
        return false
    },
}

function providerOf(input: AttestationInput): AttestationAssessment["provider"] {
    if (input.playIntegrityToken) return "play_integrity"
    if (input.appAttestAssertion) return "app_attest"
    if (input.deviceCheckToken) return "device_check"
    return null
}

export async function inspectAttestation(
    input: AttestationInput | undefined,
    options: { requireAttestation: boolean; verifier?: AttestationVerifier }
): Promise<AttestationAssessment> {
    const verifier = options.verifier ?? unconfiguredAttestationVerifier
    const present = input ?? {}
    const provider = providerOf(present)

    if (!provider) {
        return {
            status: "skipped",
            provider: null,
            okForReward: !options.requireAttestation,
            note: "No attestation token was sent. v1 does not require Play Integrity or App Attest.",
        }
    }

    let verified = false
    if (provider === "play_integrity" && present.playIntegrityToken) {
        verified = await verifier.verifyPlayIntegrity(present.playIntegrityToken)
    } else if (provider === "app_attest" && present.appAttestAssertion) {
        verified = await verifier.verifyAppAttest(present.appAttestAssertion)
    } else if (provider === "device_check" && present.deviceCheckToken) {
        verified = await verifier.verifyDeviceCheck(present.deviceCheckToken)
    }

    if (verified) {
        return {
            status: "provider_accepted",
            provider,
            okForReward: true,
            note: "Verifier returned success. v1 still does not treat this as proof of a human install.",
        }
    }

    return {
        status: "not_configured",
        provider,
        okForReward: !options.requireAttestation,
        note: "An attestation token was present, but no live verifier is configured.",
    }
}
