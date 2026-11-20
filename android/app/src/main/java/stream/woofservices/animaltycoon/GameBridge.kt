package stream.woofservices.animaltycoon

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.net.Uri
import android.webkit.JavascriptInterface
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * The native side of window.woof on Android (see src/renderer/js/android-shim.js). Every call runs off the UI thread
 * and answers through window.__woofResolve, so the game code is identical to the Windows/Mac version.
 */
class GameBridge(private val activity: MainActivity) {
    private val pool = Executors.newFixedThreadPool(3)
    private val ctx get() = activity.applicationContext
    @Volatile private var pollToken: String? = null
    @Volatile private var linkCancelled = false

    private fun base() = JSONObject().put("deviceId", Net.deviceId(ctx)).put("platform", "android").put("appVersion", BuildConfig.VERSION_NAME)
    private fun authed(): JSONObject? = Account.token(ctx)?.let { base().put("token", it) }
    private fun signedOut() = JSONObject().put("ok", false).put("signedOut", true)

    @JavascriptInterface
    fun call(id: String, method: String, argsJson: String?) {
        pool.execute {
            try {
                val result = handle(method, argsJson ?: "null")
                activity.resolve(id, true, result?.toString())
            } catch (e: Exception) {
                activity.resolve(id, false, JSONObject().put("error", e.message ?: "Something went wrong").toString())
            }
        }
    }

    /** The game has registered its update listener: tell it about an update that is already waiting. */
    @JavascriptInterface
    fun ready() { Updater.state?.let { activity.emit("update", it) } }

    private fun handle(method: String, argsJson: String): Any? = when (method) {
        "info" -> JSONObject().put("version", BuildConfig.VERSION_NAME).put("platform", "android")
        "auth.status" -> JSONObject().put("signedIn", Account.token(ctx) != null).put("name", Account.name(ctx) ?: JSONObject.NULL)
        "auth.start" -> {
            val r = Net.post("/api/app/link/start", base().put("app", "tycoon"))
            if (!r.body.optBoolean("ok")) throw IllegalStateException(r.body.optString("error").ifBlank { "Could not reach Woof Services. Check your internet and try again." })
            val url = r.body.getString("url")
            require(url.startsWith(Net.SITE + "/app/link?code="))
            pollToken = r.body.getString("pollToken"); linkCancelled = false
            activity.runOnUiThread { runCatching { activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } }
            JSONObject().put("code", r.body.getString("code")).put("url", url)
        }
        "auth.wait" -> waitForApproval()
        "auth.cancel" -> { linkCancelled = true; pollToken = null; null }
        "auth.signOut" -> {
            Account.token(ctx)?.let { t -> runCatching { Net.post("/api/app/logout", JSONObject().put("token", t).put("deviceId", Net.deviceId(ctx)), 5000) } }
            Account.clear(ctx); null
        }
        "cloud.session" -> {
            val a = authed() ?: return signedOut()
            val r = Net.post("/api/app/tycoon/session", a)
            if (r.status == 401 || r.body.optBoolean("signedOut")) { Account.clear(ctx); signedOut() } else r.body
        }
        "cloud.sync" -> {
            val a = authed() ?: return signedOut()
            val p = JSONObject(argsJson)
            a.put("data", if (p.isNull("data")) JSONObject.NULL else p.get("data"))
                .put("baseRevision", p.optInt("baseRevision", 0)).put("minutes", p.optInt("minutes", 0))
            Net.post("/api/app/tycoon/sync", a).body
        }
        "cloud.claim" -> {
            val a = authed() ?: return JSONObject().put("ok", false)
            Net.post("/api/app/tycoon/claim", a.put("ids", JSONArray(argsJson))).body
        }
        "open" -> {
            val url = JSONArray("[$argsJson]").optString(0)
            if (Regex("^https://(woof-services\\.stream|github\\.com/woof-au)/.*").matches(url))
                activity.runOnUiThread { runCatching { activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } }
            null
        }
        "copy" -> {
            val text = JSONArray("[$argsJson]").optString(0).take(500)
            activity.runOnUiThread { (activity.getSystemService(ClipboardManager::class.java))?.setPrimaryClip(ClipData.newPlainText("Animal Tycoon invite", text)) }
            true
        }
        "update.install" -> {
            activity.runOnUiThread {
                Updater.install(activity)?.let { msg -> activity.emit("update", JSONObject().put("state", "ready").put("message", msg).put("button", "Install")) }
            }
            null
        }
        else -> throw IllegalArgumentException("Unknown request")
    }

    private fun waitForApproval(): JSONObject {
        val token = pollToken ?: return JSONObject().put("status", "expired")
        val deadline = System.currentTimeMillis() + 10 * 60_000
        while (!linkCancelled && System.currentTimeMillis() < deadline && pollToken == token) {
            Thread.sleep(3000)
            if (linkCancelled || pollToken != token) break
            val r = runCatching { Net.post("/api/app/link/poll", JSONObject().put("pollToken", token)) }.getOrNull() ?: continue
            when (r.body.optString("status")) {
                "approved" -> {
                    val name = r.body.optString("name").takeUnless { it.isBlank() || it == "null" }
                    Account.save(ctx, r.body.getString("token"), name)
                    pollToken = null
                    activity.runOnUiThread { activity.bringToFront() }
                    return JSONObject().put("status", "approved").put("name", name ?: JSONObject.NULL)
                }
                "denied", "expired" -> { pollToken = null; return JSONObject().put("status", r.body.optString("status")).put("error", r.body.optString("error")) }
            }
        }
        return JSONObject().put("status", if (linkCancelled) "cancelled" else "expired")
    }

    /** Counts this phone once per installed version (no account needed) so the site's owner stats include Android. */
    fun pingInstall() {
        pool.execute {
            val prefs = ctx.getSharedPreferences("tycoon", 0)
            if (prefs.getString("pinged", null) == BuildConfig.VERSION_NAME) return@execute
            runCatching {
                if (Net.post("/api/app/tycoon/install", base(), 8000).body.optBoolean("ok")) prefs.edit().putString("pinged", BuildConfig.VERSION_NAME).apply()
            }
        }
    }

    fun checkForUpdate() { pool.execute { Updater.checkAndDownload(ctx) { activity.emit("update", it) } } }
}
