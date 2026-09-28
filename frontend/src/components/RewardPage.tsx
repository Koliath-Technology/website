import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
    Users,
    Award,
    TrendingUp,
    Copy,
    Star,
    Loader2,
    Coins,
    LogOut,
    ShieldCheck,
    Smartphone,
} from "lucide-react"
import { Button } from "./ui/button"
import { GoogleSignIn } from "./GoogleSignIn"
import { useAuth } from "../lib/auth"
import {
    fetchReferralRules,
    fetchRewardProgram,
    redeemGiftCard,
    type GiftCardStatus,
    type ReferralRule,
    type RewardProgram,
} from "../lib/api"
import { useReferralTracker } from "../hooks/useReferralTracker"
import { downloadUrls } from "../lib/downloads"
import { openVerifiedDownload } from "../lib/installApi"

const INSTALL_APPS = [
    { slug: "sapient", label: "Sapient" },
    { slug: "adverts", label: "Adverts" },
    { slug: "adverts-rewards", label: "Adverts Rewards" },
    { slug: "advert-cohort", label: "Advert Cohort" },
    { slug: "diabetic-buddy", label: "Diabetic Buddy" },
]

export default function RewardPage() {
    const { user, signOut, refresh } = useAuth()
    const [rules, setRules] = useState<ReferralRule[]>([])
    const [program, setProgram] = useState<RewardProgram | null>(null)
    const [programNote, setProgramNote] = useState<string | null>(null)
    const [loadingRewards, setLoadingRewards] = useState(true)
    const [redeemingGift, setRedeemingGift] = useState(false)
    const [giftKey, setGiftKey] = useState<string | null>(null)
    const [redeemError, setRedeemError] = useState<string | null>(null)
    const [redeemSuccess, setRedeemSuccess] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const navigate = useNavigate()
    const { refCode, trackEvent } = useReferralTracker()
    const [downloadNote, setDownloadNote] = useState<string | null>(null)

    const onInstallDownload = (slug: string) => {
        void trackEvent("install_attempt")
        void openVerifiedDownload({
            slug,
            loggedIn: Boolean(user),
            refCode,
            storeUrl: downloadUrls[slug],
            onMissingStore: () => {
                if (user) return
                navigate(`/contact?topic=download&app=${encodeURIComponent(slug)}`)
            },
        }).then(setDownloadNote)
    }

    useEffect(() => {
        Promise.all([fetchReferralRules(), fetchRewardProgram()])
            .then(([ruleList, programConfig]) => {
                setRules(ruleList)
                setProgram(programConfig)
            })
            .catch(() => {
                setProgram(null)
                setProgramNote("Reward amounts load from the server.")
            })
            .finally(() => setLoadingRewards(false))
    }, [])

    const copyCode = async () => {
        if (!user) return
        const link = `${window.location.origin}/signup?ref=${user.globalCode}`
        await navigator.clipboard.writeText(link)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const gift: GiftCardStatus | null = user?.giftCard ?? null
    const shownProgram = user?.rewardProgram ?? program
    const progressPct = (() => {
        if (!user || !shownProgram) return 0
        return Math.min(
            100,
            Math.round((user.pointsAvailable / Math.max(shownProgram.giftCardCostCoins, 1)) * 100)
        )
    })()

    const handleGiftRedeem = async () => {
        if (!user || !gift?.eligible) return
        const key = giftKey ?? crypto.randomUUID()
        if (!giftKey) setGiftKey(key)
        setRedeemingGift(true)
        setRedeemError(null)
        setRedeemSuccess(null)
        try {
            const result = await redeemGiftCard(key)
            setRedeemSuccess(
                result.alreadyRedeemed
                    ? "That redemption was already submitted."
                    : `₹${result.valueInr} gift card requested. ${result.points} coins were used.`
            )
            setGiftKey(null)
            await refresh()
        } catch (err: unknown) {
            setRedeemError(err instanceof Error ? err.message : "Failed to redeem")
        } finally {
            setRedeemingGift(false)
        }
    }

    return (
        <div className="reward-page min-h-screen text-[var(--ink)] pb-24">
            <section className="relative pt-28 pb-16 px-6 overflow-hidden">
                <div className="absolute inset-0 reward-aurora pointer-events-none" />
                <div className="max-w-4xl mx-auto text-center relative z-10">
                    <motion.p
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-sm tracking-[0.2em] uppercase text-[var(--accent)] mb-4"
                    >
                        Earn
                    </motion.p>
                    <motion.h1
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 }}
                        className="font-display text-4xl md:text-6xl font-semibold tracking-tight mb-5"
                    >
                        Share a link.
                        <br />
                        <span className="text-[var(--accent)]">Earn when they qualify.</span>
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="text-lg text-[var(--muted)] max-w-2xl mx-auto mb-10 leading-relaxed"
                    >
                        {shownProgram
                            ? `Sign in with Google for ${shownProgram.firstLoginRewardCoins} coins. A verified app install pays the amount set for that app. A friend who joins with your link adds ${shownProgram.referralRewardCoins} coins after signup checks pass.`
                            : "Reward amounts load from the server."}
                    </motion.p>

                    {refCode && !user && (
                        <p className="text-sm mb-6 rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-3 inline-block">
                            You arrived with referral code{" "}
                            <span className="font-mono font-semibold">{refCode}</span>. It stays on
                            this browser for download attribution.
                        </p>
                    )}

                    {!user && (
                        <div className="flex flex-col items-center gap-4">
                            <GoogleSignIn />
                            <Link to="/login" className="text-sm underline text-[var(--ink)]">
                                Login
                            </Link>
                        </div>
                    )}
                </div>
            </section>

            <AnimatePresence>
                {user && (
                    <motion.section
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="px-6 mb-16"
                    >
                        <div className="max-w-5xl mx-auto rounded-[2rem] border border-[var(--line)] bg-white/80 backdrop-blur-md p-8 shadow-[0_20px_60px_-30px_rgba(15,40,35,0.35)]">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                                <div className="flex items-center gap-4">
                                    {user.pictureUrl ? (
                                        <img
                                            src={user.pictureUrl}
                                            alt=""
                                            className="w-14 h-14 rounded-full object-cover ring-2 ring-[var(--accent)]/30"
                                            referrerPolicy="no-referrer"
                                        />
                                    ) : (
                                        <div className="w-14 h-14 rounded-full bg-[var(--accent-soft)]" />
                                    )}
                                    <div>
                                        <h2 className="text-xl font-semibold">{user.displayName}</h2>
                                        <p className="text-sm text-[var(--muted)]">{user.email}</p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        variant="outline"
                                        className="rounded-full"
                                        onClick={() => void copyCode()}
                                    >
                                        <Copy className="w-4 h-4 mr-2" />
                                        {copied ? "Copied" : "Copy invite link"}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className="rounded-full"
                                        onClick={signOut}
                                    >
                                        <LogOut className="w-4 h-4 mr-2" />
                                        Sign out
                                    </Button>
                                </div>
                            </div>

                            <div className="mb-8 p-5 rounded-2xl bg-[var(--surface)] border border-[var(--line)]">
                                <p className="text-xs uppercase tracking-wider text-[var(--muted)] mb-2">
                                    Your global code
                                </p>
                                <p className="font-mono text-3xl font-semibold tracking-widest text-[var(--ink)]">
                                    {user.globalCode}
                                </p>
                                <p className="text-sm text-[var(--muted)] mt-2">
                                    Use the same Google account in each Koliath app to link
                                    rewards automatically.
                                </p>
                            </div>

                            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                                {[
                                    {
                                        icon: <Coins className="w-5 h-5 text-amber-500" />,
                                        label: "Available",
                                        value: user.pointsAvailable,
                                    },
                                    {
                                        icon: <Users className="w-5 h-5" />,
                                        label: "Valid referrals",
                                        value: user.validReferrals ?? 0,
                                    },
                                    {
                                        icon: <TrendingUp className="w-5 h-5 text-[var(--accent)]" />,
                                        label: "Pending",
                                        value: user.pendingReferrals,
                                    },
                                    {
                                        icon: <Award className="w-5 h-5 text-emerald-600" />,
                                        label: "Confirmed",
                                        value: user.confirmedReferrals,
                                    },
                                ].map((card) => (
                                    <div
                                        key={card.label}
                                        className="rounded-2xl border border-[var(--line)] bg-white p-5"
                                    >
                                        <div className="flex items-center gap-2 text-[var(--muted)] text-sm mb-2">
                                            {card.icon}
                                            {card.label}
                                        </div>
                                        <div className="text-3xl font-semibold">{card.value}</div>
                                        {card.label === "Available" && (user.installPoints ?? 0) > 0 && (
                                            <p className="text-xs text-[var(--muted)] mt-1">
                                                Includes {user.installPoints} verified install points
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <div className="mb-2 flex justify-between text-sm">
                                <span className="text-[var(--muted)]">
                                    Toward ₹{shownProgram?.giftCardValueInr ?? "…"} gift card
                                    {shownProgram
                                        ? ` (${shownProgram.giftCardCostCoins} coins and ${shownProgram.referralsRequiredForRedemption} valid referrals)`
                                        : ""}
                                </span>
                                <span className="font-medium text-[var(--accent)]">
                                    {user.pointsAvailable} coins
                                </span>
                            </div>
                            <div className="h-2.5 rounded-full bg-[var(--surface)] overflow-hidden mb-8">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progressPct}%` }}
                                    className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-teal-400"
                                />
                            </div>

                            {user.linkedApps.length > 0 && (
                                <div className="mb-6">
                                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                                        <Smartphone className="w-4 h-4" /> Linked apps
                                    </h3>
                                    <div className="flex flex-wrap gap-2">
                                        {user.linkedApps.map((app) => (
                                            <span
                                                key={`${app.sourceApp}-${app.appUid}`}
                                                className="text-xs px-3 py-1.5 rounded-full bg-[var(--accent-soft)] text-[var(--ink)] border border-[var(--line)]"
                                            >
                                                {app.sourceApp}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {redeemError && (
                                <p className="text-sm text-red-600 mb-2">{redeemError}</p>
                            )}
                            {redeemSuccess && (
                                <p className="text-sm text-emerald-700 mb-2">{redeemSuccess}</p>
                            )}
                        </div>
                    </motion.section>
                )}
            </AnimatePresence>

            <section className="px-6 py-8">
                <div className="max-w-6xl mx-auto rounded-[1.75rem] border border-[var(--line)] bg-white/90 p-7">
                    <h2 className="font-display text-2xl font-semibold mb-2">Verify an install</h2>
                    <p className="text-[var(--muted)] mb-4 max-w-3xl">
                        A download click does not award points. When you are signed in, Koliath mints a
                        short-lived verification token for the app. Points land only after that app
                        confirms the install with the server. The published download reward is{" "}
                        {shownProgram ? `${shownProgram.appDownloadRewardCoins} coins` : "loaded from the server"}.
                        Each app still pays the amount an admin set for it. This is a confidence check,
                        not proof that a person installed the app.
                    </p>
                    <div className="flex flex-wrap gap-2 mb-4">
                        {INSTALL_APPS.map((app) => (
                            <Button
                                key={app.slug}
                                type="button"
                                variant="outline"
                                className="rounded-full"
                                onClick={() => onInstallDownload(app.slug)}
                            >
                                {downloadUrls[app.slug] ? `Download ${app.label}` : `Request ${app.label}`}
                            </Button>
                        ))}
                    </div>
                    {downloadNote && <p className="text-sm text-[var(--ink)] mb-3">{downloadNote}</p>}
                    <div className="flex flex-wrap gap-4 text-sm">
                        <Link to="/developer" className="text-[var(--accent)] hover:underline">
                            Developer portal
                        </Link>
                    </div>
                </div>
            </section>

            <section className="px-6 py-12">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-12">
                        <ShieldCheck className="w-10 h-10 text-[var(--accent)] mx-auto mb-4" />
                        <h2 className="font-display text-3xl md:text-4xl font-semibold mb-3">
                            Referral guidelines
                        </h2>
                        <p className="text-[var(--muted)] max-w-2xl mx-auto">
                            The signup link pays the program referral amount after Google sign-in.
                            These per-app rules are a separate qualify check inside each product,
                            and a bare install does not pay them.
                        </p>
                    </div>
                    <div className="grid md:grid-cols-2 gap-6">
                        {(rules.length
                            ? rules
                            : [
                                  {
                                      app: "sapient",
                                      label: "Sapient",
                                      description:
                                          "Download + one full day of genuine use (24 hours).",
                                      confirmOn: "day_active",
                                      points: 100,
                                  },
                                  {
                                      app: "adverts",
                                      label: "Adverts",
                                      description:
                                          "Download + successful purchase (purchase wiring coming soon).",
                                      confirmOn: "purchase",
                                      points: 100,
                                  },
                              ]
                        ).map((rule, i) => (
                            <motion.div
                                key={rule.app}
                                initial={{ opacity: 0, y: 16 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.05 }}
                                className="rounded-3xl border border-[var(--line)] bg-white/90 p-7"
                            >
                                <div className="flex items-start justify-between gap-3 mb-3">
                                    <h3 className="text-xl font-semibold">{rule.label}</h3>
                                    <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-[var(--surface)] text-[var(--muted)]">
                                        {rule.confirmOn}
                                    </span>
                                </div>
                                <p className="text-[var(--muted)] leading-relaxed mb-4">
                                    {rule.description}
                                </p>
                                <p className="text-sm font-medium text-[var(--accent)]">
                                    +{rule.points} points when confirmed
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="px-6 py-12">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-12">
                        <h2 className="font-display text-3xl font-semibold mb-3">Gift card</h2>
                        <p className="text-[var(--muted)]">
                            {shownProgram
                                ? `₹${shownProgram.giftCardValueInr} unlocks at ${shownProgram.giftCardCostCoins} coins and ${shownProgram.referralsRequiredForRedemption} valid referrals.`
                                : programNote ?? "Reward amounts load from the server."}
                        </p>
                    </div>
                    {shownProgram && (
                        <div className="max-w-xl mx-auto mb-12 rounded-[1.75rem] border border-[var(--line)] bg-white p-7">
                            <div className="flex items-center gap-2 text-sm text-[var(--muted)] mb-3">
                                <Coins className="w-4 h-4 text-amber-500" />
                                {shownProgram.giftCardCostCoins} coins
                            </div>
                            <h3 className="text-xl font-semibold mb-2">
                                ₹{shownProgram.giftCardValueInr} gift card
                            </h3>
                            <p className="text-sm text-[var(--muted)] mb-4">
                                {gift?.eligible
                                    ? "You can redeem this now."
                                    : user
                                      ? [
                                            (gift?.coinsShort ?? shownProgram.giftCardCostCoins) > 0
                                                ? `${gift?.coinsShort ?? shownProgram.giftCardCostCoins} more coins`
                                                : null,
                                            (gift?.referralsShort ?? shownProgram.referralsRequiredForRedemption) > 0
                                                ? `${gift?.referralsShort ?? shownProgram.referralsRequiredForRedemption} more valid referrals`
                                                : null,
                                        ]
                                            .filter(Boolean)
                                            .join(" and ") || "Still locked"
                                      : "Sign in to see your progress."}
                            </p>
                            <Button
                                disabled={!gift?.eligible || redeemingGift}
                                onClick={() => void handleGiftRedeem()}
                                className="w-full rounded-xl h-12"
                            >
                                {redeemingGift ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : gift?.eligible ? (
                                    "Redeem"
                                ) : user ? (
                                    "Locked"
                                ) : (
                                    "Sign in to redeem"
                                )}
                            </Button>
                        </div>
                    )}
                    {loadingRewards && !shownProgram && (
                        <div className="flex justify-center py-16">
                            <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
                        </div>
                    )}
                </div>
            </section>

            <section className="px-6 py-16">
                <div className="max-w-5xl mx-auto text-center">
                    <Star className="w-10 h-10 text-amber-400 mx-auto mb-5" />
                    <h2 className="font-display text-3xl font-semibold mb-10">How it works</h2>
                    <div className="grid md:grid-cols-3 gap-6 text-left">
                        {[
                            {
                                step: "01",
                                title: "Sign in once",
                                text: "Google login on koliath.in/earn creates your global Koliath identity and referral code.",
                            },
                            {
                                step: "02",
                                title: "Share per app",
                                text: "Friends open your signup link and sign in with Google. The referral pays once that signup passes the checks.",
                            },
                            {
                                step: "03",
                                title: "Redeem the gift card",
                                text: shownProgram
                                    ? `The ₹${shownProgram.giftCardValueInr} card unlocks at ${shownProgram.giftCardCostCoins} coins and ${shownProgram.referralsRequiredForRedemption} valid referrals.`
                                    : "The gift card unlocks from the coin and referral counts published by the server.",
                            },
                        ].map((item) => (
                            <div
                                key={item.step}
                                className="rounded-3xl border border-[var(--line)] bg-white/80 p-7 relative overflow-hidden"
                            >
                                <span className="absolute top-4 right-5 text-5xl font-display text-[var(--surface-deep)] select-none">
                                    {item.step}
                                </span>
                                <h3 className="text-lg font-semibold mb-3 relative z-10">
                                    {item.title}
                                </h3>
                                <p className="text-[var(--muted)] leading-relaxed relative z-10">
                                    {item.text}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </div>
    )
}
