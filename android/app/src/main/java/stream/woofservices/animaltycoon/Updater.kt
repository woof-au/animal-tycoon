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
 * carries the Windows and Mac versions. The APK is downloaded in the background while you play and checked against
 * the .sha256 file next to it; Android itself refuses an APK that isn't signed with the same key. One tap installs it
 * (Android 12+ installs later updates without asking once the game has updated itself one time).
 */
object Updater {
    private const val API = "https://api.github.com/repos/woof-au/animal-tycoon/releases/latest"
    private const val DL = "https://github.com/woof-au/animal-tycoon/releases/download/"
    private const val APK = "Animal-Tycoon-Android.apk"

    @Volatile var state: JSONObject? = null
        private set
    @Volatile private var staged: File? = null
    @Volatile private var busy = false

    /** Check and, if there is a newer version, download and verify it. Runs off the UI thread. */
    fun checkAndDownload(ctx: Context, emit: (JSONObject) -> Unit) {
        if (busy || staged != null) return
        busy = true
        try {
            val release = JSONObject(Net.getText(API))
            if (release.optBoolean("draft") || release.optBoolean("prerelease")) return
            val version = release.optString("tag_name").removePrefix("v")
            if (!version.matches(Regex("^[0-9]+\\.[0-9]+\\.[0-9]+$")) || cmpVersion(version, BuildConfig.VERSION_NAME) <= 0) return
            val assets = release.getJSONArray("assets")
            var apkUrl = ""; var shaUrl = ""; var size = 0L
            for (i in 0 until assets.length()) {
                val a = assets.getJSONObject(i)
                when (a.getString("name")) {
                    APK -> { apkUrl = a.getString("browser_download_url"); size = a.optLong("size", 0) }
                    "$APK.sha256" -> shaUrl = a.getString("browser_download_url")
                }
            }
            if (!apkUrl.startsWith(DL) || !shaUrl.startsWith(DL) || size <= 0 || size > 300L * 1024 * 1024) return
            val expected = Net.getText(shaUrl).trim().split(Regex("\\s+")).first().lowercase()
            if (!expected.matches(Regex("^[a-f0-9]{64}$"))) return
            emit(JSONObject().put("state", "downloading").put("version", version))
            val file = File(ctx.cacheDir, "update-$version.apk")
            val digest = MessageDigest.getInstance("SHA-256")
            var got = 0L
            val c = URL(apkUrl).openConnection() as HttpURLConnection
            c.instanceFollowRedirects = true; c.connectTimeout = 15000; c.readTimeout = 30000
            try {
                c.inputStream.use { input ->
                    file.outputStream().use { out ->
                        val buf = ByteArray(64 * 1024)
                        while (true) {
                            val n = input.read(buf); if (n < 0) break
                            got += n; if (got > size) throw IllegalStateException("too large")
                            digest.update(buf, 0, n); out.write(buf, 0, n)
                        }
                    }
                }
            } catch (e: Exception) { file.delete(); return } finally { c.disconnect() }
            val hex = digest.digest().joinToString("") { "%02x".format(it) }
            if (got != size || hex != expected) { file.delete(); return }
            staged = file
            val s = JSONObject().put("state", "ready").put("version", version)
                .put("message", "✨ Animal Tycoon $version is ready to install.").put("button", "Install")
            state = s; emit(s)
        } catch (_: Exception) { /* offline or GitHub unavailable: try again later */ } finally { busy = false }
    }

    /** Called when the player taps Install. Returns a message for the game, or null when Android takes over. */
    fun install(ctx: Context): String? {
        val apk = staged ?: return "No update is ready yet."
        if (!ctx.packageManager.canRequestPackageInstalls()) {
            // Android's one-time permission screen: "Allow from this source".
            ctx.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${ctx.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return "Allow Animal Tycoon to install updates, then tap Install again."
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

/** Android reports install progress here. */
class InstallReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE) == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            @Suppress("DEPRECATION")
            val confirm = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java) else intent.getParcelableExtra(Intent.EXTRA_INTENT)
            confirm?.let { it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); runCatching { ctx.startActivity(it) } }
        }
    }
}
