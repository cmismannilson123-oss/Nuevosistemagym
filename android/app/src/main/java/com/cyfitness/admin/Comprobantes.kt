package com.cyfitness.admin

import android.app.Activity
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import androidx.core.content.FileProvider
import java.io.File

// Comprobante de pago: se guarda en Descargas y se abre WhatsApp con la imagen adjunta.
object Comprobantes {

    fun procesar(act: MainActivity, dataUrl: String, nombre: String, mensaje: String): Boolean {
        return try {
            val bytes = Base64.decode(dataUrl.substringAfter("base64,"), Base64.DEFAULT)
            guardarEnDescargas(act, bytes, nombre)
            val carpeta = File(act.cacheDir, "comprobantes").apply { mkdirs() }
            val archivo = File(carpeta, nombre).apply { writeBytes(bytes) }
            act.runOnUiThread { compartir(act, archivo, mensaje) }
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

    private fun compartir(act: Activity, archivo: File, mensaje: String) {
        val uri = FileProvider.getUriForFile(act, act.packageName + ".fileprovider", archivo)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "image/png"
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_TEXT, mensaje)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            whatsapp(act)?.let { setPackage(it) }
        }
        val abrir = if (intent.`package` != null) intent else Intent.createChooser(intent, "Enviar comprobante")
        act.startActivity(abrir)
    }

    // WhatsApp normal o WhatsApp Business, el que esté instalado
    private fun whatsapp(act: Activity): String? =
        listOf("com.whatsapp", "com.whatsapp.w4b").firstOrNull { paquete ->
            try { act.packageManager.getPackageInfo(paquete, 0); true }
            catch (e: PackageManager.NameNotFoundException) { false }
        }
}
