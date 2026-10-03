import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import { Button } from "./ui/button"
import { AppRewardFacts, RewardGateNote } from "./RewardFacts"
import { useAuth } from "../lib/auth"
import { useReferralTracker } from "../hooks/useReferralTracker"
import { APP_LISTS, appPath, getApp, getList } from "../lib/catalog"

export default function ListsPage() {
    const { slug } = useParams()
    const list = slug ? getList(slug) : undefined
    const { refCode } = useReferralTracker()
    const { user } = useAuth()
    const [copied, setCopied] = useState<string | null>(null)

    const share = async (listSlug: string) => {
        const code = user?.globalCode || refCode
        const url = new URL(`/lists/${listSlug}`, window.location.origin)
        if (code) url.searchParams.set("ref", code)
        try {
            await navigator.clipboard.writeText(url.toString())
            setCopied(listSlug)
            setTimeout(() => setCopied(null), 2000)
        } catch {
            setCopied(null)
        }
    }

    return (
        <div className="min-h-screen pt-28 pb-24 px-6">
            <div className="max-w-4xl mx-auto">
                <p className="text-sm tracking-[0.18em] uppercase text-[var(--accent)] mb-3">Lists</p>
                <h1 className="font-display text-4xl md:text-5xl font-semibold tracking-tight mb-4">
                    {list ? list.name : "Shareable app lists"}
                </h1>
                <p className="text-[var(--muted)] leading-relaxed mb-4 max-w-2xl">
                    {list
                        ? list.summary
                        : "Named sets of Koliath apps. Open one, or copy a link. A referral code on the link stays with the visit."}
                </p>
                <RewardGateNote className="text-sm text-[var(--ink)] mb-8" />

                {slug && !list && (
                    <p className="mb-8 text-sm rounded-2xl border border-[var(--line)] bg-white/80 px-5 py-4">
                        That list is not on the hub. These are the lists that are.
                    </p>
                )}

                <div className="space-y-6">
                    {(list ? [list] : APP_LISTS).map((item) => (
                        <section
                            key={item.slug}
                            className="rounded-[1.75rem] border border-[var(--line)] bg-white/80 p-7"
                        >
                            <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
                                <div>
                                    {!list && (
                                        <h2 className="font-display text-2xl font-semibold">{item.name}</h2>
                                    )}
                                    {!list && <p className="text-[var(--muted)] mt-1">{item.summary}</p>}
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="rounded-full"
                                    onClick={() => void share(item.slug)}
                                >
                                    {copied === item.slug ? "Link copied" : "Copy share link"}
                                </Button>
                            </div>
                            <div className="space-y-4">
                                {item.appSlugs.map((appSlug) => {
                                    const app = getApp(appSlug)
                                    return (
                                        <div
                                            key={app.slug}
                                            className="rounded-2xl border border-[var(--line)] bg-white px-5 py-4"
                                        >
                                            <div className="flex items-center justify-between gap-3 mb-2">
                                                <h3 className="font-semibold">{app.name}</h3>
                                                <Link
                                                    to={appPath(app.slug, refCode)}
                                                    className="text-sm underline"
                                                >
                                                    Open
                                                </Link>
                                            </div>
                                            <AppRewardFacts slug={app.slug} />
                                        </div>
                                    )
                                })}
                            </div>
                            {list && (
                                <Link to="/lists" className="inline-block mt-5 text-sm underline">
                                    All lists
                                </Link>
                            )}
                        </section>
                    ))}
                </div>
            </div>
        </div>
    )
}
