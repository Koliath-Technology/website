import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Button } from "./ui/button"
import { useAuth } from "../lib/auth"
import { ApiError } from "../lib/api"
import {
    fetchAdminApps,
    fetchAdminAudit,
    fetchAdminDevices,
    fetchAdminFraud,
    fetchAdminInstallations,
    fetchAdminOverview,
    fetchAdminRewards,
    fetchAdminUsers,
    updateAdminRisk,
} from "../lib/installApi"

type Tab = "overview" | "users" | "installs" | "rewards" | "fraud" | "devices" | "apps"

function Cell({ value }: { value: unknown }) {
    if (value == null) return <span className="text-[var(--muted)]">—</span>
    if (typeof value === "object") return <span className="font-mono text-xs">{JSON.stringify(value)}</span>
    return <span>{String(value)}</span>
}

function Table({ rows }: { rows: Array<Record<string, unknown>> }) {
    if (rows.length === 0) return <p className="text-sm text-[var(--muted)]">Nothing here yet.</p>
    const columns = Object.keys(rows[0] ?? {}).slice(0, 8)
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
                <thead>
                    <tr>
                        {columns.map((column) => (
                            <th key={column} className="text-left font-medium border-b border-[var(--line)] py-2 pr-3">
                                {column}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => (
                        <tr key={index} className="align-top">
                            {columns.map((column) => (
                                <td key={column} className="border-b border-[var(--line)] py-2 pr-3">
                                    <Cell value={row[column]} />
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

export default function AdminVerificationPage() {
    const { user, loading } = useAuth()
    const [tab, setTab] = useState<Tab>("overview")
    const [error, setError] = useState<string | null>(null)
    const [overview, setOverview] = useState<Record<string, unknown> | null>(null)
    const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
    const [audit, setAudit] = useState<Record<string, unknown> | null>(null)
    const [statusFilter, setStatusFilter] = useState("")
    const [riskStatus, setRiskStatus] = useState<"NORMAL" | "REVIEW" | "BLOCKED">("NORMAL")
    const [accountStatus, setAccountStatus] = useState<"active" | "suspended">("active")

    useEffect(() => {
        if (!user) return
        let cancelled = false
        async function load() {
            setError(null)
            try {
                if (tab === "overview") {
                    const data = await fetchAdminOverview()
                    if (!cancelled) setOverview(data)
                    return
                }
                if (tab === "users") {
                    const data = await fetchAdminUsers()
                    if (!cancelled) setRows(data.users)
                    return
                }
                if (tab === "installs") {
                    const data = await fetchAdminInstallations(statusFilter || undefined)
                    if (!cancelled) setRows(data.installations)
                    return
                }
                if (tab === "rewards") {
                    const data = await fetchAdminRewards()
                    if (!cancelled) setRows(data.rewards)
                    return
                }
                if (tab === "fraud") {
                    const data = await fetchAdminFraud()
                    if (!cancelled) setRows(data.events)
                    return
                }
                if (tab === "devices") {
                    const data = await fetchAdminDevices()
                    if (!cancelled) setRows(data.devices)
                    return
                }
                const data = await fetchAdminApps()
                if (!cancelled) setRows(data.apps)
            } catch (err: unknown) {
                if (cancelled) return
                setError(err instanceof ApiError ? err.message : "Could not load admin data")
            }
        }
        void load()
        return () => {
            cancelled = true
        }
    }, [user, tab, statusFilter])

    async function openAudit(userId: number) {
        setError(null)
        try {
            setAudit(await fetchAdminAudit(userId))
        } catch (err: unknown) {
            setError(err instanceof ApiError ? err.message : "Could not load the audit trail")
        }
    }

    const tabs: Array<{ id: Tab; label: string }> = [
        { id: "overview", label: "Overview" },
        { id: "users", label: "Users" },
        { id: "installs", label: "Installs" },
        { id: "rewards", label: "Rewards" },
        { id: "fraud", label: "Fraud" },
        { id: "devices", label: "Devices" },
        { id: "apps", label: "Apps" },
    ]

    return (
        <div className="min-h-screen pt-28 px-6 pb-20">
            <div className="max-w-6xl mx-auto">
                <p className="text-sm tracking-[0.18em] uppercase text-[var(--accent)] mb-3">Admin</p>
                <h1 className="font-display text-4xl font-semibold mb-3">Install verification</h1>
                <p className="text-[var(--muted)] mb-6 max-w-3xl">
                    Google accounts listed in ADMIN_GOOGLE_SUBS can review downloads, rewards,
                    device links, and fraud events. Risk status BLOCKED holds rewards. It does not
                    delete the login. One weak signal does not block an account by itself.
                </p>
                {!loading && !user && (
                    <p>
                        <Link to="/login" className="text-[var(--accent)] hover:underline">
                            Sign in
                        </Link>{" "}
                        with an allowlisted Google account.
                    </p>
                )}
                {error && <p className="text-sm text-red-700 mb-4">{error}</p>}
                {user && (
                    <>
                        <div className="flex flex-wrap gap-2 mb-6">
                            {tabs.map((item) => (
                                <Button
                                    key={item.id}
                                    type="button"
                                    variant={tab === item.id ? "default" : "outline"}
                                    className="rounded-full"
                                    onClick={() => {
                                        setAudit(null)
                                        setTab(item.id)
                                    }}
                                >
                                    {item.label}
                                </Button>
                            ))}
                        </div>
                        {tab === "overview" && overview && (
                            <pre className="text-xs overflow-x-auto rounded-2xl border border-[var(--line)] bg-white p-4">
                                {JSON.stringify(overview, null, 2)}
                            </pre>
                        )}
                        {tab === "installs" && (
                            <label className="block text-sm mb-3">
                                Status{" "}
                                <select
                                    className="ml-2 rounded-lg border border-[var(--line)] px-2 py-1"
                                    value={statusFilter}
                                    onChange={(event) => setStatusFilter(event.target.value)}
                                >
                                    <option value="">All</option>
                                    <option value="PENDING_VERIFICATION">Pending</option>
                                    <option value="REWARD_GRANTED">Rewarded</option>
                                    <option value="SUSPICIOUS">Suspicious</option>
                                    <option value="REJECTED">Rejected</option>
                                    <option value="EXPIRED">Expired</option>
                                </select>
                            </label>
                        )}
                        {tab !== "overview" && <Table rows={rows} />}
                        {tab === "users" && (
                            <div className="mt-4 flex flex-wrap gap-2">
                                {rows.map((row) => (
                                    <Button
                                        key={String(row.id)}
                                        type="button"
                                        variant="outline"
                                        className="rounded-full"
                                        onClick={() => void openAudit(Number(row.id))}
                                    >
                                        Audit {String(row.id)}
                                    </Button>
                                ))}
                            </div>
                        )}
                        {audit && (
                            <div className="mt-4 space-y-3">
                                <form
                                    className="flex flex-wrap gap-2 items-center"
                                    onSubmit={(event) => {
                                        event.preventDefault()
                                        const audited = audit.user as { id?: number } | undefined
                                        if (!audited?.id) return
                                        void updateAdminRisk(audited.id, { riskStatus, accountStatus })
                                            .then(() => openAudit(audited.id!))
                                            .catch((err: unknown) => {
                                                setError(err instanceof ApiError ? err.message : "Could not update status")
                                            })
                                    }}
                                >
                                    <select
                                        className="rounded-lg border border-[var(--line)] px-2 py-1"
                                        value={riskStatus}
                                        onChange={(event) =>
                                            setRiskStatus(event.target.value as "NORMAL" | "REVIEW" | "BLOCKED")
                                        }
                                    >
                                        <option value="NORMAL">NORMAL</option>
                                        <option value="REVIEW">REVIEW</option>
                                        <option value="BLOCKED">BLOCKED</option>
                                    </select>
                                    <select
                                        className="rounded-lg border border-[var(--line)] px-2 py-1"
                                        value={accountStatus}
                                        onChange={(event) =>
                                            setAccountStatus(event.target.value as "active" | "suspended")
                                        }
                                    >
                                        <option value="active">active</option>
                                        <option value="suspended">suspended</option>
                                    </select>
                                    <Button type="submit" className="rounded-full">
                                        Update account
                                    </Button>
                                </form>
                                <pre className="text-xs overflow-x-auto rounded-2xl border border-[var(--line)] bg-white p-4">
                                    {JSON.stringify(audit, null, 2)}
                                </pre>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
