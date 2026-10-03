/**
 * Public app catalog. Points and reward sentences match the server rules.
 * Install counts come from one hub snapshot so every page shows the same number.
 */

export const REFERRALS_REQUIRED = 3

export const REWARD_GATE_COPY =
    "You get no reward points until you have three referrals. Before that, rewards stay locked."

export type AppSlug =
    | "sapient"
    | "adverts"
    | "adverts-rewards"
    | "advert-cohort"
    | "diabetic-buddy"

export interface CatalogApp {
    slug: AppSlug
    name: string
    tag: string
    blurb: string
    accent: string
    href: string
    points: number
    /** Null when this listing has no defined use check. */
    useCheck: string | null
}

export function publicRewardRule(name: string, useCheck: string | null): string {
    const gate = "only if you already have three referrals"
    if (!useCheck) {
        return `Points for ${name} are paid only after that app's own use check, and ${gate}.`
    }
    return `${useCheck}, and ${gate}.`
}

export const CATALOG: CatalogApp[] = [
    {
        slug: "sapient",
        name: "Sapient",
        tag: "Dating",
        blurb: "India-focused dating ranked by how people think — prompts, sparks, and compatibility before photos.",
        accent: "#0f766e",
        href: "/products#sapient",
        points: 100,
        useCheck: "Points for Sapient are awarded only when the person completes their profile",
    },
    {
        slug: "adverts",
        name: "Adverts",
        tag: "Brand ads",
        blurb: "Quick-commerce AI ads with licensed talent likeness — brief, generate, license, and book campaigns.",
        accent: "#b45309",
        href: "/products#adverts",
        points: 100,
        useCheck: "Points for Adverts are awarded only after the person completes a purchase",
    },
    {
        slug: "adverts-rewards",
        name: "Adverts Rewards",
        tag: "Viewer",
        blurb: "Watch verified creative, earn points, and redeem value — the consumer loop for Adverts campaigns.",
        accent: "#0369a1",
        href: "/products#adverts-rewards",
        points: 50,
        useCheck:
            "Points for Adverts Rewards are awarded only after the person completes their first verified watch session",
    },
    {
        slug: "advert-cohort",
        name: "Advert Cohort",
        tag: "Talent",
        blurb: "Talent portal to approve likeness requests, set rate cards, and track earnings.",
        accent: "#7c3aed",
        href: "/products#advert-cohort",
        points: 75,
        useCheck:
            "Points for Advert Cohort are awarded only after the person creates a profile and sets a rate card",
    },
    {
        slug: "diabetic-buddy",
        name: "Diabetic Buddy",
        tag: "Health",
        blurb: "Gamified diabetes self-management with on-device glucose forecasting and a companion that levels up with you.",
        accent: "#be123c",
        href: "/diabetic-app",
        points: 100,
        useCheck:
            "Points for Diabetic Buddy are awarded only after the person signs up and completes first-day onboarding",
    },
]

export function getApp(slug: AppSlug): CatalogApp {
    const app = CATALOG.find((item) => item.slug === slug)
    if (!app) throw new Error(`Unknown app ${slug}`)
    return app
}

export function rewardRuleFor(app: CatalogApp): string {
    return publicRewardRule(app.name, app.useCheck)
}

export interface NamedList {
    slug: string
    name: string
    summary: string
    appSlugs: AppSlug[]
}

export const APP_LISTS: NamedList[] = [
    {
        slug: "think-first",
        name: "Think first",
        summary: "The dating app that starts with how someone thinks.",
        appSlugs: ["sapient"],
    },
    {
        slug: "campaign-desk",
        name: "Campaign desk",
        summary: "Brand ads, the viewer app, and the talent portal.",
        appSlugs: ["adverts", "adverts-rewards", "advert-cohort"],
    },
    {
        slug: "care-loop",
        name: "Care loop",
        summary: "The health app for glucose, logging, and a companion.",
        appSlugs: ["diabetic-buddy"],
    },
]

export function getList(slug: string): NamedList | undefined {
    return APP_LISTS.find((list) => list.slug === slug)
}

export function appPath(slug: AppSlug, refCode: string | null): string {
    const path = slug === "diabetic-buddy" ? "/diabetic-app" : "/products"
    const hash = slug === "diabetic-buddy" ? "" : `#${slug}`
    const params = new URLSearchParams()
    if (refCode) params.set("ref", refCode)
    const search = params.toString()
    return `${path}${search ? `?${search}` : ""}${hash}`
}

export function isAppSlug(value: string): value is AppSlug {
    return CATALOG.some((app) => app.slug === value)
}
