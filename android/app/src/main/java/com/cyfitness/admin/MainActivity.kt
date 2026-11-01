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
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessaging
import org.json.JSONObject
import java.net.URL

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
                // Enlaces de WhatsApp (wa.me, api.whatsapp.com, whatsapp://): van directo a la app de WhatsApp
                if (request.url.host == "wa.me" || request.url.host == "api.whatsapp.com" || request.url.scheme == "whatsapp") {
                    Comprobantes.abrirWhatsApp(this@MainActivity, request.url)
                    return true
                }
                startActivity(Intent(Intent.ACTION_VIEW, request.url))
                return true
            }
        }

        FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
            guardarToken(token)
        }
        comprobarActualizacion()

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

    // Lee version.json de tu sitio. Si hay un número mayor que esta app, ofrece actualizar.
    // Sin internet o sin archivo no pasa nada.
    private fun comprobarActualizacion() {
        Thread {
            try {
                val base = Uri.parse(PANEL_URL)
                val origen = "${base.scheme}://${base.host}"
                val texto = URL("$origen/version.json").openConnection().apply {
                    connectTimeout = 8000
                    readTimeout = 8000
                }.getInputStream().bufferedReader().readText()
                val json = JSONObject(texto)
                if (json.getInt("codigo") > BuildConfig.VERSION_CODE) {
                    val ruta = json.getString("apk")
                    val enlace = if (ruta.startsWith("http")) ruta else origen + ruta
                    runOnUiThread { mostrarActualizacion(enlace) }
                }
            } catch (e: Exception) {
                // Sin internet o sin version.json: se sigue normal
            }
        }.start()
    }

    private fun mostrarActualizacion(enlace: String) {
        if (isFinishing) return
        AlertDialog.Builder(this)
            .setTitle("Hay una versión nueva")
            .setMessage("Descarga la actualización y confirma la instalación. Tus datos se mantienen.")
            .setPositiveButton("Actualizar") { _, _ ->
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(enlace)))
            }
            .setNegativeButton("Más tarde", null)
            .show()
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

        // Botón de detener del panel: corta lo que la app está diciendo
        @JavascriptInterface
        fun detener() = VozAnuncio.detener()

        // Comprobante de pago: se guarda en Descargas y se abre WhatsApp con la imagen adjunta
        @JavascriptInterface
        fun compartirComprobante(dataUrl: String, nombre: String, mensaje: String, telefono: String): Boolean =
            Comprobantes.procesar(this@MainActivity, dataUrl, nombre, mensaje, telefono)

        // Últimos avisos recibidos en este celular (para revisar que llegaron y se leyeron)
        @JavascriptInterface
        fun ultimosAvisos(): String =
            getSharedPreferences(PREFS, MODE_PRIVATE).getString("avisos_log", "[]") ?: "[]"

        // Pausar/reanudar avisos de ingreso y voz desde el panel (se guardan en el celular)
        @JavascriptInterface
        fun obtenerPref(clave: String): Boolean =
            getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean(clave, true)

        @JavascriptInterface
        fun guardarPref(clave: String, valor: Boolean) {
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(clave, valor).apply()
        }
    }
}
