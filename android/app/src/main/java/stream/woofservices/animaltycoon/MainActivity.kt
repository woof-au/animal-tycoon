package stream.woofservices.animaltycoon

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject

/**
 * Animal Tycoon for Android: the exact same game as the Windows and Mac apps (src/renderer), running full screen in a
 * WebView. Files are served from the app's own assets at https://appassets.androidplatform.net so ES modules work and
 * nothing is loaded from the internet except Woof Services and update checks.
 */
class MainActivity : ComponentActivity() {
    private lateinit var web: WebView
    private lateinit var bridge: GameBridge
    private val main = Handler(Looper.getMainLooper())
    private var paused = false
    private val updateCheck = object : Runnable {
        override fun run() { bridge.checkForUpdate(); main.postDelayed(this, 10 * 60_000L) }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        hideSystemBars()

        val assets = WebViewAssetLoader.Builder().addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this)).build()
        web = WebView(this)
        web.setBackgroundColor(Color.parseColor("#8FD3FF"))
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = false
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? = assets.shouldInterceptRequest(request.url)
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (url.host == "appassets.androidplatform.net") return false
                if (url.scheme == "https") runCatching { startActivity(Intent(Intent.ACTION_VIEW, url)) }
                return true
            }
        }
        bridge = GameBridge(this)
        web.addJavascriptInterface(bridge, "WoofNative")
        setContentView(web)
        web.loadUrl(GAME_URL)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                web.evaluateJavascript("(window.__woofBack ? window.__woofBack() : false)") { handled ->
                    if (handled != "true") moveTaskToBack(true)
                }
            }
        })
        bridge.pingInstall()
        main.postDelayed(updateCheck, 10 * 60_000L) // the launch check is started by the game's loading screen
    }

    private fun hideSystemBars() {
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    override fun onPause() {
        super.onPause()
        paused = true
        // Let the game save to the cloud first, then pause it (music, rendering).
        emit("quit", JSONObject())
        main.postDelayed({ if (paused) web.onPause() }, 600)
    }

    override fun onResume() {
        super.onResume()
        paused = false
        web.onResume()
        hideSystemBars()
        bridge.onResume()
    }

    override fun onDestroy() {
        main.removeCallbacksAndMessages(null)
        web.destroy()
        super.onDestroy()
    }

    fun bringToFront() {
        startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP))
    }

    /** Answer a window.woof call. */
    fun resolve(id: String, ok: Boolean, json: String?) {
        val js = "window.__woofResolve && window.__woofResolve(${JSONObject.quote(id)}, $ok, ${JSONObject.quote(json ?: "")})"
        main.post { web.evaluateJavascript(js, null) }
    }

    /** Send an event (update, quit) to the game. */
    fun emit(name: String, data: JSONObject) {
        val js = "window.__woofEvent && window.__woofEvent(${JSONObject.quote(name)}, ${JSONObject.quote(data.toString())})"
        main.post { web.evaluateJavascript(js, null) }
    }

    companion object {
        const val GAME_URL = "https://appassets.androidplatform.net/assets/renderer/index.html"
    }
}
