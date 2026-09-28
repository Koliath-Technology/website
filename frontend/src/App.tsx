import { lazy, Suspense } from "react"
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom"
import { isDedicatedAdminHost } from "./lib/adminHost"
import Home, { SiteFooter } from "./components/LandingPage"
import BlogComponent from "./components/Blog"
import Navbar from "./components/Navbar"
import { About } from "./components/About"
import CareersPage from "./components/Careers"
import ServicePage from "./components/ServicePage"
import DiabeticAppPage from "./components/DiabeticAppPage"
import RewardPage from "./components/RewardPage"
import ProductsPage from "./components/ProductsPage"
import ContactPage from "./components/ContactPage"
import LoginPage from "./components/LoginPage"
import DeveloperPortal from "./components/DeveloperPortal"
import { useReferralTracker } from "./hooks/useReferralTracker"

const AdminVerificationPage = lazy(() => import("./components/AdminVerificationPage"))

function RedirectPreserve({ to }: { to: string }) {
    const { search, hash } = useLocation()
    return <Navigate to={{ pathname: to, search, hash }} replace />
}

function AdminConsole() {
    return (
        <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
            <header className="border-b border-[var(--line)] px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                <Link to="/" className="font-display text-xl font-semibold">
                    Koliath admin
                </Link>
                <nav className="flex flex-wrap gap-4 text-sm">
                    <Link to="/" className="hover:underline">
                        Verification
                    </Link>
                    <Link to="/developer" className="hover:underline">
                        Developer
                    </Link>
                    <Link to="/login" className="hover:underline">
                        Sign in
                    </Link>
                </nav>
            </header>
            <Suspense fallback={null}>
                <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/developer" element={<DeveloperPortal />} />
                    <Route path="/admin" element={<Navigate to="/" replace />} />
                    <Route path="/" element={<AdminVerificationPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </Suspense>
        </div>
    )
}

function MarketingSite() {
    useReferralTracker()

    return (
        <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
            <Navbar />
            <main>
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/blog" element={<BlogComponent />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/careers" element={<CareersPage />} />
                    <Route path="/service" element={<ServicePage />} />
                    <Route path="/products" element={<ProductsPage />} />
                    <Route path="/diabetic-app" element={<DiabeticAppPage />} />
                    <Route path="/earn" element={<RewardPage />} />
                    <Route path="/signup" element={<RedirectPreserve to="/login" />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/developer" element={<DeveloperPortal />} />
                    <Route
                        path="/admin"
                        element={
                            import.meta.env.DEV ? (
                                <Suspense fallback={null}>
                                    <AdminVerificationPage />
                                </Suspense>
                            ) : (
                                <Navigate to="/" replace />
                            )
                        }
                    />
                    <Route path="/contact" element={<ContactPage />} />
                    <Route path="/reward" element={<RedirectPreserve to="/earn" />} />
                    <Route path="/rewards" element={<RedirectPreserve to="/earn" />} />
                    <Route path="/referrals" element={<RedirectPreserve to="/earn" />} />
                    <Route path="*" element={<Home />} />
                </Routes>
            </main>
            <SiteFooter />
        </div>
    )
}

const App: React.FC = () => {
    if (isDedicatedAdminHost()) return <AdminConsole />
    return <MarketingSite />
}

export default App
