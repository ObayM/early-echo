package dev.obayy.earlyecho

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.provider.Settings
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import android.window.OnBackInvokedDispatcher
import org.json.JSONObject

class MainActivity : Activity() {
    private lateinit var web: WebView
    private var session: Session? = null
    private val handler = Handler(Looper.getMainLooper())
    private var multicast: WifiManager.MulticastLock? = null
    private var wifi: WifiManager.WifiLock? = null
    private var asked = false
    private var denied = false

    private val push = object : Runnable {
        override fun run() {
            val json = session?.snapshot() ?: JSONObject().put("phase", if (denied) "nomic" else "mic").toString()
            web.evaluateJavascript("window.EEUI&&EEUI.update($json)", null)
            handler.postDelayed(this, 200)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        window.decorView.setBackgroundColor(Color.BLACK)
        window.setDecorFitsSystemWindows(false)
        @Suppress("DEPRECATION")
        window.statusBarColor = Color.TRANSPARENT
        @Suppress("DEPRECATION")
        window.navigationBarColor = Color.TRANSPARENT
        web = WebView(this).apply {
            setBackgroundColor(Color.BLACK)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            overScrollMode = WebView.OVER_SCROLL_NEVER
            isVerticalScrollBarEnabled = false
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView, url: String) = view.requestApplyInsets()
            }
            addJavascriptInterface(Bridge(), "EE")
            loadUrl("file:///android_asset/ui/index.html")
        }
        setContentView(web)
        web.setOnApplyWindowInsetsListener { v, insets ->
            val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
            val d = resources.displayMetrics.density
            web.evaluateJavascript("document.documentElement.style.setProperty('--top','${bars.top / d}px');document.documentElement.style.setProperty('--bottom','${bars.bottom / d}px')", null)
            v.onApplyWindowInsets(insets)
        }
        lightBars(false)
        if (Build.VERSION.SDK_INT >= 33) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) { back() }
        }
    }

    @SuppressLint("GestureBackNavigation")
    @Deprecated("Before Android 13")
    override fun onBackPressed() = back()

    private fun back() {
        web.evaluateJavascript("window.EEUI?EEUI.back():false") { if (it != "true") finish() }
    }

    override fun onStart() {
        super.onStart()
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) begin()
        else if (!asked) {
            asked = true
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 1)
        }
        handler.post(push)
    }

    override fun onStop() {
        super.onStop()
        handler.removeCallbacks(push)
        session?.stop()
        session = null
        multicast?.release()
        wifi?.release()
        multicast = null
        wifi = null
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            denied = false
            begin()
        } else denied = true
    }

    private fun begin() {
        if (session != null) return
        val wm = applicationContext.getSystemService(WifiManager::class.java)
        multicast = wm.createMulticastLock("early-echo").apply { setReferenceCounted(false); acquire() }
        wifi = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_LOW_LATENCY, "early-echo").apply { setReferenceCounted(false); acquire() }
        session = Session(applicationContext) { on -> runOnUiThread { if (on) buzz() } }.also { it.start() }
    }

    private fun buzz() {
        val v = getSystemService(Vibrator::class.java) ?: return
        v.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 400, 150, 400, 150, 600), -1))
    }

    private fun lightBars(light: Boolean) {
        val flags = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
        window.insetsController?.setSystemBarsAppearance(if (light) flags else 0, flags)
    }

    inner class Bridge {
        @JavascriptInterface fun mark(state: String) { session?.mark(state) }
        @JavascriptInterface fun relearn() { session?.relearn() }
        @JavascriptInterface fun sensitivity(s: String) { session?.setSensitivity(s) }
        @JavascriptInterface fun band(b: String) { session?.setBand(b) }
        @JavascriptInterface fun sound(on: Boolean) { session?.setSound(on) }
        @JavascriptInterface fun connect(address: String): Boolean = session?.connectTo(address) ?: false
        @JavascriptInterface fun distance(cm: String): Boolean = session?.setDistance(cm) ?: false
        @JavascriptInterface fun save(): String = session?.save() ?: "Nothing to save yet."
        @JavascriptInterface fun bars(light: Boolean) { runOnUiThread { lightBars(light) } }
        @JavascriptInterface fun tap() { runOnUiThread { web.performHapticFeedback(android.view.HapticFeedbackConstants.CONTEXT_CLICK) } }

        @JavascriptInterface fun askMic() {
            runOnUiThread {
                if (shouldShowRequestPermissionRationale(Manifest.permission.RECORD_AUDIO) || !asked) {
                    asked = true
                    requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 1)
                } else {
                    startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null)))
                }
            }
        }
    }
}
