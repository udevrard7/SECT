// SECT Mobile — Root Gradle build configuration
plugins {
    kotlin("multiplatform") version "2.3.21" apply false
    kotlin("android") version "2.4.20" apply false
    id("com.android.application") version "8.11.0" apply false
    id("com.android.library") version "8.11.0" apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "2.3.21" apply false
    id("org.jetbrains.compose") version "1.11.1" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.3.21" apply false
    id("app.cash.sqldelight") version "2.4.0" apply false
    id("com.google.gms.google-services") version "4.4.2" apply false
}

// ⚠️ okhttp épinglé 5.4.0 : ktor-client-okhttp 3.6.0 requiert okhttp 5.5.0
// dont l'artifact Android (okhttp-android) déclare minCompileSdk=37 —
// incompatible avec compileSdk 36 / AGP 8.11 (checkAarMetadata en erreur).
// okhttp-android 5.4.0 = minCompileSdk 36, même ligne 5.x (la contrainte
// ktor est `requires`, non `strictly` → le downgrade est supporté par la
// résolution Gradle). À retirer lors de la migration AGP 9 + compileSdk 37.
subprojects {
    configurations.all {
        resolutionStrategy {
            force("com.squareup.okhttp3:okhttp:5.4.0")
        }
    }
}
