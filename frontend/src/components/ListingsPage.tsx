import { Link } from "react-router-dom"
import { CATALOG, appPath } from "../lib/catalog"
import { AppRewardFacts, RewardGateNote } from "./RewardFacts"
import { useReferralTracker } from "../hooks/useReferralTracker"

export default function ListingsPage() {
    const { refCode } = useReferralTracker()

    return (
        <div className="min-h-screen pt-28 pb-24 px-6">
            <div className="max-w-4xl mx-auto">
                <p className="text-sm tracking-[0.18em] uppercase text-[var(--accent)] mb-3">
                    Business listings
                </p>
                <h1 className="font-display text-4xl md:text-5xl font-semibold tracking-tight mb-4">
                    Apps on the hub, with installs.
                </h1>
                <p className="text-[var(--muted)] leading-relaxed mb-3 max-w-2xl">
                    Each listing shows the same points and install count used on the product page
                    and on Earn. You can browse and download without an account.
                </p>
                <RewardGateNote className="text-sm text-[var(--ink)] mb-3" />
                <p className="text-sm text-[var(--muted)] mb-10">
                    Contact is by email. The address is coming.
                </p>

                <div className="space-y-5">
                    {CATALOG.map((app) => (
                        <article
                            key={app.slug}
                            className="rounded-[1.75rem] border border-[var(--line)] bg-white/85 p-7"
                            style={{
                                backgroundImage: `linear-gradient(135deg, ${app.accent}12, transparent 55%)`,
                            }}
                        >
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                                <h2 className="font-display text-2xl font-semibold">{app.name}</h2>
                                <span
                                    className="text-xs font-medium px-2.5 py-1 rounded-full"
                                    style={{ background: `${app.accent}18`, color: app.accent }}
                                >
                                    {app.tag}
                                </span>
                            </div>
                            <p className="text-[var(--muted)] mb-4">{app.blurb}</p>
                            <AppRewardFacts slug={app.slug} />
                            <Link to={appPath(app.slug, refCode)} className="inline-block mt-4 text-sm underline">
                                Open {app.name}
                            </Link>
                        </article>
                    ))}
                </div>
            </div>
        </div>
    )
}
