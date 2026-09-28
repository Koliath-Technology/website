import { HeroSection } from "./hero-section"
import { WhyWorkWithUs } from "./why-work-with-us"
import { ProductsShowcase } from "./ProductsPage"
import { Link } from "react-router-dom"
import { motion } from "framer-motion"

const sectionVariants = {
    hidden: { opacity: 0, y: 40 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.7, ease: "easeOut" as const },
    },
}

export default function Home() {
    return (
        <div className="min-h-screen">
            <HeroSection />

            <ProductsShowcase compact />

            <motion.section
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.2 }}
                variants={sectionVariants}
                className="px-6 pb-4"
            >
                <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-5">
                    <div className="rounded-[1.75rem] border border-[var(--line)] bg-white/80 p-8">
                        <p className="text-sm tracking-[0.18em] uppercase text-[var(--accent)] mb-3">
                            Company
                        </p>
                        <h2 className="font-display text-3xl font-semibold mb-3">The brochure</h2>
                        <p className="text-[var(--muted)] leading-relaxed mb-6">
                            Services, the studio story, open roles, and writing. This is Koliath
                            Technology as a company you can hire or join.
                        </p>
                        <div className="flex flex-wrap gap-3 text-sm">
                            <Link to="/about" className="underline">
                                About
                            </Link>
                            <Link to="/service" className="underline">
                                Services
                            </Link>
                            <Link to="/careers" className="underline">
                                Careers
                            </Link>
                            <Link to="/blog" className="underline">
                                Blog
                            </Link>
                        </div>
                    </div>
                    <div className="rounded-[1.75rem] border border-[var(--line)] bg-white/80 p-8">
                        <p className="text-sm tracking-[0.18em] uppercase text-[var(--accent)] mb-3">
                            App hub
                        </p>
                        <h2 className="font-display text-3xl font-semibold mb-3">Downloads and points</h2>
                        <p className="text-[var(--muted)] leading-relaxed mb-6">
                            People browse and download apps here. A referral code on the link is
                            kept for the visit. Businesses can list an app on the hub to grow
                            installs.
                        </p>
                        <div className="flex flex-wrap gap-3 text-sm">
                            <Link to="/login" className="underline">
                                Login
                            </Link>
                            <Link to="/products" className="underline">
                                Products
                            </Link>
                            <Link to="/earn" className="underline">
                                Earn
                            </Link>
                            <Link to="/contact?topic=list-app" className="underline">
                                List your app
                            </Link>
                        </div>
                    </div>
                </div>
            </motion.section>

            <motion.section
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.2 }}
                variants={sectionVariants}
                className="px-6 py-20"
            >
                <div className="max-w-6xl mx-auto rounded-[2rem] border border-[var(--line)] overflow-hidden relative reward-band">
                    <div className="relative z-10 p-10 md:p-14 max-w-2xl">
                        <p className="text-sm tracking-[0.18em] uppercase text-[var(--accent)] mb-3">
                            Earn
                        </p>
                        <h2 className="font-display text-3xl md:text-4xl font-semibold mb-4 text-[var(--ink)]">
                            Refer across every Koliath app
                        </h2>
                        <p className="text-[var(--muted)] mb-8 leading-relaxed">
                            One Google login. Separate qualification rules for Sapient, Adverts,
                            Diabetic Buddy, and more. Points show up on Earn when they confirm.
                        </p>
                        <Link
                            to="/earn"
                            className="inline-flex items-center rounded-full bg-[var(--ink)] text-white px-6 py-3 text-sm hover:opacity-90 transition-opacity"
                        >
                            Open Earn
                        </Link>
                    </div>
                </div>
            </motion.section>

            <motion.section
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.2 }}
                variants={sectionVariants}
            >
                <WhyWorkWithUs />
            </motion.section>
        </div>
    )
}

export function SiteFooter() {
    return (
        <footer className="border-t border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]">
            <div className="max-w-6xl mx-auto py-16 px-6">
                <div className="grid md:grid-cols-4 gap-12 mb-12">
                    <div className="col-span-2">
                        <h3 className="font-display text-2xl font-semibold text-[var(--ink)] mb-4">
                            Koliath
                        </h3>
                        <p className="max-w-sm leading-relaxed">
                            Company site and app hub for Sapient, Adverts, and Diabetic Buddy.
                            Download apps, earn points by referring, or list an app you want hosted.
                        </p>
                    </div>
                    <div>
                        <h4 className="font-semibold text-[var(--ink)] mb-4">Explore</h4>
                        <ul className="space-y-2">
                            <li>
                                <Link to="/products" className="hover:text-[var(--ink)]">
                                    Products
                                </Link>
                            </li>
                            <li>
                                <Link to="/earn" className="hover:text-[var(--ink)]">
                                    Earn
                                </Link>
                            </li>
                            <li>
                                <Link to="/service" className="hover:text-[var(--ink)]">
                                    Services
                                </Link>
                            </li>
                            <li>
                                <Link to="/about" className="hover:text-[var(--ink)]">
                                    About
                                </Link>
                            </li>
                            <li>
                                <Link to="/blog" className="hover:text-[var(--ink)]">
                                    Blog
                                </Link>
                            </li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="font-semibold text-[var(--ink)] mb-4">Contact</h4>
                        <ul className="space-y-2">
                            <li>
                                <Link to="/contact" className="hover:text-[var(--ink)]">
                                    Contact us
                                </Link>
                            </li>
                            <li>
                                <Link to="/contact?topic=list-app" className="hover:text-[var(--ink)]">
                                    List your app
                                </Link>
                            </li>
                            <li>
                                <a href="mailto:hello@koliath.in" className="hover:text-[var(--ink)]">
                                    hello@koliath.in
                                </a>
                            </li>
                            <li>
                                <Link to="/careers" className="hover:text-[var(--ink)]">
                                    Careers
                                </Link>
                            </li>
                        </ul>
                    </div>
                </div>
                <div className="pt-8 border-t border-[var(--line)] text-sm">
                    © {new Date().getFullYear()} Koliath Technology. All rights reserved.
                </div>
            </div>
        </footer>
    )
}
