import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "path" // <-- import path

// https://vite.dev/config/
export default defineConfig({
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
    server: {
        proxy: {
            "/api": {
                target: "http://localhost:3000",
                changeOrigin: true,
                secure: false,
            },
            "/careers": {
                target: "http://localhost:3000",
                changeOrigin: true,
            },
            "/health": {
                target: "http://localhost:3000",
                changeOrigin: true,
            },
        },
    },
})
