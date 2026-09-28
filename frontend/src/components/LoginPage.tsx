import { Link } from "react-router-dom"
import { LogOut } from "lucide-react"
import { GoogleSignIn } from "./GoogleSignIn"
import { Button } from "./ui/button"
import { isDedicatedAdminHost } from "../lib/adminHost"
import { useAuth } from "../lib/auth"

export default function LoginPage() {
    const { user, signOut } = useAuth()
    const adminHost = isDedicatedAdminHost()

    return (
        <div className="min-h-screen pt-28 px-6 pb-24">
            <div className="max-w-lg mx-auto rounded-[2rem] border border-[var(--line)] bg-white/80 p-8 md:p-10 shadow-[0_20px_60px_-30px_rgba(15,40,35,0.35)]">
                <p className="text-sm tracking-[0.2em] uppercase text-[var(--accent)] mb-3">Account</p>
                <h1 className="font-display text-4xl font-semibold tracking-tight mb-3">Login</h1>
                <p className="text-[var(--muted)] leading-relaxed mb-8">
                    {adminHost
                        ? "Sign in with a Google account listed in ADMIN_GOOGLE_SUBS. An empty list still denies everyone."
                        : "Sign in with Google to open your Koliath account, referral code, and Earn balance. The same account links Sapient, Adverts, and Diabetic Buddy."}
                </p>

                {user ? (
                    <div className="space-y-4">
                        <p className="text-sm">
                            Signed in as <span className="font-medium">{user.displayName}</span>
                            <span className="block text-[var(--muted)]">{user.email}</span>
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <Link
                                to={adminHost ? "/" : "/earn"}
                                className="inline-flex items-center rounded-full bg-[var(--ink)] text-white px-5 py-2.5 text-sm hover:opacity-90"
                            >
                                {adminHost ? "Open admin" : "Open Earn"}
                            </Link>
                            <Button variant="outline" className="rounded-full" onClick={signOut}>
                                <LogOut className="w-4 h-4 mr-2" />
                                Sign out
                            </Button>
                        </div>
                    </div>
                ) : (
                    <GoogleSignIn />
                )}
            </div>
        </div>
    )
}
