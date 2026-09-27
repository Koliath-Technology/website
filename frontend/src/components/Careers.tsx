import { HeroSection } from "../components/hero-section"
import { WhyWorkWithUs } from "../components/why-work-with-us"
// import { JobListings } from "../components/job-listings"
// import { Testimonials } from "../components/testimonials"
import { CareersForm } from "../components/CareersForm"
import { motion } from "framer-motion"

const sectionVariants = {
    hidden: { opacity: 0, y: 40 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: { delay: i * 0.15, duration: 0.7, type: "spring" as const },
    }),
}

export default function CareersPage() {
    return (
        <main className="min-h-screen bg-background text-foreground">
            {[
                <HeroSection key="hero" />,
                <WhyWorkWithUs key="why" />,
                // <JobListings key="jobs" />,
                // <Testimonials key="testimonials" />,
                <CareersForm key="form" />,
            ].map((Section, i) => (
                <motion.section
                    key={i}
                    custom={i}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, amount: 0.2 }}
                    variants={sectionVariants}
                >
                    {Section}
                </motion.section>
            ))}
        </main>
    )
}
