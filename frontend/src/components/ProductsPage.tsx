import { useEffect } from "react"
import { Link, useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { ArrowRight } from "lucide-react"
import { Button } from "./ui/button"
import { useReferralTracker } from "../hooks/useReferralTracker"
import { downloadUrls, withReferral } from "../lib/downloads"
import { CATALOG, type AppSlug } from "../lib/catalog"
import { recordInstall } from "../lib/hubStats"
import { AppRewardFacts, RewardGateNote } from "./RewardFacts"

const details: Record<
    AppSlug,
    { headline: string; body: string; points: string[] }
> = {
    sapient: {
        headline: "Dating for how you think",
        body: "Photo-first apps optimise for the swipe. Sapient leads with mindprint — prompts, sparks, and Elo-aware compatibility — then reveals photos after a conversation starts.",
        points: [
            "Compatibility breakdowns, not vanity scores",
            "Salons, Think Dates, Book Swap, Icebreakers",
        ],
    },
    adverts: {
        headline: "AI ads with licensed likeness",
        body: "Brands brief campaigns, generate creative with talent likeness, and book delivery across channels — with payments and rewards wired through Koliath.",
        points: ["Brand app + talent cohort + viewer rewards", "Razorpay orders and campaign delivery APIs"],
    },
    "adverts-rewards": {
        headline: "Watch. Earn. Redeem.",
        body: "The viewer loop for Adverts: verified watches credit a ledger users can redeem — kept separate from brand and talent surfaces for security.",
        points: ["Verified watch tickets", "Points ledger", "INR estimate & redeem gates"],
    },
    "advert-cohort": {
        headline: "Talent control of likeness",
        body: "Approve or decline brand requests, set still/video/campaign rates, pause inbound work, and track paid vs pipeline earnings.",
        points: ["Request inbox", "Rate cards", "Earnings visibility"],
    },
    "diabetic-buddy": {
        headline: "Logging that sticks",
        body: "Glucose, insulin, food, and activity wrapped in a companion loop. Forecasts run on-device — health data never leaves for third-party inference.",
        points: ["On-device forecasting", "Pet leveling & streaks", "Shared Koliath referral backend"],
    },
}

export function ProductsShowcase({ compact = false }: { compact?: boolean }) {
    return (
        <section className={`px-6 ${compact ? "py-16" : "py-24"}`} id="products">
            <div className="max-w-6xl mx-auto">
                <div className="max-w-2xl mb-14">
                    <p className="text-sm tracking-[0.18em] uppercase text-[var(--accent)] mb-3">
                        What we build
                    </p>
                    <h2 className="font-display text-3xl md:text-5xl font-semibold tracking-tight text-[var(--ink)] mb-4">
                        Products shipping from Koliath
                    </h2>
                    <p className="text-lg text-[var(--muted)] leading-relaxed mb-3">
                        Browse and download without an account. A referral code on the link stays
                        with the visit. Sign in only for points or a referral link.
                    </p>
                    <RewardGateNote className="text-sm text-[var(--ink)]" />
                </div>

                <div className="grid md:grid-cols-2 gap-5">
                    {CATALOG.map((p, i) => (
                        <motion.div
                            key={p.slug}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, amount: 0.3 }}
                            transition={{ delay: i * 0.06, duration: 0.45 }}
                        >
                            <Link
                                to={p.href}
                                className="group block h-full rounded-[1.75rem] border border-[var(--line)] bg-white/80 p-8 hover:border-[var(--accent)]/40 transition-colors"
                                style={{
                                    backgroundImage: `linear-gradient(135deg, ${p.accent}12, transparent 55%)`,
                                }}
                            >
                                <div className="flex items-center justify-between mb-6">
                                    <span
                                        className="text-xs font-medium px-2.5 py-1 rounded-full"
                                        style={{
                                            background: `${p.accent}18`,
                                            color: p.accent,
                                        }}
                                    >
                                        {p.tag}
                                    </span>
                                    <ArrowRight className="w-5 h-5 text-[var(--muted)] group-hover:text-[var(--ink)] group-hover:translate-x-1 transition-all" />
                                </div>
                                <h3 className="font-display text-2xl font-semibold mb-3 text-[var(--ink)]">
                                    {p.name}
                                </h3>
                                <p className="text-[var(--muted)] leading-relaxed mb-4">{p.blurb}</p>
                                <AppRewardFacts slug={p.slug} />
                            </Link>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    )
}

export default function ProductsPage() {
    const navigate = useNavigate()
    const { refCode, trackEvent } = useReferralTracker()

    useEffect(() => {
        const id = window.location.hash.replace("#", "")
        if (!id) return
        document.getElementById(id)?.scrollIntoView()
    }, [])

    const onDownload = (slug: AppSlug) => {
        const external = downloadUrls[slug]
        if (!external && slug === "diabetic-buddy") {
            const search = refCode ? `?ref=${encodeURIComponent(refCode)}` : ""
            navigate(`/diabetic-app${search}`)
            return
        }
        if (!external) return
        void trackEvent("install_attempt")
        void recordInstall(slug)
        const href = withReferral(external, refCode)
        if (href) window.open(href, "_blank", "noopener,noreferrer")
    }

    return (
        <div className="min-h-screen pt-20">
            <ProductsShowcase />

            {refCode && (
                <div className="px-6 -mt-6 mb-4">
                    <p className="max-w-6xl mx-auto text-sm rounded-2xl border border-[var(--line)] bg-[var(--accent-soft)] px-5 py-3 text-[var(--ink)]">
                        Referral code <span className="font-mono font-semibold">{refCode}</span> is
                        saved for this visit. Download buttons attribute the install to it. No
                        account is required.
                    </p>
                </div>
            )}

            <section className="px-6 pb-8">
                <div className="max-w-6xl mx-auto space-y-16">
                    {CATALOG.map((app) => {
                        const detail = details[app.slug]
                        const external = downloadUrls[app.slug]
                        const downloadReady = Boolean(external) || app.slug === "diabetic-buddy"
                        return (
                            <ProductDeepDive
                                key={app.slug}
                                id={app.slug}
                                name={app.name}
                                headline={detail.headline}
                                body={detail.body}
                                points={detail.points}
                                slug={app.slug}
                                downloadLabel={
                                    external
                                        ? `Download ${app.name}`
                                        : app.slug === "diabetic-buddy"
                                          ? "Download Diabetic Buddy"
                                          : "Download link coming"
                                }
                                downloadReady={downloadReady}
                                onDownload={() => onDownload(app.slug)}
                            />
                        )
                    })}
                </div>
            </section>

            <section className="px-6 pb-24">
                <div className="max-w-6xl mx-auto rounded-[2rem] border border-[var(--line)] bg-white/80 p-8 md:p-12">
                    <p className="text-sm tracking-[0.18em] uppercase text-[var(--accent)] mb-3">
                        For businesses
                    </p>
                    <h2 className="font-display text-3xl md:text-4xl font-semibold mb-4">
                        Listings and installs
                    </h2>
                    <p className="text-[var(--muted)] leading-relaxed max-w-2xl mb-3">
                        Each app already on the hub has a listing with its install count. The count
                        matches the product page and Earn.
                    </p>
                    <p className="text-sm text-[var(--muted)] mb-6">
                        Contact is by email. The address is coming.
                    </p>
                    <Button asChild className="rounded-full px-6 h-11">
                        <Link to="/listings">See listings</Link>
                    </Button>
                </div>
            </section>
        </div>
    )
}

function ProductDeepDive({
    id,
    name,
    headline,
    body,
    points,
    slug,
    downloadLabel,
    downloadReady,
    onDownload,
}: {
    id: string
    name: string
    headline: string
    body: string
    points: string[]
    slug: AppSlug
    downloadLabel: string
    downloadReady: boolean
    onDownload: () => void
}) {
    return (
        <div id={id} className="scroll-mt-28 grid md:grid-cols-2 gap-10 items-start border-t border-[var(--line)] pt-14">
            <div>
                <p className="text-sm text-[var(--accent)] mb-2">{name}</p>
                <h3 className="font-display text-3xl md:text-4xl font-semibold mb-4">{headline}</h3>
                <p className="text-[var(--muted)] leading-relaxed text-lg">{body}</p>
                <div className="mt-6 rounded-2xl border border-[var(--line)] bg-white/80 px-5 py-4">
                    <AppRewardFacts slug={slug} />
                </div>
                <div className="mt-6 flex flex-wrap gap-3">
                    <Button
                        type="button"
                        className="rounded-full px-6"
                        disabled={!downloadReady}
                        onClick={onDownload}
                    >
                        {downloadLabel}
                    </Button>
                    <Button asChild variant="outline" className="rounded-full px-6">
                        <Link to="/earn">Refer and earn</Link>
                    </Button>
                </div>
            </div>
            <ul className="space-y-3">
                {points.map((point) => (
                    <li
                        key={point}
                        className="flex gap-3 items-start rounded-2xl border border-[var(--line)] bg-white/70 px-5 py-4"
                    >
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0" />
                        <span className="text-[var(--ink)]">{point}</span>
                    </li>
                ))}
            </ul>
        </div>
    )
}
