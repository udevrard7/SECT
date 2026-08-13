// SECT Mobile — Shared KMP Module
// Contient la logique métier partagée entre Android et iOS :
// - Client HTTP Ktor (communication avec backend Go)
// - Modèles de données (DTOs correspondant aux réponses Go)
// - Gestion JWT et cache
// - Repositories (abstraction data layer)

plugins {
    kotlin("multiplatform")
    kotlin("plugin.serialization")
    id("com.android.library")
}

kotlin {
    // ── Cibles ──
    androidTarget()

    listOf(
        iosX64(),
        iosArm64(),
        iosSimulatorArm64(),
    ).forEach { target ->
        target.binaries.framework {
            baseName = "Shared"
            isStatic = true
        }
    }

    // ── Source Sets ──
    sourceSets {
        commonMain.dependencies {
            // Client HTTP Ktor
            implementation("io.ktor:ktor-client-core:3.1.3")
            implementation("io.ktor:ktor-client-content-negotiation:3.1.3")
            implementation("io.ktor:ktor-serialization-kotlinx-json:3.1.3")
            implementation("io.ktor:ktor-client-auth:3.1.3")
            implementation("io.ktor:ktor-client-logging:3.1.3")

            // WebSocket (surveillance/proctoring temps réel)
            implementation("io.ktor:ktor-client-websockets:3.1.3")

            // CIO Engine (pour SSE bodyAsChannel)
            implementation("io.ktor:ktor-client-cio:3.1.3")

            // Sérialisation JSON
            implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.1")

            // Coroutines
            implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.1")

            // Date/Time
            implementation("org.jetbrains.kotlinx:kotlinx-datetime:0.7.0")

            // Koin DI (shared)
            implementation("io.insert-koin:koin-core:4.1.0-Beta1")
        }

        commonTest.dependencies {
            implementation(kotlin("test-common"))
            implementation(kotlin("test-annotations-common"))
            implementation("io.ktor:ktor-client-mock:3.1.3")
        }

        androidMain.dependencies {
            // Ktor engine Android
            implementation("io.ktor:ktor-client-okhttp:3.1.3")

            // DataStore pour cache Android
            implementation("androidx.datastore:datastore-preferences:1.1.7")

            // Security (EncryptedSharedPreferences pour JWT)
            implementation("androidx.security:security-crypto:1.1.0-alpha06")

            // Biometric (Face ID / Fingerprint)
            implementation("androidx.biometric:biometric:1.1.0")
        }

        iosMain.dependencies {
            // Ktor engine iOS (NSURLSession)
            implementation("io.ktor:ktor-client-darwin:3.1.3")
        }
    }
}

android {
    namespace = "com.sect.mobile.shared"
    compileSdk = 36
    defaultConfig {
        minSdk = 26
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
