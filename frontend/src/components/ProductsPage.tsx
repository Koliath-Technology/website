import { Link, useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { ArrowRight } from "lucide-react"
import { Button } from "./ui/button"
import { useState } from "react"
import { useReferralTracker } from "../hooks/useReferralTracker"
import { downloadUrls } from "../lib/downloads"
import { useAuth } from "../lib/auth"
import { openVerifiedDownload } from "../lib/installApi"

const products = [
    {
        slug: "sapient",
        name: "Sapient",
        tag: "Dating",
        blurb: "India-focused dating ranked by how people think — prompts, sparks, and compatibility before photos.",
        accent: "#0f766e",
        href: "/products#sapient",
    },
    {
        slug: "adverts",
        name: "Adverts",
        tag: "Brand ads",
        blurb: "Quick-commerce AI ads with licensed talent likeness — brief, generate, license, and book campaigns.",
        accent: "#b45309",
        href: "/products#adverts",
    },
    {
        slug: "adverts-rewards",
        name: "Adverts Rewards",
        tag: "Viewer",
        blurb: "Watch verified creative, earn points, and redeem value — the consumer loop for Adverts campaigns.",
        accent: "#0369a1",
        href: "/products#adverts-rewards",
    },
    {
        slug: "advert-cohort",
        name: "Advert Cohort",
        tag: "Talent",
        blurb: "Talent portal to approve likeness requests, set rate cards, and track earnings.",
        accent: "#7c3aed",
        href: "/products#advert-cohort",
    },
    {
        slug: "diabetic-buddy",
        name: "Diabetic Buddy",
        tag: "Health",
        blurb: "Gamified diabetes self-management with on-device glucose forecasting and a companion that levels up with you.",
        accent: "#be123c",
        href: "/diabetic-app",
    },
]

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
                    <p className="text-lg text-[var(--muted)] leading-relaxed">
                        Download Koliath apps from this hub. Referral codes on the link stay
                        with the visit, and points are tracked on Earn.
                    </p>
                </div>

                <div className="grid md:grid-cols-2 gap-5">
                    {products.map((p, i) => (
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
                                <p className="text-[var(--muted)] leading-relaxed">{p.blurb}</p>
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
    const { user } = useAuth()
    const { refCode, trackEvent } = useReferralTracker()
    const [downloadNote, setDownloadNote] = useState<string | null>(null)

    const onDownload = (slug: string) => {
        void trackEvent("install_attempt")
        void openVerifiedDownload({
            slug,
            loggedIn: Boolean(user),
            refCode,
            storeUrl: downloadUrls[slug],
            onMissingStore: () => {
                if (user) return
                if (slug === "diabetic-buddy") {
                    const search = refCode ? `?ref=${encodeURIComponent(refCode)}` : ""
                    navigate(`/diabetic-app${search}`)
                    return
                }
                navigate(`/contact?topic=download&app=${encodeURIComponent(slug)}`)
            },
        }).then(setDownloadNote)
    }

    return (
        <div className="min-h-screen pt-20">
            <ProductsShowcase />

            {refCode && (
                <div className="px-6 -mt-6 mb-4">
                    <p className="max-w-6xl mx-auto text-sm rounded-2xl border border-[var(--line)] bg-[var(--accent-soft)] px-5 py-3 text-[var(--ink)]">
                        Referral code <span className="font-mono font-semibold">{refCode}</span> is
                        saved for this visit. Download buttons attribute the install attempt to it.
                        Points are added only after the app confirms the install.
                    </p>
                </div>
            )}

            {downloadNote && (
                <div className="px-6 mb-4">
                    <p className="max-w-6xl mx-auto text-sm rounded-2xl border border-[var(--line)] bg-white px-5 py-3 text-[var(--ink)]">
                        {downloadNote}
                    </p>
                </div>
            )}

            <section className="px-6 pb-8" id="sapient">
                <div className="max-w-6xl mx-auto space-y-16">
                    <ProductDeepDive
                        id="sapient"
                        name="Sapient"
                        headline="Dating for how you think"
                        body="Photo-first apps optimise for the swipe. Sapient leads with mindprint — prompts, sparks, and Elo-aware compatibility — then reveals photos after a conversation starts."
                        points={[
                            "Compatibility breakdowns, not vanity scores",
                            "Salons, Think Dates, Book Swap, Icebreakers",
                            "Referral rewards after one full day of use",
                        ]}
                        downloadLabel={downloadUrls.sapient ? "Download Sapient" : "Request Sapient"}
                        onDownload={() => onDownload("sapient")}
                    />
                    <ProductDeepDive
                        id="adverts"
                        name="Adverts"
                        headline="AI ads with licensed likeness"
                        body="Brands brief campaigns, generate creative with talent likeness, and book delivery across channels — with payments and rewards wired through Koliath."
                        points={[
                            "Brand app + talent cohort + viewer rewards",
                            "Razorpay orders and campaign delivery APIs",
                            "Referral rewards after a successful purchase",
                        ]}
                        downloadLabel={downloadUrls.adverts ? "Download Adverts" : "Request Adverts"}
                        onDownload={() => onDownload("adverts")}
                    />
                    <ProductDeepDive
                        id="adverts-rewards"
                        name="Adverts Rewards"
                        headline="Watch. Earn. Redeem."
                        body="The viewer loop for Adverts: verified watches credit a ledger users can redeem — kept separate from brand and talent surfaces for security."
                        points={["Verified watch tickets", "Points ledger", "INR estimate & redeem gates"]}
                        downloadLabel={
                            downloadUrls["adverts-rewards"]
                                ? "Download Adverts Rewards"
                                : "Request Adverts Rewards"
                        }
                        onDownload={() => onDownload("adverts-rewards")}
                    />
                    <ProductDeepDive
                        id="advert-cohort"
                        name="Advert Cohort"
                        headline="Talent control of likeness"
                        body="Approve or decline brand requests, set still/video/campaign rates, pause inbound work, and track paid vs pipeline earnings."
                        points={["Request inbox", "Rate cards", "Earnings visibility"]}
                        downloadLabel={
                            downloadUrls["advert-cohort"] ? "Download Advert Cohort" : "Request Advert Cohort"
                        }
                        onDownload={() => onDownload("advert-cohort")}
                    />
                    <ProductDeepDive
                        id="diabetic-buddy"
                        name="Diabetic Buddy"
                        headline="Logging that sticks"
                        body="Glucose, insulin, food, and activity wrapped in a companion loop. Forecasts run on-device — health data never leaves for third-party inference."
                        points={[
                            "On-device forecasting",
                            "Pet leveling & streaks",
                            "Shared Koliath referral backend",
                        ]}
                        downloadLabel="Download Diabetic Buddy"
                        onDownload={() => onDownload("diabetic-buddy")}
                    />
                </div>
            </section>

            <section className="px-6 pb-24">
                <div className="max-w-6xl mx-auto rounded-[2rem] border border-[var(--line)] bg-white/80 p-8 md:p-12">
                    <p className="text-sm tracking-[0.18em] uppercase text-[var(--accent)] mb-3">
                        For businesses
                    </p>
                    <h2 className="font-display text-3xl md:text-4xl font-semibold mb-4">
                        List or host your app
                    </h2>
                    <p className="text-[var(--muted)] leading-relaxed max-w-2xl mb-6">
                        The hub is not only for Koliath’s own products. Businesses can list an app
                        here so people discover it, download it, and land through a referral link.
                        Registered developers can create an app id and a one-time API credential
                        in the developer portal. Tell us the app name, store URLs, and who should
                        own the listing.
                    </p>
                    <div className="flex flex-wrap gap-3">
                        <Button asChild className="rounded-full px-6 h-11">
                            <Link to="/contact?topic=list-app">Contact us to list an app</Link>
                        </Button>
                        <Button asChild variant="outline" className="rounded-full px-6 h-11">
                            <Link to="/developer">Developer portal</Link>
                        </Button>
                    </div>
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
    downloadLabel,
    onDownload,
}: {
    id: string
    name: string
    headline: string
    body: string
    points: string[]
    downloadLabel: string
    onDownload: () => void
}) {
    return (
        <div id={id} className="scroll-mt-28 grid md:grid-cols-2 gap-10 items-start border-t border-[var(--line)] pt-14">
            <div>
                <p className="text-sm text-[var(--accent)] mb-2">{name}</p>
                <h3 className="font-display text-3xl md:text-4xl font-semibold mb-4">{headline}</h3>
                <p className="text-[var(--muted)] leading-relaxed text-lg">{body}</p>
                <div className="mt-6 flex flex-wrap gap-3">
                    <Button type="button" className="rounded-full px-6" onClick={onDownload}>
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
