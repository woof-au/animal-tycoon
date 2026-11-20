# The game page calls these methods through the WebView JavaScript bridge, so R8 must keep them.
-keepclassmembers class stream.woofservices.animaltycoon.GameBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
