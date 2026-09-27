import React, { useState } from "react"
import { ArrowRight, Calendar, Clock } from "lucide-react"

interface Blog {
    id: number
    title: string
    content: string
    date: string
    readTime: string
    image: string
}

const AppleBlog: React.FC = () => {
    const [selectedBlog, setSelectedBlog] = useState(0)

    const blogs: Blog[] = [
        {
            id: 1,
            title: "The Future of Generative AI in Enterprise Products",
            content: `Generative AI is no longer just a buzzword—it's a foundational technology that is reshaping how we build and interact with enterprise software. At Koliath Technology, we're seeing a massive shift from traditional rule-based systems to intelligent, context-aware applications.

By integrating Large Language Models (LLMs) directly into core business workflows, organizations are unlocking unprecedented efficiency. From automated customer support agents that actually understand nuance, to intelligent data analysis tools that can query databases in natural language, the possibilities are vast.

However, the real challenge lies not in the AI models themselves, but in the integration. How do you ensure data privacy? How do you prevent hallucinations? How do you maintain a seamless user experience?

We believe the answer is a product-first approach to AI. It's not about bolting on a chatbot; it's about deeply understanding the user's problem and using AI as a tool to solve it more elegantly than ever before.

As we look to the future, the companies that will win are those that seamlessly blend human creativity with machine intelligence. We're excited to be at the forefront of this revolution, helping our partners build the next generation of AI-native products.`,
            date: "October 15, 2025",
            readTime: "5 min read",
            image: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1200&h=600&fit=crop",
        },
        {
            id: 2,
            title: "Scaling Machine Learning Architectures for the Modern Web",
            content: `Building a proof-of-concept machine learning model is one thing; deploying it to serve millions of users in real-time is an entirely different beast. As AI products move from the lab to production, architectural decisions become critical.

One of the biggest hurdles we face is latency. When a user interacts with an AI feature, they expect the same sub-second response times they get from traditional web apps. Achieving this requires a delicate balance of model optimization, edge computing, and efficient caching strategies.

We've found that moving inference closer to the user—whether through edge functions or on-device processing—can drastically improve the user experience. Additionally, techniques like model quantization and pruning are essential for reducing the computational footprint without sacrificing too much accuracy.

Another key consideration is the data pipeline. Real-time AI products need real-time data. Building robust, event-driven architectures ensures that our models are always acting on the most up-to-date information.

The journey from a Jupyter notebook to a scalable, production-ready AI product is complex, but with the right architecture, it's incredibly rewarding. At Koliath Technology, we're continuously refining our approach to ensure our clients' AI solutions are as robust as they are intelligent.`,
            date: "September 28, 2025",
            readTime: "6 min read",
            image: "https://images.unsplash.com/photo-1555949963-aa79dcee981c?w=1200&h=600&fit=crop",
        },
    ]

    const currentBlog = blogs[selectedBlog]

    return (
        <div className="min-h-screen bg-white">
            {/* Header */}
            <header className="border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-6 py-4">
                    <h1 className="text-2xl font-semibold text-gray-900">
                        Company Blog
                    </h1>
                </div>
            </header>

            <div className="max-w-7xl mx-auto px-6 py-12">
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-12">
                    {/* Sidebar */}
                    <aside className="lg:col-span-1">
                        <div className="lg:sticky lg:top-8 space-y-2">
                            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">
                                Recent Posts
                            </h2>
                            {blogs.map((blog, index) => (
                                <button
                                    key={blog.id}
                                    onClick={() => setSelectedBlog(index)}
                                    className={`w-full text-left py-3 px-4 border-l-2 transition-all duration-200 group ${
                                        selectedBlog === index
                                            ? "border-blue-600 text-blue-600 bg-blue-50/50"
                                            : "border-transparent hover:border-gray-200 text-gray-900"
                                    }`}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <h3
                                                className={`font-medium mb-1 line-clamp-2 ${
                                                    selectedBlog === index
                                                        ? "text-blue-900"
                                                        : "text-gray-900"
                                                }`}
                                            >
                                                {blog.title}
                                            </h3>
                                            <p
                                                className={`text-sm ${
                                                    selectedBlog === index
                                                        ? "text-blue-600/80"
                                                        : "text-gray-800"
                                                }`}
                                            >
                                                {blog.date}
                                            </p>
                                        </div>
                                        <ArrowRight
                                            className={`w-5 h-5 ml-2 transition-transform group-hover:translate-x-1 flex-shrink-0 ${
                                                selectedBlog === index
                                                    ? "text-blue-600"
                                                    : "text-gray-800"
                                            }`}
                                        />
                                    </div>
                                </button>
                            ))}
                        </div>
                    </aside>

                    {/* Main Content */}
                    <main className="lg:col-span-3">
                        <article className="animate-fadeIn">
                            {/* Hero Image */}
                            <div className="relative w-full h-96 mb-8 rounded-2xl overflow-hidden bg-gray-100">
                                <img
                                    src={currentBlog.image}
                                    alt={currentBlog.title}
                                    className="w-full h-full object-cover transition-transform duration-700 hover:scale-105"
                                />
                            </div>

                            {/* Meta Information */}
                            <div className="flex items-center space-x-6 text-sm text-gray-800 mb-6">
                                <span className="flex items-center">
                                    <Calendar className="w-4 h-4 mr-2" />
                                    {currentBlog.date}
                                </span>
                                <span className="flex items-center">
                                    <Clock className="w-4 h-4 mr-2" />
                                    {currentBlog.readTime}
                                </span>
                            </div>

                            {/* Title */}
                            <h1 className="text-4xl md:text-5xl font-semibold text-gray-900 mb-8 leading-tight">
                                {currentBlog.title}
                            </h1>

                            {/* Content */}
                            <div className="prose prose-lg max-w-none">
                                {currentBlog.content
                                    .split("\n\n")
                                    .map((paragraph, index) => (
                                        <p
                                            key={index}
                                            className="text-gray-900 leading-relaxed mb-6 text-lg"
                                            style={{
                                                animationDelay: `${
                                                    index * 100
                                                }ms`,
                                            }}
                                        >
                                            {paragraph}
                                        </p>
                                    ))}
                            </div>

                            {/* Divider */}
                            <div className="mt-12 pt-12 border-t border-gray-200">
                                <div className="flex items-center justify-between">
                                    <button
                                        disabled={selectedBlog === 0}
                                        onClick={() =>
                                            setSelectedBlog(selectedBlog - 1)
                                        }
                                        className="flex items-center text-gray-900 transition disabled:opacity-30 disabled:cursor-not-allowed group"
                                    >
                                        <ArrowRight className="w-5 h-5 mr-2 rotate-180 transition-transform group-hover:-translate-x-1" />
                                        <span className="font-medium">
                                            Previous
                                        </span>
                                    </button>
                                    <button
                                        disabled={
                                            selectedBlog === blogs.length - 1
                                        }
                                        onClick={() =>
                                            setSelectedBlog(selectedBlog + 1)
                                        }
                                        className="flex items-center text-gray-900 transition disabled:opacity-30 disabled:cursor-not-allowed group"
                                    >
                                        <span className="font-medium">
                                            Next
                                        </span>
                                        <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
                                    </button>
                                </div>
                            </div>
                        </article>
                    </main>
                </div>
            </div>

            <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out;
        }
      `}</style>
        </div>
    )
}

export default AppleBlog
