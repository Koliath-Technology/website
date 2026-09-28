package in.koliath.install.example

import android.content.Context
import java.util.UUID
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Sample only. This class has no Koliath API secret.
 * It reports the store referrer token to the developer's own backend.
 * That backend calls Koliath verify. See examples/sdk/verify-server.ts.
 *
 * installation_id and device_key are UUIDs created by the app. Do not send
 * IMEI, MAC, ANDROID_ID, or the advertising id.
 */
class AndroidInstallReporter(
    private val context: Context,
    private val developerBackendUrl: String,
) {
    fun installationId(): String = stored("koliath_installation_id")

    fun deviceKey(): String = stored("koliath_device_key")

    fun report(verificationToken: String, appId: String) {
        val payload = JSONObject()
            .put("verificationToken", verificationToken)
            .put("appId", appId)
            .put("installationId", installationId())
            .put("deviceKey", deviceKey())
            .put("platform", "android")
        val connection = URL(developerBackendUrl).openConnection() as HttpURLConnection
        connection.requestMethod = "POST"
        connection.setRequestProperty("Content-Type", "application/json")
        connection.doOutput = true
        connection.outputStream.use { it.write(payload.toString().toByteArray()) }
        connection.inputStream.use { it.readBytes() }
        connection.disconnect()
    }

    /**
     * Play Install Referrer values set by koliath.in:
     * koliath_verification_token and koliath_app_id.
     * Parse the referrer string, then call [report]. Do not call Koliath directly.
     */
    fun tokenFromReferrer(referrer: String): Pair<String, String>? {
        val params = referrer.split("&").mapNotNull { part ->
            val pieces = part.split("=", limit = 2)
            if (pieces.size == 2) pieces[0] to java.net.URLDecoder.decode(pieces[1], "UTF-8") else null
        }.toMap()
        val token = params["koliath_verification_token"] ?: return null
        val appId = params["koliath_app_id"] ?: return null
        return token to appId
    }

    private fun stored(name: String): String {
        val prefs = context.getSharedPreferences("koliath_install", Context.MODE_PRIVATE)
        val existing = prefs.getString(name, null)
        if (existing != null) return existing
        val created = UUID.randomUUID().toString()
        prefs.edit().putString(name, created).apply()
        return created
    }
}
