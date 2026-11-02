package com.cyfitness.admin

import android.app.Activity
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import androidx.core.content.FileProvider
import java.io.File
import java.net.URLEncoder

// Comprobante de pago: se guarda en Descargas y se abre WhatsApp con la imagen adjunta.
object Comprobantes {

    // telefono: número con código de país (51…). Así WhatsApp abre directo el chat de ese socio.
    fun procesar(act: MainActivity, dataUrl: String, nombre: String, mensaje: String, telefono: String): Boolean {
        return try {
            val bytes = Base64.decode(dataUrl.substringAfter("base64,"), Base64.DEFAULT)
            guardarEnDescargas(act, bytes, nombre)
            val numero = telefono.filter { it.isDigit() }
            // Socio sin WhatsApp: el comprobante solo queda en Descargas, no se abre ningún chat ni selector
            if (numero.isEmpty()) return true
            val carpeta = File(act.cacheDir, "comprobantes").apply { mkdirs() }
            val archivo = File(carpeta, nombre).apply { writeBytes(bytes) }
            val paquete = whatsapp(act)
            act.runOnUiThread {
                // Con WhatsApp y número válido: abre el chat de ese socio con el mensaje listo.
                // El comprobante ya está en Descargas para adjuntarlo.
                if (paquete != null && numero.length >= 8) abrirChat(act, mensaje, numero, paquete)
                else compartir(act, archivo, mensaje)
            }
            true
        } catch (e: Exception) {
            false
        }
    }

    private fun guardarEnDescargas(ctx: Context, bytes: ByteArray, nombre: String) {
        if (Build.VERSION.SDK_INT >= 29) {
            val valores = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, nombre)
                put(MediaStore.Downloads.MIME_TYPE, "image/png")
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val resolver = ctx.contentResolver
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, valores) ?: return
            resolver.openOutputStream(uri)?.use { it.write(bytes) }
            resolver.update(uri, ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }, null, null)
        } else {
            // Android 8 y 9: escritura directa en Descargas (permiso de almacenamiento en el manifest)
            val carpeta = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            carpeta.mkdirs()
            File(carpeta, nombre).writeBytes(bytes)
        }
    }

    // Abre el chat del número directamente en WhatsApp con el mensaje escrito (sin contacto guardado)
    private fun abrirChat(act: Activity, mensaje: String, numero: String, paquete: String) {
        val texto = URLEncoder.encode(mensaje, "UTF-8").replace("+", "%20")
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$numero?text=$texto")).apply {
            setPackage(paquete)
        }
        act.startActivity(intent)
    }

    // Enlace wa.me / api.whatsapp.com / whatsapp:// abierto dentro de la app: va a WhatsApp (o WhatsApp Business)
    // con el mismo chat y texto. Si no se puede, se usa cualquier app que lo maneje.
    fun abrirWhatsApp(act: Activity, enlace: Uri) {
        val paquete = whatsapp(act)
        try {
            act.startActivity(Intent(Intent.ACTION_VIEW, enlace).apply { if (paquete != null) setPackage(paquete) })
        } catch (e: Exception) {
            act.startActivity(Intent(Intent.ACTION_VIEW, enlace))
        }
    }

    // Sin número o sin WhatsApp: se comparte la imagen con el selector de apps
    private fun compartir(act: Activity, archivo: File, mensaje: String) {
        val uri = FileProvider.getUriForFile(act, act.packageName + ".fileprovider", archivo)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "image/png"
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_TEXT, mensaje)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        act.startActivity(Intent.createChooser(intent, "Enviar comprobante"))
    }

    // WhatsApp normal o WhatsApp Business, el que esté instalado
    private fun whatsapp(act: Activity): String? =
        listOf("com.whatsapp", "com.whatsapp.w4b").firstOrNull { paquete ->
            try { act.packageManager.getPackageInfo(paquete, 0); true }
            catch (e: PackageManager.NameNotFoundException) { false }
        }
}
