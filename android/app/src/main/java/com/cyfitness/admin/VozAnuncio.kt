package com.cyfitness.admin

import android.content.Context
import android.speech.tts.TextToSpeech
import java.util.Locale

// Lee los avisos en voz alta con la voz del celular. Funciona con la pantalla
// apagada porque la app lo llama desde el servicio de avisos.
object VozAnuncio {
    private var tts: TextToSpeech? = null
    private var listo = false
    private val pendientes = mutableListOf<String>()

    fun iniciar(context: Context) {
        if (tts != null) return
        tts = TextToSpeech(context.applicationContext) { estado ->
            if (estado == TextToSpeech.SUCCESS) {
                val idioma = tts?.setLanguage(Locale("es", "PE"))
                if (idioma == TextToSpeech.LANG_MISSING_DATA || idioma == TextToSpeech.LANG_NOT_SUPPORTED) {
                    tts?.setLanguage(Locale("es", "ES"))
                }
                tts?.setSpeechRate(0.95f)
                listo = true
                pendientes.forEach { hablar(it) }
                pendientes.clear()
            }
        }
    }

    fun hablar(texto: String) {
        if (texto.isBlank()) return
        if (!listo) { pendientes.add(texto); return }
        tts?.speak(texto, TextToSpeech.QUEUE_ADD, null, "aviso-" + System.nanoTime())
    }
}
