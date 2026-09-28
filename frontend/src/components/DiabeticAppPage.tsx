import { motion } from "framer-motion"
import { Button } from "./ui/button"
import { Shield, Zap, Activity, Brain, Smartphone, Database } from "lucide-react"
import { useState } from "react"
import { useReferralTracker } from "../hooks/useReferralTracker"
import { handleAppDownload } from "../lib/deepLinking"
import { downloadUrls } from "../lib/downloads"
import { useAuth } from "../lib/auth"
import { openVerifiedDownload } from "../lib/installApi"

const features = [
    {
        title: "AI Glucose Prediction",
        description: "Uses Research-grade UKF (Unscented Kalman Filter) and dynamic Bayesian learning for clinical-level accuracy.",
        icon: Brain,
    },
    {
        title: "Smart Advisor",
        description: "Probabilistic forecasting based on non-linear physiological modeling and real-time data.",
        icon: Zap,
    },
    {
        title: "Wearable Integration",
        description: "Seamlessly syncs with heart rate and step count data to improve forecast precision.",
        icon: Activity,
    },
    {
        title: "Secure & Private",
        description: "End-to-end encrypted health data storage with Firebase security protocols.",
        icon: Shield,
    },
]

export default function DiabeticAppPage() {
    const { user } = useAuth()
    const { refCode, trackEvent } = useReferralTracker();
    const [downloadNote, setDownloadNote] = useState<string | null>(null)

    const onDownloadClick = () => {
        void trackEvent('install_attempt');
        void openVerifiedDownload({
            slug: "diabetic-buddy",
            loggedIn: Boolean(user),
            refCode,
            storeUrl: downloadUrls["diabetic-buddy"],
            onMissingStore: (verification) => {
                if (user) return
                void handleAppDownload(refCode, verification)
            },
        }).then(setDownloadNote)
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white overflow-hidden">
            {/* Hero Section */}
            <section className="relative pt-32 pb-20 px-6">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-blue-600/20 blur-[120px] rounded-full pointer-events-none" />
                
                <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
                    <motion.div
                        initial={{ opacity: 0, x: -50 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.8 }}
                    >
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium mb-6">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                            </span>
                            Now in Beta
                        </div>
                        <h1 className="text-5xl md:text-7xl font-bold leading-tight mb-6">
                            Diabetic Buddy: <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-teal-400">
                                Predictive Intelligence
                            </span>
                        </h1>
                        <p className="text-xl text-slate-400 mb-8 max-w-xl leading-relaxed">
                            The world's first clinical-grade, probabilistic glucose prediction engine for your smartphone. Move beyond heuristics with Bayesian learning.
                        </p>
                        <div className="flex flex-wrap gap-4">
                            <Button size="lg" onClick={onDownloadClick} className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-8">
                                Download App
                            </Button>
                            {downloadNote && (
                                <p className="w-full text-sm text-slate-300 max-w-xl">{downloadNote}</p>
                            )}
                            <Button size="lg" variant="outline" className="border-slate-800 hover:bg-slate-900 rounded-full px-8">
                                Read Research
                            </Button>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 1, delay: 0.2 }}
                        className="relative"
                    >
                        <div className="absolute inset-0 bg-gradient-to-tr from-blue-600/30 to-teal-400/30 blur-3xl opacity-20" />
                        <img
                            src="file:///C:/Users/gupta/.gemini/antigravity/brain/d516784d-d78e-4db7-ba84-b8315b5f849b/diabetic_app_mockup_1777573417191.png"
                            alt="Diabetic App Mockup"
                            className="relative z-10 w-full max-w-[500px] mx-auto drop-shadow-[0_0_50px_rgba(37,99,235,0.3)]"
                        />
                    </motion.div>
                </div>
            </section>

            {/* Features Grid */}
            <section className="py-24 px-6 bg-slate-900/50">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-5xl font-bold mb-4">Advanced Physiological Modeling</h2>
                        <p className="text-slate-400 max-w-2xl mx-auto">
                            Built on top of a Scaled Unscented Kalman Filter (UKF) to handle non-linear biological data with precision.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                        {features.map((feature, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1 }}
                                className="pt-8 border-t border-slate-700/50 hover:border-blue-500/50 transition-colors group"
                            >
                                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                    <feature.icon className="w-6 h-6 text-blue-400" />
                                </div>
                                <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                                <p className="text-slate-400 leading-relaxed text-sm">
                                    {feature.description}
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Technical Spec */}
            <section className="py-24 px-6">
                <div className="max-w-5xl mx-auto bg-gradient-to-b from-blue-600/10 to-transparent border border-blue-500/20 rounded-[3rem] p-8 md:p-16">
                    <div className="flex flex-col md:flex-row gap-12 items-center">
                        <div className="flex-1">
                            <h2 className="text-3xl font-bold mb-6">Built for Reliability</h2>
                            <ul className="space-y-4">
                                {[
                                    { icon: Smartphone, text: "Cross-platform Flutter framework" },
                                    { icon: Database, text: "Real-time sync with Firebase Firestore" },
                                    { icon: Brain, text: "On-device ML for low-latency predictions" },
                                ] .map((item, i) => (
                                    <li key={i} className="flex items-center gap-4 text-slate-300">
                                        <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                                            <item.icon className="w-4 h-4 text-blue-400" />
                                        </div>
                                        {item.text}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="flex-1 text-center">
                            <div className="text-6xl font-bold text-blue-400 mb-2">99.8%</div>
                            <div className="text-slate-400 uppercase tracking-widest text-sm">Prediction Stability</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer Placeholder for App Page */}
            <footer className="py-12 border-t border-slate-800 text-center text-slate-500 text-sm">
                © 2025 Koliath Technology. All health data is encrypted and handled according to HIPAA standards.
            </footer>
        </div>
    )
}
