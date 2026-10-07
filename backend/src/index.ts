import { createApp } from "./app"
import { config } from "./config"
import { firebaseCredentialStatus } from "./firebaseCredentials"

const app = createApp()

app.listen(config.port, () => {
    console.log(`Koliath listening on port ${config.port}`)
    const firebaseStatus = firebaseCredentialStatus()
    if (!firebaseStatus.configured) {
        const line = `Firebase Admin is not configured (${firebaseStatus.missing.join(", ")}). Login and protected routes fail closed.`
        if (config.isProd) console.error(line)
        else console.warn(line)
    }
})
