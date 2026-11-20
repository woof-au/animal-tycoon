package stream.woofservices.animaltycoon

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.provider.Settings
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Animal Tycoon for Android updates itself from the newest Animal Tycoon release on GitHub — the same release that
 * carries the Windows and Mac versions. Updates are forced: at launch the game checks before anything else and, if
 * there is a new version, downloads it (checked against the .sha256 next to it) and installs it straight away. While
 * playing, new versions are checked every 10 minutes and installed after the game has saved.
 * Android itself asks the player to confirm the very first self-update (and to allow "install unknown apps" once);
 * on Android 12+ later updates install silently.
 */
object Updater {
    private const val API = "https://api.github.com/repos/woof-au/animal-tycoon/releases/latest"
    private const val DL = "https://github.com/woof-au/animal-tycoon/releases/download/"
    private const val APK = "Animal-Tycoon-Android.apk"

    class Available(val version: String, val apkUrl: String, val shaUrl: String, val size: Long)

    @Volatile var state: JSONObject? = null
        private set
    @Volatile private var staged: File? = null
    @Volatile private var busy = false

    /** Is there a newer version? Quick (one small GitHub request). Null when up to date or offline. */
    fun check(): Available? = try {
        val release = JSONObject(Net.getText(API, 6000))
        val version = release.optString("tag_name").removePrefix("v")
        if (release.optBoolean("draft") || release.optBoolean("prerelease") ||
            !version.matches(Regex("^[0-9]+\\.[0-9]+\\.[0-9]+$")) || cmpVersion(version, BuildConfig.VERSION_NAME) <= 0) null
        else {
            val assets = release.getJSONArray("assets")
            var apkUrl = ""; var shaUrl = ""; var size = 0L
            for (i in 0 until assets.length()) {
                val a = assets.getJSONObject(i)
                when (a.getString("name")) {
                    APK -> { apkUrl = a.getString("browser_download_url"); size = a.optLong("size", 0) }
                    "$APK.sha256" -> shaUrl = a.getString("browser_download_url")
                }
            }
            if (!apkUrl.startsWith(DL) || !shaUrl.startsWith(DL) || size <= 0 || size > 300L * 1024 * 1024) null
            else Available(version, apkUrl, shaUrl, size)
        }
    } catch (_: Exception) { null }

    /** Download and verify. Reports progress; returns true when the update is ready to install. Off the UI thread. */
    fun download(ctx: Context, a: Available, emit: (JSONObject) -> Unit): Boolean {
        if (busy) return false
        if (staged != null) return true
        busy = true
        try {
            val expected = Net.getText(a.shaUrl).trim().split(Regex("\\s+")).first().lowercase()
            if (!expected.matches(Regex("^[a-f0-9]{64}$"))) return false
            val file = File(ctx.cacheDir, "update-${a.version}.apk")
            val digest = MessageDigest.getInstance("SHA-256")
            var got = 0L; var shown = -1
            emit(JSONObject().put("state", "downloading").put("version", a.version).put("percent", 0))
            val c = URL(a.apkUrl).openConnection() as HttpURLConnection
            c.instanceFollowRedirects = true; c.connectTimeout = 15000; c.readTimeout = 30000
            try {
                c.inputStream.use { input ->
                    file.outputStream().use { out ->
                        val buf = ByteArray(128 * 1024)
                        while (true) {
                            val n = input.read(buf); if (n < 0) break
                            got += n; if (got > a.size) throw IllegalStateException("too large")
                            digest.update(buf, 0, n); out.write(buf, 0, n)
                            val pct = (got * 100 / a.size).toInt()
                            if (pct != shown) { shown = pct; emit(JSONObject().put("state", "downloading").put("version", a.version).put("percent", pct)) }
                        }
                    }
                }
            } catch (e: Exception) { file.delete(); return false } finally { c.disconnect() }
            val hex = digest.digest().joinToString("") { "%02x".format(it) }
            if (got != a.size || hex != expected) { file.delete(); return false }
            staged = file
            state = JSONObject().put("state", "ready").put("version", a.version)
            return true
        } catch (_: Exception) { return false } finally { busy = false }
    }

    fun hasStaged() = staged != null

    /** Install the downloaded update. Returns a message for the game, or null when Android takes over. */
    fun install(ctx: Context): String? {
        val apk = staged ?: return "No update is ready yet."
        if (!ctx.packageManager.canRequestPackageInstalls()) {
            // Android's one-time permission screen: "Allow from this source". The game installs again on return.
            ctx.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${ctx.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return "Turn on “Allow from this source” for Animal Tycoon, then come back — the update installs straight away."
        }
        return try {
            val installer = ctx.packageManager.packageInstaller
            val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
            params.setAppPackageName(ctx.packageName)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
            val id = installer.createSession(params)
            installer.openSession(id).use { session ->
                session.openWrite("animal-tycoon.apk", 0, apk.length()).use { out ->
                    apk.inputStream().use { it.copyTo(out) }
                    session.fsync(out)
                }
                val intent = Intent(ctx, InstallReceiver::class.java)
                val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
                session.commit(PendingIntent.getBroadcast(ctx, id, intent, flags).intentSender)
            }
            null
        } catch (e: Exception) { "Couldn't start the update: ${e.message}" }
    }
}

/** Android reports install progress here (and asks the player to confirm the first self-update). */
class InstallReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            // Updated: open the new version again.
            runCatching { ctx.startActivity(Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
            return
        }
        if (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE) == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            @Suppress("DEPRECATION")
            val confirm = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java) else intent.getParcelableExtra(Intent.EXTRA_INTENT)
            confirm?.let { it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); runCatching { ctx.startActivity(it) } }
        }
    }
}
