import { initializeApp, type FirebaseApp } from "firebase/app"
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth"

function publicEnv(name: string): string {
    const value = import.meta.env[name] as string | undefined
    return value?.trim() ?? ""
}

const apiKey = publicEnv("VITE_FIREBASE_API_KEY")
const authDomain = publicEnv("VITE_FIREBASE_AUTH_DOMAIN")
const projectId = publicEnv("VITE_FIREBASE_PROJECT_ID")
const appId = publicEnv("VITE_FIREBASE_APP_ID")
const messagingSenderId = publicEnv("VITE_FIREBASE_MESSAGING_SENDER_ID")
const storageBucket = publicEnv("VITE_FIREBASE_STORAGE_BUCKET")

/** Public web config only. Service-account keys must never use a VITE_ name. */
export const firebaseConfigured = Boolean(apiKey && authDomain && projectId && appId)

let firebaseApp: FirebaseApp | null = null
let firebaseAuth: Auth | null = null

export function getFirebaseAuth(): Auth | null {
    if (!firebaseConfigured) return null
    if (!firebaseAuth) {
        firebaseApp = initializeApp({
            apiKey,
            authDomain,
            projectId,
            appId,
            ...(messagingSenderId ? { messagingSenderId } : {}),
            ...(storageBucket ? { storageBucket } : {}),
        })
        firebaseAuth = getAuth(firebaseApp)
    }
    return firebaseAuth
}

export const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: "select_account" })
