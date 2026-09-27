import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { GoogleOAuthProvider, googleLogout } from "@react-oauth/google"
import { exchangeGoogleToken, fetchMe, logoutSession, type DashboardUser } from "./api"

/** Removed on boot. Google ID tokens are no longer stored in localStorage. */
const LEGACY_TOKEN_KEY = "koliath_google_id_token"
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

interface AuthContextValue {
    user: DashboardUser | null
    loading: boolean
    configured: boolean
    signInWithCredential: (credential: string) => Promise<void>
    signOut: () => void
    refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function AuthInner({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<DashboardUser | null>(null)
    const [loading, setLoading] = useState(true)

    const refresh = useCallback(async () => {
        // The session cookie is httpOnly. The CSRF cookie is set with it and is
        // readable, so anonymous visits do not call /api/me and get a 401.
        const hasSession = document.cookie.split("; ").some((part) => part.startsWith("koliath_csrf="))
        if (!hasSession) {
            setUser(null)
            setLoading(false)
            return
        }
        try {
            const me = await fetchMe()
            setUser(me)
        } catch {
            setUser(null)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        localStorage.removeItem(LEGACY_TOKEN_KEY)
        void refresh()
    }, [refresh])

    const signInWithCredential = useCallback(async (credential: string) => {
        setLoading(true)
        try {
            const dashboard = await exchangeGoogleToken(credential)
            setUser(dashboard)
        } finally {
            setLoading(false)
        }
    }, [])

    const signOut = useCallback(() => {
        if (CLIENT_ID) {
            try {
                googleLogout()
            } catch {
                /* GIS may be unavailable when the client id was not baked in. */
            }
        }
        localStorage.removeItem(LEGACY_TOKEN_KEY)
        void logoutSession().catch(() => undefined)
        setUser(null)
    }, [])

    const value = useMemo<AuthContextValue>(
        () => ({
            user,
            loading,
            configured: Boolean(CLIENT_ID),
            signInWithCredential,
            signOut,
            refresh,
        }),
        [user, loading, signInWithCredential, signOut, refresh]
    )

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    if (!CLIENT_ID) {
        return <AuthInner>{children}</AuthInner>
    }

    return (
        <GoogleOAuthProvider clientId={CLIENT_ID}>
            <AuthInner>{children}</AuthInner>
        </GoogleOAuthProvider>
    )
}

export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error("useAuth must be used within AuthProvider")
    return ctx
}
