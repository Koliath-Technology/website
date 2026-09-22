import { useState, type FormEvent } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { motion } from "framer-motion"
import { API_ROOT } from "../lib/api"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"

const CONTACT_EMAIL =
    (import.meta.env.VITE_CONTACT_EMAIL as string | undefined)?.trim() || "hello@koliath.in"

const TOPICS = [
    { id: "general", label: "General" },
    { id: "list-app", label: "List or host an app" },
    { id: "download", label: "App download" },
    { id: "press", label: "Press" },
    { id: "careers", label: "Careers" },
] as const

type Topic = (typeof TOPICS)[number]["id"]

function isTopic(value: string | null): value is Topic {
    return TOPICS.some((topic) => topic.id === value)
}

export default function ContactPage() {
    const [params] = useSearchParams()
    const initialTopic = isTopic(params.get("topic")) ? params.get("topic")! : "general"
    const appHint = params.get("app")?.slice(0, 80) ?? ""

    const [name, setName] = useState("")
    const [email, setEmail] = useState("")
    const [topic, setTopic] = useState<Topic>(initialTopic as Topic)
    const [message, setMessage] = useState(
        appHint ? `I'd like to talk about ${appHint}.` : ""
    )
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [sent, setSent] = useState<"api" | "email" | null>(null)

    const mailto = () => {
        const subject = `Koliath — ${TOPICS.find((item) => item.id === topic)?.label ?? "Contact"}`
        const body = [`Name: ${name}`, `Email: ${email}`, appHint ? `App: ${appHint}` : "", "", message]
            .filter(Boolean)
            .join("\n")
        return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    }

    const onSubmit = async (event: FormEvent) => {
        event.preventDefault()
        setError(null)
        setSent(null)

        if (name.trim().length < 2 || !email.includes("@") || message.trim().length < 10) {
            setError("Add your name, a valid email, and a message of at least 10 characters.")
            return
        }

        setSubmitting(true)
        try {
            const response = await fetch(`${API_ROOT}/api/contact`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim(),
                    email: email.trim(),
                    topic,
                    message: message.trim(),
                    app: appHint || undefined,
                }),
            })
            if (!response.ok) {
                throw new Error("Contact API unavailable")
            }
            setSent("api")
        } catch {
            setSent("email")
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="min-h-screen pt-28 pb-24 px-6">
            <div className="max-w-6xl mx-auto grid lg:grid-cols-[1.1fr_0.9fr] gap-12 items-start">
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                    <p className="text-sm tracking-[0.18em] uppercase text-[var(--accent)] mb-3">
                        Contact us
                    </p>
                    <h1 className="font-display text-4xl md:text-6xl font-semibold tracking-tight mb-5">
                        Talk to the studio, or list an app.
                    </h1>
                    <p className="text-lg text-[var(--muted)] leading-relaxed max-w-xl mb-8">
                        Koliath is the company site and the download hub. Write to us about
                        services, careers, and press — or tell us about an app you want hosted
                        so more people can find it and install it.
                    </p>

                    <div className="rounded-[1.75rem] border border-[var(--line)] bg-white/80 p-7 mb-6">
                        <h2 className="font-display text-2xl font-semibold mb-2">List or host your app</h2>
                        <p className="text-[var(--muted)] leading-relaxed mb-4">
                            Businesses can put an app on koliath.in so visitors browse it, download
                            it, and arrive through referral links. Hosting is how you grow installs.
                            We do not run a full listing CMS yet — send the app name, store links,
                            and who should receive the traffic, and we will follow up.
                        </p>
                        <button
                            type="button"
                            className="text-sm font-medium text-[var(--accent)] hover:underline"
                            onClick={() => setTopic("list-app")}
                        >
                            Use the form with “List or host an app”
                        </button>
                    </div>

                    <p className="text-sm text-[var(--muted)]">
                        Prefer email?{" "}
                        <a className="text-[var(--ink)] underline" href={`mailto:${CONTACT_EMAIL}`}>
                            {CONTACT_EMAIL}
                        </a>
                        . Looking for a role? See{" "}
                        <Link className="text-[var(--ink)] underline" to="/careers">
                            Careers
                        </Link>
                        .
                    </p>
                </motion.div>

                <motion.form
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 }}
                    onSubmit={(event) => void onSubmit(event)}
                    className="rounded-[1.75rem] border border-[var(--line)] bg-white/90 p-7 md:p-8 space-y-5"
                >
                    <div className="space-y-2">
                        <Label htmlFor="contact-name">Name</Label>
                        <Input
                            id="contact-name"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            autoComplete="name"
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="contact-email">Email</Label>
                        <Input
                            id="contact-email"
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            autoComplete="email"
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="contact-topic">Topic</Label>
                        <select
                            id="contact-topic"
                            value={topic}
                            onChange={(event) => setTopic(event.target.value as Topic)}
                            className="h-9 w-full rounded-md border border-[var(--line)] bg-transparent px-3 text-sm"
                        >
                            {TOPICS.map((item) => (
                                <option key={item.id} value={item.id}>
                                    {item.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="contact-message">Message</Label>
                        <textarea
                            id="contact-message"
                            value={message}
                            onChange={(event) => setMessage(event.target.value)}
                            required
                            minLength={10}
                            rows={6}
                            className="w-full rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-[var(--accent)] focus-visible:ring-[3px] focus-visible:ring-[var(--accent)]/30"
                        />
                    </div>

                    {error && <p className="text-sm text-red-600">{error}</p>}

                    {sent === "api" && (
                        <p className="text-sm text-emerald-700">
                            Received. We will reply at {email.trim()}.
                        </p>
                    )}

                    {sent === "email" && (
                        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                            The contact API is not running. Send the same note directly to{" "}
                            <a className="underline" href={mailto()}>
                                {CONTACT_EMAIL}
                            </a>
                            .
                        </p>
                    )}

                    <Button type="submit" disabled={submitting} className="rounded-full px-6 h-11">
                        {submitting ? "Sending…" : "Send message"}
                    </Button>
                </motion.form>
            </div>
        </div>
    )
}
