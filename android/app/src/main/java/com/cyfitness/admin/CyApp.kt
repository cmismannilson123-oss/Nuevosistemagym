package com.cyfitness.admin

import android.app.Application

// Se ejecuta una vez por proceso: el motor de voz queda listo antes de que llegue el primer aviso
class CyApp : Application() {
    override fun onCreate() {
        super.onCreate()
        VozAnuncio.iniciar(this)
    }
}
