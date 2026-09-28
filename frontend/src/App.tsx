import { Navigate, Route, Routes, useLocation } from "react-router-dom"
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
import AdminVerificationPage from "./components/AdminVerificationPage"
import { useReferralTracker } from "./hooks/useReferralTracker"

function RedirectPreserve({ to }: { to: string }) {
    const { search, hash } = useLocation()
    return <Navigate to={{ pathname: to, search, hash }} replace />
}

const App: React.FC = () => {
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
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/developer" element={<DeveloperPortal />} />
                    <Route path="/admin" element={<AdminVerificationPage />} />
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

export default App
