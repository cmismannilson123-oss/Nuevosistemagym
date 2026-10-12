package com.cyfitness.admin

import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import java.io.File

// Guarda el comprobante que genera el panel en la carpeta Descargas del celular,
// para poder adjuntarlo en WhatsApp.
object Comprobantes {

    fun guardarEnDescargas(contexto: Context, dataUrl: String, nombre: String): Boolean {
        return try {
            val bytes = Base64.decode(dataUrl.substringAfter("base64,"), Base64.DEFAULT)
            if (Build.VERSION.SDK_INT >= 29) {
                val valores = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, nombre)
                    put(MediaStore.Downloads.MIME_TYPE, "image/png")
                    put(MediaStore.Downloads.IS_PENDING, 1)
                }
                val resolver = contexto.contentResolver
                val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, valores) ?: return false
                resolver.openOutputStream(uri)?.use { it.write(bytes) } ?: return false
                val listo = ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }
                resolver.update(uri, listo, null, null)
            } else {
                // Android 8 y 9: escritura directa en Descargas (permiso de almacenamiento en el manifest)
                val carpeta = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                carpeta.mkdirs()
                File(carpeta, nombre).writeBytes(bytes)
            }
            true
        } catch (e: Exception) {
            false
        }
    }
}
