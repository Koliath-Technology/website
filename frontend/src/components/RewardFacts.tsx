import { REWARD_GATE_COPY, rewardRuleFor, type AppSlug, getApp } from "../lib/catalog"
import { useInstallCounts } from "../lib/hubStats"

export function RewardGateNote({ className = "" }: { className?: string }) {
    return <p className={className}>{REWARD_GATE_COPY}</p>
}

export function AppRewardFacts({
    slug,
    tone = "light",
}: {
    slug: AppSlug
    tone?: "light" | "dark"
}) {
    const app = getApp(slug)
    const installs = useInstallCounts()
    const muted = tone === "dark" ? "text-slate-300" : "text-[var(--muted)]"
    const ink = tone === "dark" ? "text-white" : "text-[var(--ink)]"
    const accent = tone === "dark" ? "text-teal-300" : "text-[var(--accent)]"

    return (
        <div className={`text-sm leading-relaxed ${muted}`}>
            <p>
                <span className={`font-medium ${ink}`}>Reward: </span>
                {rewardRuleFor(app)}
            </p>
            <p className={`mt-2 font-medium ${accent}`}>
                {app.points} points · {installs[slug]} installs
            </p>
        </div>
    )
}
