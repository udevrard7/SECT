// SECT Mobile — Root Gradle build configuration
plugins {
    kotlin("multiplatform") version "2.1.21" apply false
    kotlin("android") version "2.1.21" apply false
    id("com.android.application") version "8.11.0" apply false
    id("com.android.library") version "8.11.0" apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "2.1.21" apply false
    id("org.jetbrains.compose") version "1.8.2" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.1.21" apply false
    id("app.cash.sqldelight") version "2.0.2" apply false
    id("com.google.gms.google-services") version "4.4.2" apply false
}
