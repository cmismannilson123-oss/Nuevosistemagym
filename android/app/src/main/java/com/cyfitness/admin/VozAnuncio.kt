package com.cyfitness.admin

import android.content.Context
import android.speech.tts.TextToSpeech
import java.util.ArrayDeque
import java.util.Locale

// Lee los avisos en voz alta con la voz del celular.
// Un solo motor por proceso; los avisos que llegan antes de que esté listo
// se guardan y se leen en orden, sin perder ninguno.
object VozAnuncio {
    private val lock = Any()
    private var tts: TextToSpeech? = null
    private var listo = false
    private val pendientes = ArrayDeque<String>()

    fun iniciar(context: Context) {
        synchronized(lock) { if (tts != null) return }
        val motor = TextToSpeech(context.applicationContext) { estado ->
            if (estado != TextToSpeech.SUCCESS) return@TextToSpeech
            val t = tts ?: return@TextToSpeech
            val idioma = t.setLanguage(Locale("es", "PE"))
            if (idioma < 0) t.setLanguage(Locale("es", "ES"))
            t.setSpeechRate(0.95f)
            synchronized(lock) {
                listo = true
                while (pendientes.isNotEmpty()) decir(pendientes.removeFirst())
            }
        }
        synchronized(lock) { tts = motor }
    }

    // Devuelve true si el aviso se va a leer (ahora o en cuanto el motor esté listo)
    fun hablar(texto: String): Boolean {
        if (texto.isBlank()) return false
        synchronized(lock) {
            if (!listo) { pendientes.addLast(texto); return true }
        }
        return decir(texto)
    }

    private fun decir(texto: String): Boolean =
        tts?.speak(texto, TextToSpeech.QUEUE_ADD, null, "aviso-" + System.nanoTime()) == TextToSpeech.SUCCESS

    fun detener() {
        synchronized(lock) { pendientes.clear() }
        tts?.stop()
    }
}
