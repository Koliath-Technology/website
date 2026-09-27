import React, { useState } from "react"
import { NavLink, Link } from "react-router-dom"

const Navbar: React.FC = () => {
    const [open, setOpen] = useState(false)

    const sections = [
        { name: "Products", path: "/products" },
        { name: "Earn", path: "/earn" },
        { name: "Services", path: "/service" },
        { name: "About", path: "/about" },
        { name: "Careers", path: "/careers" },
        { name: "Blog", path: "/blog" },
        { name: "Contact", path: "/contact" },
    ]

    return (
        <header className="fixed top-0 inset-x-0 z-50 border-b border-[var(--line)]/80 bg-[var(--bg)]/80 backdrop-blur-xl">
            <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                <Link
                    to="/"
                    className="font-display text-2xl font-semibold tracking-tight text-[var(--ink)] hover:opacity-80 transition-opacity"
                >
                    Koliath
                </Link>

                <nav className="hidden lg:flex items-center gap-1">
                    {sections.map((section) => (
                        <NavLink
                            key={section.name}
                            to={section.path}
                            className={({ isActive }) =>
                                `px-3.5 py-2 text-sm transition-colors rounded-full ${
                                    isActive
                                        ? "text-[var(--ink)] bg-black/[0.04]"
                                        : "text-[var(--ink)] hover:opacity-70"
                                }`
                            }
                        >
                            {section.name}
                        </NavLink>
                    ))}
                    <Link
                        to="/contact?topic=list-app"
                        className="ml-2 text-sm px-4 py-2 rounded-full bg-[var(--ink)] text-white hover:opacity-90 transition-opacity whitespace-nowrap"
                    >
                        List your app
                    </Link>
                </nav>

                <button
                    type="button"
                    className="lg:hidden p-2 text-[var(--ink)]"
                    aria-label="Menu"
                    onClick={() => setOpen((v) => !v)}
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d={open ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}
                        />
                    </svg>
                </button>
            </div>

            {open && (
                <div className="lg:hidden border-t border-[var(--line)] bg-[var(--bg)] px-6 py-4 space-y-1">
                    {sections.map((section) => (
                        <NavLink
                            key={section.name}
                            to={section.path}
                            onClick={() => setOpen(false)}
                            className={({ isActive }) =>
                                `block px-3 py-3 rounded-xl text-sm ${
                                    isActive ? "bg-black/[0.04] text-[var(--ink)]" : "text-[var(--ink)]"
                                }`
                            }
                        >
                            {section.name}
                        </NavLink>
                    ))}
                    <Link
                        to="/contact?topic=list-app"
                        onClick={() => setOpen(false)}
                        className="block px-3 py-3 rounded-xl text-sm bg-[var(--ink)] text-white text-center"
                    >
                        List your app
                    </Link>
                </div>
            )}
        </header>
    )
}

export default Navbar
