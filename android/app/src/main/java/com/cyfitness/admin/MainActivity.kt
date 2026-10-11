package com.cyfitness.admin

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessaging

// Pantalla principal: muestra el panel de recepción (la misma página web de siempre)
// y le entrega al panel el token de Firebase de este celular.
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView

    companion object {
        const val PANEL_URL = "https://admirable-kataifi-49edd5.netlify.app/?app=panel"
        const val PREFS = "cy_recepcion"
        const val CLAVE_TOKEN = "fcm_token"
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        pedirPermisoNotificaciones()
        VozAnuncio.iniciar(this)

        web = WebView(this).also { setContentView(it) }
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true          // el panel guarda la sesión del personal
            mediaPlaybackRequiresUserGesture = false
        }
        web.webChromeClient = WebChromeClient()
        web.addJavascriptInterface(PuenteApp(), "AndroidApp")
        web.webViewClient = object : WebViewClient() {
            // Solo el panel se queda dentro de la app; lo demás abre el navegador
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val host = Uri.parse(PANEL_URL).host
                if (request.url.host == host) return false
                startActivity(Intent(Intent.ACTION_VIEW, request.url))
                return true
            }
        }

        FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
            guardarToken(token)
        }

        if (savedInstanceState != null) web.restoreState(savedInstanceState)
        else web.loadUrl(PANEL_URL)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    private fun guardarToken(token: String) {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(CLAVE_TOKEN, token).apply()
    }

    private fun pedirPermisoNotificaciones() {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
    }

    // Lo que el panel (JavaScript) puede pedirle a la app
    inner class PuenteApp {
        @JavascriptInterface
        fun tokenFcm(): String =
            getSharedPreferences(PREFS, MODE_PRIVATE).getString(CLAVE_TOKEN, "") ?: ""

        @JavascriptInterface
        fun nombreDispositivo(): String = "App Android · ${Build.MODEL}"

        // El panel pide leer un anuncio escrito por el personal
        @JavascriptInterface
        fun hablar(texto: String) = VozAnuncio.hablar(texto)
    }
}
