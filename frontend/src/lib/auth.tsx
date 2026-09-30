import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from "firebase/auth"
import { CSRF_COOKIE_NAME, exchangeGoogleToken, fetchMe, logoutSession, type DashboardUser } from "./api"
import { readStoredAttribution } from "../hooks/useReferralTracker"
import { firebaseConfigured, getFirebaseAuth, googleProvider } from "./firebase"

/** Removed on boot. ID tokens are no longer stored in localStorage by this app. */
const LEGACY_TOKEN_KEY = "koliath_google_id_token"

interface AuthContextValue {
    user: DashboardUser | null
    loading: boolean
    configured: boolean
    signInWithGoogle: () => Promise<void>
    signOut: () => void
    refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function hasSessionCookie(): boolean {
    return document.cookie.split("; ").some((part) => part.startsWith(`${CSRF_COOKIE_NAME}=`))
}

function AuthInner({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<DashboardUser | null>(null)
    const [loading, setLoading] = useState(true)

    const refresh = useCallback(async () => {
        const firebaseAuth = getFirebaseAuth()
        if (firebaseAuth?.currentUser) {
            try {
                const token = await firebaseAuth.currentUser.getIdToken()
                setUser(await exchangeGoogleToken(token, readStoredAttribution()))
                return
            } catch {
                setUser(null)
                return
            } finally {
                setLoading(false)
            }
        }
        if (!hasSessionCookie()) {
            setUser(null)
            setLoading(false)
            return
        }
        try {
            setUser(await fetchMe())
        } catch {
            setUser(null)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        localStorage.removeItem(LEGACY_TOKEN_KEY)
        const firebaseAuth = getFirebaseAuth()
        if (!firebaseAuth) {
            void refresh()
            return
        }
        const unsubscribe = onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
            if (!firebaseUser) {
                setUser(null)
                setLoading(false)
                return
            }
            try {
                const token = await firebaseUser.getIdToken()
                setUser(await exchangeGoogleToken(token, readStoredAttribution()))
            } catch {
                setUser(null)
            } finally {
                setLoading(false)
            }
        })
        return () => unsubscribe()
    }, [refresh])

    const signInWithGoogle = useCallback(async () => {
        const firebaseAuth = getFirebaseAuth()
        if (!firebaseAuth) {
            throw new Error("Firebase Auth is not configured")
        }
        setLoading(true)
        try {
            const result = await signInWithPopup(firebaseAuth, googleProvider)
            const token = await result.user.getIdToken()
            setUser(await exchangeGoogleToken(token, readStoredAttribution()))
        } finally {
            setLoading(false)
        }
    }, [])

    const signOut = useCallback(() => {
        const firebaseAuth = getFirebaseAuth()
        if (firebaseAuth) {
            void firebaseSignOut(firebaseAuth).catch(() => undefined)
        }
        localStorage.removeItem(LEGACY_TOKEN_KEY)
        void logoutSession().catch(() => undefined)
        setUser(null)
    }, [])

    const value = useMemo<AuthContextValue>(
        () => ({
            user,
            loading,
            configured: firebaseConfigured,
            signInWithGoogle,
            signOut,
            refresh,
        }),
        [user, loading, signInWithGoogle, signOut, refresh]
    )

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    return <AuthInner>{children}</AuthInner>
}

export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error("useAuth must be used within AuthProvider")
    return ctx
}
