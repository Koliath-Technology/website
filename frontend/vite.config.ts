import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "path"

const SECRET_VITE_NAME = /(SECRET|PASSWORD|PRIVATE|DATABASE|WEBHOOK|TOKEN|CREDENTIAL)/i

function clientEnvNames(mode: string): string[] {
    const fromFiles = loadEnv(mode, process.cwd(), "VITE_")
    const names = new Set<string>(Object.keys(fromFiles))
    for (const key of Object.keys(process.env)) {
        if (key.startsWith("VITE_")) names.add(key)
    }
    return [...names]
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
    const blocked = clientEnvNames(mode).filter((key) => SECRET_VITE_NAME.test(key))
    if (blocked.length > 0) {
        throw new Error(
            `Refusing to expose secret-like variables to the client bundle: ${blocked.join(", ")}. ` +
                "Only public values such as VITE_FIREBASE_API_KEY belong in VITE_ variables."
        )
    }

    return {
        appType: "spa",
        plugins: [
            react({
                babel: {
                    plugins: [["babel-plugin-react-compiler"]],
                },
            }),
            tailwindcss(),
        ],
        resolve: {
            alias: {
                "@": path.resolve(process.cwd(), "src"),
            },
        },
        build: {
            modulePreload: {
                resolveDependencies(_filename, deps) {
                    return deps.filter((dep) => !dep.includes("/assets/admin/"))
                },
            },
            rollupOptions: {
                output: {
                    // Async admin page chunk only. Do not use manualChunks here:
                    // that pulled shared runtime into this file and made the
                    // marketing bundle import it. The API serves this prefix
                    // only for Host admin.koliath.in.
                    chunkFileNames(chunkInfo) {
                        const facade = chunkInfo.facadeModuleId?.replaceAll("\\", "/") ?? ""
                        if (facade.includes("/AdminVerificationPage")) {
                            return "assets/admin/[name]-[hash].js"
                        }
                        return "assets/[name]-[hash].js"
                    },
                },
            },
        },
        server: {
            allowedHosts: ["admin.localhost"],
            proxy: {
                "/api": {
                    target: "http://localhost:3000",
                    // Preserve Host so admin.localhost is the admin console and
                    // localhost stays the marketing site.
                    changeOrigin: false,
                    secure: false,
                },
                "/careers": {
                    target: "http://localhost:3000",
                    changeOrigin: true,
                    // GET /careers is the brochure page. Only the application POST goes to the API.
                    bypass(req) {
                        if (req.method !== "POST") return "/index.html"
                    },
                },
                "/health": {
                    target: "http://localhost:3000",
                    changeOrigin: true,
                },
            },
        },
    }
})
