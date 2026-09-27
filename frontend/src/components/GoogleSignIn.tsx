import { GoogleLogin } from "@react-oauth/google"
import { Loader2 } from "lucide-react"
import { useState } from "react"
import { useAuth } from "../lib/auth"

/**
 * Google Sign-In button. The control stays in the tree when the client id is
 * missing so Login is still a visible path; the button itself needs the public
 * OAuth client id at build time.
 */
export function GoogleSignIn() {
    const { user, loading, configured, signInWithCredential } = useAuth()
    const [authError, setAuthError] = useState<string | null>(null)

    if (user) return null

    if (!configured) {
        return (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 max-w-md">
                Login with Google is not turned on for this build. Set the public{" "}
                <code className="font-mono">VITE_GOOGLE_CLIENT_ID</code> (same value as the
                server <code className="font-mono">GOOGLE_CLIENT_ID</code>) and rebuild. Do not
                put a client secret in a <code className="font-mono">VITE_</code> variable.
            </p>
        )
    }

    if (loading) {
        return <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
    }

    return (
        <div className="flex flex-col items-center gap-3">
            <div className="rounded-2xl overflow-hidden shadow-lg">
                <GoogleLogin
                    onSuccess={async (res) => {
                        if (!res.credential) return
                        setAuthError(null)
                        try {
                            await signInWithCredential(res.credential)
                        } catch (e) {
                            setAuthError(e instanceof Error ? e.message : "Sign-in failed")
                        }
                    }}
                    onError={() => setAuthError("Google Sign-In failed")}
                    theme="filled_black"
                    shape="pill"
                    size="large"
                    text="continue_with"
                    useOneTap={false}
                />
            </div>
            {authError && <p className="text-sm text-red-600">{authError}</p>}
        </div>
    )
}
