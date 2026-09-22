import { useEffect, useState } from "react"
import fpPromise from "@fingerprintjs/fingerprintjs"
import { API_ROOT } from "../lib/api"

const REFERRAL_KEY = "koliath_ref_code"

/** Shared across hook instances so a download click can attribute after App has stored the code. */
let sharedRefCode: string | null = null
let sharedDeviceId: string | null = null

function apiPath(path: string): string {
    return `${API_ROOT}${path}`
}

export function useReferralTracker() {
    const [refCode, setRefCode] = useState<string | null>(sharedRefCode)
    const [deviceId, setDeviceId] = useState<string | null>(sharedDeviceId)

    useEffect(() => {
        let cancelled = false

        const initFingerprint = async () => {
            const fp = await fpPromise.load()
            const result = await fp.get()
            sharedDeviceId = result.visitorId
            if (!cancelled) setDeviceId(result.visitorId)
            return result.visitorId
        }

        const remember = (code: string) => {
            sharedRefCode = code
            localStorage.setItem(REFERRAL_KEY, code)
            if (!cancelled) setRefCode(code)
        }

        const processReferral = async (visitorId: string) => {
            const params = new URLSearchParams(window.location.search)
            const urlCode = params.get("ref")
            const localCode = localStorage.getItem(REFERRAL_KEY)

            if (urlCode) {
                try {
                    const res = await fetch(
                        apiPath(`/api/referrals/validate?code=${encodeURIComponent(urlCode)}`)
                    )
                    const data = (await res.json().catch(() => ({}))) as { success?: boolean }
                    if (res.ok && data.success) {
                        remember(urlCode)
                        await fetch(apiPath("/api/referrals/track"), {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                code: urlCode,
                                eventType: "visit",
                                deviceId: visitorId,
                            }),
                        }).catch((error) => console.error("Failed to track visit", error))
                        return
                    }
                    if (res.status === 404) {
                        // Confirmed invalid. Do not attach it to later downloads.
                    } else {
                        // API offline or database down: keep the code for this visit.
                        // Tracking stays best-effort and does not throw.
                        remember(urlCode)
                        return
                    }
                } catch (e) {
                    console.error("Failed to validate referral code", e)
                    remember(urlCode)
                    return
                }
            }

            if (localCode) {
                sharedRefCode = localCode
                if (!cancelled) setRefCode(localCode)
            }
        }

        initFingerprint()
            .then((visitorId) => processReferral(visitorId))
            .catch((e) => console.error("Failed to start referral tracker", e))

        return () => {
            cancelled = true
        }
    }, [])

    const trackEvent = async (eventType: "click" | "visit" | "install_attempt") => {
        const code = refCode || sharedRefCode || localStorage.getItem(REFERRAL_KEY)
        const id = deviceId || sharedDeviceId
        if (!code || !id) return
        try {
            await fetch(apiPath("/api/referrals/track"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    code,
                    eventType,
                    deviceId: id,
                }),
            })
        } catch (e) {
            console.error("Failed to track event", e)
        }
    }

    return { refCode: refCode || sharedRefCode, deviceId: deviceId || sharedDeviceId, trackEvent }
}
