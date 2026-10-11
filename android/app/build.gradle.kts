plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.gms.google-services")
}

// La firma viene de variables de entorno (en GitHub Actions, desde los secretos).
// Sin ellas, la compilación sale sin firmar y no se puede instalar.
val firmaRuta = System.getenv("KEYSTORE_PATH")

android {
    namespace = "com.cyfitness.admin"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.cyfitness.admin"
        minSdk = 26
        targetSdk = 34
        versionCode = 100
        versionName = "2.0"
    }

    signingConfigs {
        if (firmaRuta != null) {
            create("release") {
                storeFile = file(firmaRuta)
                storePassword = System.getenv("KEYSTORE_PASS")
                keyAlias = System.getenv("KEY_ALIAS")
                keyPassword = System.getenv("KEY_PASS")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (firmaRuta != null) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation(platform("com.google.firebase:firebase-bom:33.1.2"))
    implementation("com.google.firebase:firebase-messaging")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
}
