package stream.woofservices.animaltycoon

import android.content.Context
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

/** Talks to woof-services.stream the same way the desktop app does (no browser Origin header). */
object Net {
    const val SITE = "https://woof-services.stream"
    private val UA get() = "AnimalTycoonAndroid/${BuildConfig.VERSION_NAME}"

    fun deviceId(ctx: Context): String {
        val prefs = ctx.getSharedPreferences("tycoon", Context.MODE_PRIVATE)
        return prefs.getString("device-id", null) ?: UUID.randomUUID().toString().also { prefs.edit().putString("device-id", it).apply() }
    }

    class Response(val status: Int, val body: JSONObject)

    /** POST JSON to an /api/app/ endpoint. Returns the HTTP status and the JSON body (never throws on 4xx). */
    fun post(path: String, body: JSONObject, timeoutMs: Int = 15000): Response {
        require(path.startsWith("/api/app/"))
        val c = URL(SITE + path).openConnection() as HttpURLConnection
        c.requestMethod = "POST"; c.doOutput = true; c.instanceFollowRedirects = false
        c.connectTimeout = timeoutMs; c.readTimeout = timeoutMs
        c.setRequestProperty("Content-Type", "application/json")
        c.setRequestProperty("User-Agent", UA)
        try {
            c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val code = c.responseCode
            val stream = if (code in 200..299) c.inputStream else c.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() } ?: ""
            check(text.length <= 200_000) { "Response too large" }
            val json = runCatching { JSONObject(text) }.getOrElse { JSONObject() }
            return Response(code, json)
        } finally { c.disconnect() }
    }

    fun getText(url: String, timeoutMs: Int = 15000): String {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = timeoutMs; c.readTimeout = timeoutMs
        c.instanceFollowRedirects = true
        c.setRequestProperty("Accept", "application/vnd.github+json")
        c.setRequestProperty("User-Agent", UA)
        try {
            if (c.responseCode !in 200..299) throw IllegalStateException("HTTP ${c.responseCode}")
            return c.inputStream.bufferedReader().use { it.readText() }
        } finally { c.disconnect() }
    }
}

/** Compare "1.2.3" style versions. */
fun cmpVersion(a: String, b: String): Int {
    val x = a.split(".").map { it.toIntOrNull() ?: 0 }
    val y = b.split(".").map { it.toIntOrNull() ?: 0 }
    for (i in 0 until 3) {
        val p = x.getOrElse(i) { 0 }
        val q = y.getOrElse(i) { 0 }
        if (p != q) return p.compareTo(q)
    }
    return 0
}
