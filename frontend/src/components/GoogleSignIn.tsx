import { Loader2 } from "lucide-react"
import { useState } from "react"
import { useAuth } from "../lib/auth"

/**
 * Google sign-in through Firebase Auth. The Login path stays visible when the
 * public web config is missing; the button calls Firebase only after that
 * config is present at build time.
 */
export function GoogleSignIn() {
    const { user, loading, configured, signInWithGoogle } = useAuth()
    const [authError, setAuthError] = useState<string | null>(null)

    if (user) return null

    if (!configured) {
        return (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 max-w-md">
                Login with Google uses Firebase Auth. This build is missing the public web
                config (<code className="font-mono">VITE_FIREBASE_API_KEY</code>,{" "}
                <code className="font-mono">VITE_FIREBASE_AUTH_DOMAIN</code>,{" "}
                <code className="font-mono">VITE_FIREBASE_PROJECT_ID</code>,{" "}
                <code className="font-mono">VITE_FIREBASE_APP_ID</code>). Rebuild after setting
                those. Do not put a service-account private key in a{" "}
                <code className="font-mono">VITE_</code> variable.
            </p>
        )
    }

    if (loading) {
        return <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
    }

    return (
        <div className="flex flex-col items-center gap-3">
            <button
                type="button"
                onClick={() => {
                    setAuthError(null)
                    void signInWithGoogle().catch((error: unknown) => {
                        setAuthError(error instanceof Error ? error.message : "Sign-in failed")
                    })
                }}
                className="inline-flex items-center rounded-full bg-[var(--ink)] text-white px-6 py-3 text-sm hover:opacity-90"
            >
                Continue with Google
            </button>
            {authError && <p className="text-sm text-red-600">{authError}</p>}
        </div>
    )
}
