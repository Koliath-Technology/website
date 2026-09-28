import { useEffect, useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import { Button } from "./ui/button"
import { useAuth } from "../lib/auth"
import { ApiError } from "../lib/api"
import {
    fetchDeveloperApps,
    issueDeveloperCredential,
    registerDeveloperApp,
    type DeveloperApp,
} from "../lib/installApi"

export default function DeveloperPortal() {
    const { user, loading } = useAuth()
    const [apps, setApps] = useState<DeveloperApp[]>([])
    const [error, setError] = useState<string | null>(null)
    const [secret, setSecret] = useState<string | null>(null)
    const [name, setName] = useState("")
    const [packageId, setPackageId] = useState("")
    const [platform, setPlatform] = useState<"android" | "ios">("android")
    const [company, setCompany] = useState("")
    const [points, setPoints] = useState("100")
    const [busy, setBusy] = useState(false)

    async function load() {
        const data = await fetchDeveloperApps()
        setApps(data.apps)
    }

    useEffect(() => {
        if (!user) return
        void load().catch((err: unknown) => {
            setError(err instanceof ApiError ? err.message : "Could not load apps")
        })
    }, [user])

    async function onRegister(event: FormEvent) {
        event.preventDefault()
        setBusy(true)
        setError(null)
        setSecret(null)
        try {
            await registerDeveloperApp({
                name,
                packageId,
                platform,
                company: company || undefined,
                pointsAwarded: Number(points) || 0,
            })
            setName("")
            setPackageId("")
            await load()
        } catch (err: unknown) {
            setError(err instanceof ApiError ? err.message : "Could not register the app")
        } finally {
            setBusy(false)
        }
    }

    async function onCredential(appId: string) {
        setBusy(true)
        setError(null)
        try {
            const issued = await issueDeveloperCredential(appId)
            setSecret(issued.secret)
            await load()
        } catch (err: unknown) {
            setError(err instanceof ApiError ? err.message : "Could not issue a credential")
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="min-h-screen pt-28 px-6 pb-20">
            <div className="max-w-4xl mx-auto">
                <p className="text-sm tracking-[0.18em] uppercase text-[var(--accent)] mb-3">Developers</p>
                <h1 className="font-display text-4xl font-semibold mb-3">App credentials</h1>
                <p className="text-[var(--muted)] mb-8 max-w-2xl">
                    Register an app, then generate a secret. The secret is shown once and stored
                    only as a hash. Keep it on your server. Do not put it in the website or in the
                    mobile app binary. Install points are awarded only by the verify API.
                </p>
                {!loading && !user && (
                    <p className="mb-6">
                        <Link to="/login" className="text-[var(--accent)] hover:underline">
                            Sign in with Google
                        </Link>{" "}
                        to register an app.
                    </p>
                )}
                {error && <p className="text-sm text-red-700 mb-4">{error}</p>}
                {secret && (
                    <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4">
                        <p className="text-sm font-medium mb-2">Copy this secret now. It will not be shown again.</p>
                        <pre className="text-xs overflow-x-auto whitespace-pre-wrap break-all">{secret}</pre>
                    </div>
                )}
                {user && (
                    <form onSubmit={(event) => void onRegister(event)} className="grid gap-3 mb-10">
                        <input
                            className="rounded-xl border border-[var(--line)] px-3 py-2"
                            placeholder="App name"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            required
                        />
                        <input
                            className="rounded-xl border border-[var(--line)] px-3 py-2"
                            placeholder="Package or bundle id"
                            value={packageId}
                            onChange={(event) => setPackageId(event.target.value)}
                            required
                        />
                        <div className="flex gap-3">
                            <select
                                className="rounded-xl border border-[var(--line)] px-3 py-2"
                                value={platform}
                                onChange={(event) => setPlatform(event.target.value as "android" | "ios")}
                            >
                                <option value="android">Android</option>
                                <option value="ios">iOS</option>
                            </select>
                            <input
                                className="rounded-xl border border-[var(--line)] px-3 py-2 flex-1"
                                placeholder="Company"
                                value={company}
                                onChange={(event) => setCompany(event.target.value)}
                            />
                            <input
                                className="rounded-xl border border-[var(--line)] px-3 py-2 w-28"
                                type="number"
                                min={0}
                                max={1000}
                                value={points}
                                onChange={(event) => setPoints(event.target.value)}
                            />
                        </div>
                        <Button type="submit" className="rounded-full w-fit" disabled={busy}>
                            Register app
                        </Button>
                    </form>
                )}
                <div className="space-y-4">
                    {apps.map((app) => (
                        <article key={app.appId} className="rounded-2xl border border-[var(--line)] bg-white p-5">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <h2 className="text-lg font-semibold">{app.name}</h2>
                                    <p className="font-mono text-sm text-[var(--muted)]">{app.appId}</p>
                                    <p className="text-sm mt-1">
                                        {app.packageId} · {app.platform} · {app.pointsAwarded} pts · {app.status}
                                    </p>
                                    {app.stats && (
                                        <p className="text-sm text-[var(--muted)] mt-1">
                                            Pending {app.stats.pending} · Verified {app.stats.verified} · Rejected{" "}
                                            {app.stats.rejected} · Reward points {app.stats.rewardPoints}
                                        </p>
                                    )}
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="rounded-full"
                                    disabled={busy}
                                    onClick={() => void onCredential(app.appId)}
                                >
                                    Generate or rotate secret
                                </Button>
                            </div>
                        </article>
                    ))}
                </div>
            </div>
        </div>
    )
}
