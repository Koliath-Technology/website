"use client"

import { Link } from "react-router-dom"
import { Button } from "../components/ui/button"
import { ArrowRight } from "lucide-react"
import { motion } from "framer-motion"

export function HeroSection() {
    return (
        <section className="relative min-h-[100svh] flex items-end md:items-center overflow-hidden px-6 pb-20 pt-32">
            <div className="absolute inset-0 hero-mesh" aria-hidden />
            <motion.div
                className="absolute -right-20 top-24 w-[55vw] max-w-3xl aspect-[4/5] rounded-[2rem] overflow-hidden hero-photo"
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.9, ease: "easeOut" }}
                aria-hidden
            />
            <div className="absolute inset-0 hero-scrim pointer-events-none" aria-hidden />

            <div className="relative z-10 max-w-6xl mx-auto w-full">
                <motion.p
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="font-display text-5xl sm:text-7xl md:text-8xl font-semibold tracking-tight text-[var(--ink)] mb-6 leading-[0.95]"
                >
                    Koliath
                </motion.p>

                <motion.h1
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.08 }}
                    className="text-xl md:text-2xl text-[var(--ink)] max-w-xl mb-4 font-medium"
                >
                    A product studio and the hub for its apps.
                </motion.h1>

                <motion.p
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.14 }}
                    className="text-base md:text-lg text-[var(--muted)] max-w-lg mb-10 leading-relaxed"
                >
                    Read about Koliath, then download Sapient, Adverts, and Diabetic Buddy.
                    Share a link from Earn — points confirm when the person you refer qualifies.
                </motion.p>

                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="flex flex-col sm:flex-row gap-3"
                >
                    <Button
                        asChild
                        size="lg"
                        className="rounded-full px-8 h-12 bg-[var(--ink)] text-white hover:bg-[var(--ink)]/90"
                    >
                        <Link to="/products">
                            Explore products
                            <ArrowRight className="ml-2 w-4 h-4" />
                        </Link>
                    </Button>
                    <Button
                        asChild
                        size="lg"
                        variant="outline"
                        className="rounded-full px-8 h-12 border-[var(--ink)]/20 bg-white/50 backdrop-blur"
                    >
                        <Link to="/earn">Earn points</Link>
                    </Button>
                </motion.div>
            </div>
        </section>
    )
}
