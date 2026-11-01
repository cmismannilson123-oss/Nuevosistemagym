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

        val prefs = getSharedPreferences(MainActivity.PREFS, Context.MODE_PRIVATE)
        // El servidor puede reenviar un aviso que no llegó a tiempo: si ya se mostró, se ignora
        val pendiente = datos["pendiente_id"]
        if (pendiente != null && !marcarNuevo(prefs, pendiente)) return
        if (prefs.getBoolean("ingresos_on", true)) mostrarNotificacion(titulo, cuerpo, etiqueta)
        // El motor de voz lo inicia CyApp al arrancar el proceso; aquí solo se lee el aviso
        val leido = prefs.getBoolean("voz_on", true) && VozAnuncio.hablar(voz)
        registrar(prefs, titulo, leido)
    }

    // Devuelve true si el aviso es nuevo (y lo recuerda); false si ya llegó antes.
    // Guarda los últimos 300 identificadores, de sobra para la cola de reenvíos.
    private fun marcarNuevo(prefs: android.content.SharedPreferences, id: String): Boolean = synchronized(LOCK) {
        val vistos = (prefs.getString("vistos", "") ?: "").split(",").filter { it.isNotEmpty() }.toMutableList()
        if (vistos.contains(id)) return@synchronized false
        vistos.add(id)
        while (vistos.size > 300) vistos.removeAt(0)
        prefs.edit().putString("vistos", vistos.joinToString(",")).apply()
        true
    }

    // Guarda los últimos 20 avisos: hora, título y si se leyó en voz
    private fun registrar(prefs: android.content.SharedPreferences, titulo: String, leido: Boolean) = synchronized(LOCK) {
        val previo = try { org.json.JSONArray(prefs.getString("avisos_log", "[]")) } catch (e: Exception) { org.json.JSONArray() }
        val hora = java.text.SimpleDateFormat("HH:mm", java.util.Locale("es", "PE")).format(java.util.Date())
        val nuevo = org.json.JSONArray().put(org.json.JSONObject().put("hora", hora).put("titulo", titulo).put("voz", leido))
        for (i in 0 until minOf(previo.length(), 19)) nuevo.put(previo.get(i))
        prefs.edit().putString("avisos_log", nuevo.toString()).apply()
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
            .setWhen(System.currentTimeMillis())
            .setShowWhen(true)
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
            // Un aviso por cada ingreso: cada uno tiene su número, aunque lleguen varios en el mismo instante
            NotificationManagerCompat.from(this).notify(etiqueta, IDS.incrementAndGet(), aviso)
        } catch (e: SecurityException) {
            // Sin permiso de notificaciones: el aviso igual se lee en voz alta
        }
    }

    companion object {
        const val CANAL = "avisos_ingresos"
        private val LOCK = Any()
        private val IDS = java.util.concurrent.atomic.AtomicInteger(1000)
    }
}
