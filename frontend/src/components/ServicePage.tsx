import React, { useState } from "react"
import { Brain, Zap, Smartphone, Database, Shield, BarChart2 } from "lucide-react"

interface Service {
    id: number
    icon: React.ReactNode
    title: string
    description: string
    features: string[]
}

const ServicesPage: React.FC = () => {
    const [activeService, setActiveService] = useState<number | null>(null)

    const services: Service[] = [
        {
            id: 1,
            icon: <Brain size={32} />,
            title: "Generative AI Development",
            description:
                "Design and deploy production-ready LLM-powered applications tailored to your business workflows and domain knowledge.",
            features: [
                "Custom LLM Fine-tuning",
                "RAG Architectures",
                "AI Agents & Orchestration",
            ],
        },
        {
            id: 2,
            icon: <BarChart2 size={32} />,
            title: "Machine Learning Engineering",
            description:
                "End-to-end ML model development—from data exploration and feature engineering to model training, evaluation, and deployment.",
            features: [
                "Predictive Modeling",
                "Computer Vision",
                "NLP & Text Analytics",
            ],
        },
        {
            id: 3,
            icon: <Smartphone size={32} />,
            title: "AI-Powered App Development",
            description:
                "Build intelligent mobile and web applications with embedded ML capabilities for smarter, more intuitive user experiences.",
            features: [
                "On-device ML Inference",
                "Personalization Engines",
                "Conversational Interfaces",
            ],
        },
        {
            id: 4,
            icon: <Database size={32} />,
            title: "Data Engineering & MLOps",
            description:
                "Build robust data pipelines and MLOps infrastructure to continuously train, monitor, and improve your AI systems at scale.",
            features: [
                "Data Pipeline Automation",
                "Model Monitoring",
                "CI/CD for ML",
            ],
        },
        {
            id: 5,
            icon: <Shield size={32} />,
            title: "Responsible AI & Compliance",
            description:
                "Ensure your AI solutions meet ethical standards, regulatory requirements, and data privacy best practices.",
            features: [
                "Bias Auditing",
                "GDPR & HIPAA Compliance",
                "Explainability Frameworks",
            ],
        },
        {
            id: 6,
            icon: <Zap size={32} />,
            title: "AI Strategy Consulting",
            description:
                "Navigate the AI landscape with expert guidance. We help you identify high-impact use cases and build a roadmap for intelligent transformation.",
            features: [
                "AI Readiness Assessment",
                "Use Case Discovery",
                "Technology Roadmapping",
            ],
        },
    ]

    return (
        <div className="font-sans min-h-screen text-gray-900 bg-slate-900">
            {/* Hero Section */}

            <section
                className="py-32 text-center bg-cover bg-center"
                style={{
                    backgroundImage:
                        "url('https://lh3.googleusercontent.com/aida-public/AB6AXuAZe37vGdGJbQOyyKveGhyrPmlLNijTYIsvrV_vliyYluQ9bkz3t859rH2RoW_OEjHBTfwvExx2_2PZufWimRe6UlLdozKQXM2C2zfgnIxK2LRsFYIEQ391ySyoU6qxvnpeTb8B7nlDs6dlkoTltzKaDYs9aLvKghd8DEZv_AA4o6oyFDMpubQK9bMUp-YQfsiVtBGLG-yxSHFg9a--QISz5AcVZoZejSZFa8WvqAU-FAB2l61WFkA1qzvQBgs5nia5mBa-OoXCq-4')",
                }}
            >
                <div className="max-w-3xl mx-auto">
                    <h2 className="text-5xl font-bold text-stone-50 mb-4 animate-fadeIn">
                        AI Services
                    </h2>
                    <p className="text-xl text-neutral-200 leading-relaxed animate-fadeIn delay-200">
                        Intelligent solutions engineered for the age of machine learning
                    </p>
                </div>
            </section>

            {/* Services Grid */}
            <section className="max-w-7xl mx-auto py-32 px-4">
                <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-3">
                    {services.map((service) => (
                        <div
                            key={service.id}
                            className={`border-t border-sky-900/50 pt-8 cursor-pointer transition-all duration-300 group ${
                                activeService === service.id
                                    ? "border-blue-500"
                                    : "hover:border-slate-500"
                            }`}
                            onMouseEnter={() => setActiveService(service.id)}
                            onMouseLeave={() => setActiveService(null)}
                        >
                            <div className="text-blue-400 mb-5 group-hover:scale-110 transition-transform inline-block">
                                {service.icon}
                            </div>
                            <h3 className="text-slate-100 text-xl font-semibold mb-3">
                                {service.title}
                            </h3>
                            <p className="text-gray-400 mb-4 text-sm leading-relaxed">
                                {service.description}
                            </p>
                            <ul className="space-y-1">
                                {service.features.map((feature, index) => (
                                    <li
                                        key={index}
                                        className="text-gray-500 text-sm flex items-center gap-2"
                                    >
                                        <span className="w-1 h-1 rounded-full bg-blue-500 flex-shrink-0"></span>
                                        {feature}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </section>

            {/* CTA Section */}
            <section className="bg-gray-900 text-white py-32 text-center">
                <div className="max-w-3xl mx-auto">
                    <h2 className="text-4xl font-bold mb-4 animate-fadeIn">
                        Ready to Build Intelligent Products?
                    </h2>
                    <p className="text-xl text-gray-400 mb-8 animate-fadeIn delay-200">
                        Let's discuss how our AI expertise can drive real outcomes for your business.
                    </p>
                    <p className="text-lg text-gray-300 animate-fadeIn delay-100">
                        Contact is by email. The address is coming.
                    </p>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-sky-950 py-8 text-center">
                <p className="text-gray-400 text-sm">
                    ©️ 2025 Koliath Technology. All rights reserved.
                </p>
            </footer>
        </div>
    )
}

export default ServicesPage
