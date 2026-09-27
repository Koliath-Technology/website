export const About: React.FC = () => (
    <div className="min-h-screen bg-white">
        <div className="max-w-5xl mx-auto px-6 py-20">
            {/* Hero Section */}
            <div className="text-center mb-20">
                <h1 className="text-5xl md:text-6xl font-semibold text-gray-900 mb-6 leading-tight">
                    We build AI that makes a difference
                </h1>
                <p className="text-xl text-gray-900 max-w-3xl mx-auto leading-relaxed">
                    Founded in 2020, Koliath Technology is an AI product studio
                    at the frontier of machine intelligence—turning complex data
                    into products that transform industries and improve lives.
                </p>
            </div>

            {/* Mission Section */}
            <div className="mb-20">
                <div className="grid md:grid-cols-2 gap-16 items-center">
                    <div>
                        <h2 className="text-3xl font-semibold text-gray-900 mb-6">
                            Our Mission
                        </h2>
                        <p className="text-gray-900 leading-relaxed mb-4">
                            We believe artificial intelligence should be
                            accessible, trustworthy, and genuinely useful. Our
                            mission is to architect and deliver AI-native
                            products that solve real problems for real people.
                        </p>
                        <p className="text-gray-900 leading-relaxed">
                            Every day, we bridge the gap between cutting-edge
                            research and production-ready software—ensuring the
                            most advanced ML techniques translate into tangible
                            business outcomes.
                        </p>
                    </div>
                    <div className="h-96 bg-gray-100 rounded-2xl overflow-hidden">
                        <img
                            src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&h=600&fit=crop"
                            alt="Team collaboration"
                            className="w-full h-full object-cover hover:scale-105 transition-transform duration-700"
                        />
                    </div>
                </div>
            </div>

            {/* Values Section */}
            <div className="mb-20">
                <h2 className="text-3xl font-semibold text-gray-900 mb-12 text-center">
                    Our Values
                </h2>
                <div className="grid md:grid-cols-3 gap-10">
                    <div className="border-l-2 border-blue-200 hover:border-blue-500 pl-6 py-2 transition-colors duration-300">
                        <h3 className="text-xl font-semibold text-gray-900 mb-3">
                            Research-Driven
                        </h3>
                        <p className="text-gray-900 leading-relaxed">
                            We ground every product decision in peer-reviewed ML
                            research, turning the latest academic breakthroughs
                            into practical, deployable solutions.
                        </p>
                    </div>

                    <div className="border-l-2 border-blue-200 hover:border-blue-500 pl-6 py-2 transition-colors duration-300">
                        <h3 className="text-xl font-semibold text-gray-900 mb-3">
                            Human-Centered AI
                        </h3>
                        <p className="text-gray-900 leading-relaxed">
                            Great AI is invisible. We design intelligent systems
                            that feel natural and intuitive, amplifying human
                            capability without adding complexity.
                        </p>
                    </div>

                    <div className="border-l-2 border-blue-200 hover:border-blue-500 pl-6 py-2 transition-colors duration-300">
                        <h3 className="text-xl font-semibold text-gray-900 mb-3">
                            Relentless Quality
                        </h3>
                        <p className="text-gray-900 leading-relaxed">
                            From model accuracy to API latency, we hold our
                            engineering to the highest standards—because in AI,
                            small improvements compound into massive impact.
                        </p>
                    </div>
                </div>
            </div>

            {/* Team Section */}
            <div className="mb-20">
                <div className="grid md:grid-cols-2 gap-16 items-center">
                    <div className="h-96 bg-gray-100 rounded-2xl overflow-hidden order-2 md:order-1">
                        <img
                            src="https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&h=600&fit=crop"
                            alt="Modern office"
                            className="w-full h-full object-cover hover:scale-105 transition-transform duration-700"
                        />
                    </div>
                    <div className="order-1 md:order-2">
                        <h2 className="text-3xl font-semibold text-gray-900 mb-6">
                            Our Team
                        </h2>
                        <p className="text-gray-900 leading-relaxed mb-4">
                            We are ML engineers, data scientists, and product
                            designers united by a single mission: making AI
                            genuinely useful for the people who use it.
                        </p>
                        <p className="text-gray-900 leading-relaxed mb-4">
                            Our team brings experience from leading research
                            labs, Fortune 500 engineering organizations, and
                            high-growth startups—giving us a rare blend of
                            theoretical depth and practical execution.
                        </p>
                        <p className="text-gray-900 leading-relaxed">
                            We operate with radical transparency and a bias for
                            action. Good ideas win, regardless of where they
                            come from.
                        </p>
                    </div>
                </div>
            </div>

            {/* Stats Section */}
            <div className="bg-black text-white rounded-3xl p-12 mb-20">
                <div className="grid md:grid-cols-4 gap-8 text-center">
                    <div>
                        <div className="text-4xl font-bold mb-2">20+</div>
                        <div className="text-gray-400">AI Products Shipped</div>
                    </div>
                    <div>
                        <div className="text-4xl font-bold mb-2">50M+</div>
                        <div className="text-gray-400">Model Predictions Served</div>
                    </div>
                    <div>
                        <div className="text-4xl font-bold mb-2">15+</div>
                        <div className="text-gray-400">ML Models in Production</div>
                    </div>
                    <div>
                        <div className="text-4xl font-bold mb-2">99%</div>
                        <div className="text-gray-400">Client Satisfaction</div>
                    </div>
                </div>
            </div>

            {/* CTA Section */}
            <div className="text-center">
                <h2 className="text-3xl font-semibold text-gray-900 mb-6">
                    Want to work with us?
                </h2>
                <p className="text-gray-900 mb-8 max-w-2xl mx-auto">
                    We're always looking for talented individuals who share our
                    passion for innovation and excellence.
                </p>
                <button className="px-8 py-4 bg-black text-white rounded-full font-semibold hover:bg-gray-800 transition-all hover:scale-105">
                    Join Our Team
                </button>
            </div>
        </div>
    </div>
)
