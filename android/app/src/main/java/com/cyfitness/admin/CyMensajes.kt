package com.cyfitness.admin

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

// Recibe los avisos de Firebase (ingresos, intentos y pruebas), los muestra en la
// barra de notificaciones y los lee en voz alta, aunque la pantalla esté apagada.
class CyMensajes : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        // Firebase cambia el token de vez en cuando; lo guardamos para el panel
        getSharedPreferences(MainActivity.PREFS, Context.MODE_PRIVATE)
            .edit().putString(MainActivity.CLAVE_TOKEN, token).apply()
    }

    override fun onMessageReceived(mensaje: RemoteMessage) {
        val datos = mensaje.data
        val titulo = datos["title"] ?: "C&Y Fitness Gym"
        val cuerpo = datos["body"] ?: ""
        val voz = datos["voz"] ?: ""
        val etiqueta = datos["tag"] ?: "cy-aviso"

        mostrarNotificacion(titulo, cuerpo, etiqueta)
        VozAnuncio.hablar(voz)
    }

    private fun mostrarNotificacion(titulo: String, cuerpo: String, etiqueta: String) {
        val gestor = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26 && gestor.getNotificationChannel(CANAL) == null) {
            gestor.createNotificationChannel(
                NotificationChannel(CANAL, "Ingresos y avisos", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "Un aviso cada vez que entra o intenta entrar un socio"
                    enableVibration(true)
                }
            )
        }
        val abrir = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val aviso = NotificationCompat.Builder(this, CANAL)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(titulo)
            .setContentText(cuerpo)
            .setStyle(NotificationCompat.BigTextStyle().bigText(cuerpo))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(abrir)
            .build()
        try {
            NotificationManagerCompat.from(this).notify(etiqueta, 1, aviso)
        } catch (e: SecurityException) {
            // Sin permiso de notificaciones: el aviso igual se lee en voz alta
        }
    }

    companion object {
        const val CANAL = "avisos_ingresos"
    }
}
