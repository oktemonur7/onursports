package com.tvlive.match

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.*
import android.widget.FrameLayout
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var customView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null
    private lateinit var container: FrameLayout

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Tam ekran, status bar gizle
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        )

        container = FrameLayout(this)
        container.setBackgroundColor(0xFF0A0A0F.toInt())
        setContentView(container)

        webView = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
            isFocusable = true
            isFocusableInTouchMode = true
            requestFocus()
        }

        // WebView ayarları
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = true
            allowContentAccess = true
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }

        // Debug modu (geliştirme sırasında aktif)
        WebView.setWebContentsDebuggingEnabled(true)

        // JavaScript köprüsü
        webView.addJavascriptInterface(TvBridge(this), "TvBridge")

        // Chrome client (tam ekran video desteği)
        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                customView?.let { callback.onCustomViewHidden(); return }
                customView = view
                customViewCallback = callback
                container.addView(view, FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT
                ))
                webView.visibility = View.GONE
            }

            override fun onHideCustomView() {
                customView?.let {
                    container.removeView(it)
                    customView = null
                }
                customViewCallback?.onCustomViewHidden()
                customViewCallback = null
                webView.visibility = View.VISIBLE
            }

            override fun onConsoleMessage(msg: ConsoleMessage): Boolean {
                android.util.Log.d("WebConsole", "${msg.sourceId()}:${msg.lineNumber()} → ${msg.message()}")
                return true
            }
        }

        // Web client
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                return false
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                android.util.Log.e("WebViewError", "Error: ${error.description} → ${request.url}")
            }
        }


        container.addView(webView)

        // Ana HTML sayfasını yükle
        webView.loadUrl("file:///android_asset/www/index.html")
    }

    // D-Pad key eventlerini WebView'e ilet
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        // Özel view aktifse (tam ekran video) BACK tuşunu yakala
        if (customView != null && event.keyCode == KeyEvent.KEYCODE_BACK && event.action == KeyEvent.ACTION_UP) {
            webView.webChromeClient?.onHideCustomView()
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    override fun onBackPressed() {
        // Custom view aktifse kapat
        if (customView != null) {
            webView.webChromeClient?.onHideCustomView()
            return
        }
        // WebView'e BACK event'ini JS olarak bildir
        webView.evaluateJavascript("window.handleBackPress && window.handleBackPress();", null)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        // Tam ekran geri yükle
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        )
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}

/**
 * JavaScript ↔ Kotlin köprüsü
 * JS'ten: TvBridge.openExternalUrl(url)
 */
class TvBridge(private val activity: Activity) {

    @JavascriptInterface
    fun openExternalUrl(url: String) {
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            activity.startActivity(intent)
        } catch (e: Exception) {
            android.util.Log.e("TvBridge", "openExternalUrl failed: $e")
        }
    }

    @JavascriptInterface
    fun exitApp() {
        android.util.Log.d("TvBridge", "exitApp() çağrıldı — uygulama kapatılıyor")
        activity.runOnUiThread { activity.finish() }
        android.os.Process.killProcess(android.os.Process.myPid())
    }

    @JavascriptInterface
    fun log(message: String) {
        android.util.Log.d("TvApp", message)
    }
}
