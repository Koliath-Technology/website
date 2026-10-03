import { useState } from "react"
import { Link } from "react-router-dom"
import { Button } from "./ui/button"
import { AppRewardFacts, RewardGateNote } from "./RewardFacts"
import { useReferralTracker } from "../hooks/useReferralTracker"
import { useAuth } from "../lib/auth"
import { appPath, getApp, type AppSlug } from "../lib/catalog"
import { downloadUrls, withReferral } from "../lib/downloads"
import { recordInstall } from "../lib/hubStats"

type Choice = {
    id: string
    label: string
    app?: AppSlug
    next?: string
}

const QUESTIONS: Record<string, { prompt: string; choices: Choice[] }> = {
    aim: {
        prompt: "What do you want from a Koliath app?",
        choices: [
            {
                id: "people",
                label: "A conversation that starts with how someone thinks",
                app: "sapient",
            },
            { id: "ads", label: "Something in advertising", next: "ads" },
            { id: "health", label: "Help with glucose and daily care", app: "diabetic-buddy" },
        ],
    },
    ads: {
        prompt: "Which part of advertising?",
        choices: [
            { id: "brand", label: "I brief and book campaigns", app: "adverts" },
            { id: "watch", label: "I watch ads and redeem points", app: "adverts-rewards" },
            { id: "talent", label: "I approve use of my likeness", app: "advert-cohort" },
        ],
    },
}

export default function QuizPage() {
    const { refCode, trackEvent } = useReferralTracker()
    const { user } = useAuth()
    const [step, setStep] = useState("aim")
    const [picked, setPicked] = useState<AppSlug | null>(null)
    const [copied, setCopied] = useState(false)

    const question = QUESTIONS[step]

    const choose = (choice: Choice) => {
        if (choice.app) {
            setPicked(choice.app)
            return
        }
        if (choice.next && QUESTIONS[choice.next]) setStep(choice.next)
    }

    const shareQuiz = async () => {
        const code = user?.globalCode || refCode
        const url = new URL("/quiz", window.location.origin)
        if (code) url.searchParams.set("ref", code)
        try {
            await navigator.clipboard.writeText(url.toString())
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            setCopied(false)
        }
    }

    const openDownload = (slug: AppSlug) => {
        void trackEvent("install_attempt")
        void recordInstall(slug)
        const external = downloadUrls[slug]
        if (external) {
            const href = withReferral(external, refCode)
            if (href) window.open(href, "_blank", "noopener,noreferrer")
        }
    }

    return (
        <div className="min-h-screen pt-28 pb-24 px-6">
            <div className="max-w-2xl mx-auto">
                <p className="text-sm tracking-[0.18em] uppercase text-[var(--accent)] mb-3">Quiz</p>
                <h1 className="font-display text-4xl md:text-5xl font-semibold tracking-tight mb-4">
                    Find one app.
                </h1>
                <p className="text-[var(--muted)] leading-relaxed mb-4">
                    Browse and answer without an account. Sign in only if you want a referral link
                    to share. The result is a single app, with the referrer code attached when this
                    visit has one.
                </p>
                <RewardGateNote className="text-sm text-[var(--ink)] mb-8" />

                {!picked && question && (
                    <div className="rounded-[1.75rem] border border-[var(--line)] bg-white/80 p-7">
                        <h2 className="font-display text-2xl font-semibold mb-5">{question.prompt}</h2>
                        <div className="space-y-3">
                            {question.choices.map((choice) => (
                                <button
                                    key={choice.id}
                                    type="button"
                                    onClick={() => choose(choice)}
                                    className="w-full text-left rounded-2xl border border-[var(--line)] px-5 py-4 hover:border-[var(--accent)]"
                                >
                                    {choice.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {picked && (
                    <Result
                        slug={picked}
                        refCode={refCode}
                        onDownload={() => openDownload(picked)}
                        onReset={() => {
                            setPicked(null)
                            setStep("aim")
                        }}
                    />
                )}

                <div className="mt-8 flex flex-wrap gap-3">
                    <Button type="button" variant="outline" className="rounded-full" onClick={() => void shareQuiz()}>
                        {copied ? "Link copied" : user ? "Copy quiz link with your code" : "Copy quiz link"}
                    </Button>
                    {!user && (
                        <Link to="/login" className="text-sm underline self-center">
                            Sign in for your own referral link
                        </Link>
                    )}
                </div>
            </div>
        </div>
    )
}

function Result({
    slug,
    refCode,
    onDownload,
    onReset,
}: {
    slug: AppSlug
    refCode: string | null
    onDownload: () => void
    onReset: () => void
}) {
    const app = getApp(slug)
    const destination = appPath(slug, refCode)
    const canDownload = Boolean(downloadUrls[slug]) || slug === "diabetic-buddy"

    return (
        <div className="rounded-[1.75rem] border border-[var(--line)] bg-white/90 p-7">
            <p className="text-sm text-[var(--accent)] mb-2">Your app</p>
            <h2 className="font-display text-3xl font-semibold mb-3">{app.name}</h2>
            <p className="text-[var(--muted)] mb-4">{app.blurb}</p>
            <AppRewardFacts slug={slug} />
            <p className="text-sm text-[var(--ink)] mt-4">
                {refCode ? (
                    <>
                        Referrer code <span className="font-mono font-semibold">{refCode}</span> is
                        attached to this app.
                    </>
                ) : (
                    <>This visit has no referrer code, so the app link is not attributed.</>
                )}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild className="rounded-full">
                    <Link to={destination}>Open {app.name}</Link>
                </Button>
                {canDownload && slug !== "diabetic-buddy" && downloadUrls[slug] && (
                    <Button type="button" variant="outline" className="rounded-full" onClick={onDownload}>
                        Download
                    </Button>
                )}
                <Button type="button" variant="outline" className="rounded-full" onClick={onReset}>
                    Start over
                </Button>
            </div>
        </div>
    )
}
