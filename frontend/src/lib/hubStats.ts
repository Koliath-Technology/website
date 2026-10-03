import { useEffect, useSyncExternalStore } from "react"
import { API_ROOT } from "./api"
import { CATALOG, isAppSlug, type AppSlug } from "./catalog"

export type InstallCounts = Record<AppSlug, number>

function emptyCounts(): InstallCounts {
    return {
        sapient: 0,
        adverts: 0,
        "adverts-rewards": 0,
        "advert-cohort": 0,
        "diabetic-buddy": 0,
    }
}

let installs = emptyCounts()
let loadedAt = 0
let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()

function emit() {
    for (const listener of listeners) listener()
}

function applyApps(apps: Array<{ slug?: string; installs?: number }> | undefined) {
    if (!apps) return
    const next = { ...installs }
    for (const app of apps) {
        if (app.slug && isAppSlug(app.slug) && typeof app.installs === "number") {
            next[app.slug] = app.installs
        }
    }
    installs = next
    loadedAt = Date.now()
    emit()
}

export function subscribeInstalls(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

export function getInstallCounts(): InstallCounts {
    return installs
}

export function loadHub(force = false): Promise<void> {
    if (!force && loadedAt && Date.now() - loadedAt < 5000) return Promise.resolve()
    if (inflight) return inflight
    inflight = fetch(`${API_ROOT}/api/hub`)
        .then(async (response) => {
            if (!response.ok) return
            const data = (await response.json()) as { apps?: Array<{ slug?: string; installs?: number }> }
            applyApps(data.apps)
        })
        .catch(() => {
            /* Pages keep the shared zero counts when the API is down. */
        })
        .finally(() => {
            inflight = null
        })
    return inflight
}

export async function recordInstall(slug: AppSlug): Promise<void> {
    try {
        const response = await fetch(`${API_ROOT}/api/hub/installs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slug }),
        })
        if (!response.ok) return
        const data = (await response.json()) as { apps?: Array<{ slug?: string; installs?: number }> }
        applyApps(data.apps)
    } catch {
        /* The download can still open. The count stays on the last shared snapshot. */
    }
}

export function useInstallCounts(): InstallCounts {
    const counts = useSyncExternalStore(subscribeInstalls, getInstallCounts, getInstallCounts)
    useEffect(() => {
        void loadHub()
    }, [])
    return counts
}

export const CATALOG_POINTS = Object.fromEntries(CATALOG.map((app) => [app.slug, app.points])) as Record<
    AppSlug,
    number
>
