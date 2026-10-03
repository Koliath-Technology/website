import { Link } from "react-router-dom"

export default function CareersPage() {
    return (
        <div className="min-h-screen pt-28 pb-24 px-6">
            <div className="max-w-2xl mx-auto">
                <p className="text-sm tracking-[0.18em] uppercase text-[var(--accent)] mb-3">Careers</p>
                <h1 className="font-display text-4xl md:text-5xl font-semibold tracking-tight mb-4">
                    Roles at Koliath
                </h1>
                <p className="text-lg text-[var(--muted)] leading-relaxed mb-4">
                    Open roles are not posted as an application form. Contact is by email. The
                    address is coming.
                </p>
                <Link to="/about" className="text-sm underline">
                    Read about the studio
                </Link>
            </div>
        </div>
    )
}
