# SECT Mobile — ProGuard Rules
# Règles de minimisation pour le build Android release

# ── Ktor ──
-keep class io.ktor.** { *; }
-keep class kotlinx.coroutines.** { *; }

# ── Kotlin Serialization ──
-keepattributes *Annotation*, InnerClasses, Signature
-keep class kotlinx.serialization.** { *; }
-dontwarn kotlinx.serialization.**

# ── SECT Shared Models ──
-keep class com.sect.mobile.shared.domain.** { *; }
-keep class com.sect.mobile.shared.network.** { *; }
-keep class com.sect.mobile.shared.repository.** { *; }
-keep class com.sect.mobile.shared.cache.** { *; }

# ── Kotlin Multiplatform ──
-keep class kotlin.** { *; }
-dontwarn kotlin.**

# ── Koin DI ──
-keep class org.koin.** { *; }
-keepclassmembers class * { @org.koin.core.annotation.* <methods>; }
-dontwarn org.koin.**

# ── SQLDelight ──
-keep class app.cash.sqldelight.** { *; }
-keep class com.sect.mobile.shared.database.** { *; }
-dontwarn app.cash.sqldelight.**

# ── Kotlin Coroutines (comprehensive) ──
-keepnames class kotlinx.coroutines.internal.CoroutineExceptionHandlerImpl
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler
-keepclassmembers class kotlinx.coroutines.** {
    volatile <fields>;
}
-dontwarn kotlinx.coroutines.**

# ── Firebase ──
-keepattributes *Annotation*
-keepclassmembers class * {
    @com.google.firebase.annotations.FirebasePublicApi <methods>;
}
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# ── Firebase Tink (crypto) — classes optionnelles non incluses ──
# Tink (utilisé par Firebase pour le chiffrement) référence des classes
# Google API Client qui ne sont pas toujours présentes. R8 échoue sans ces règles.
-dontwarn com.google.api.client.**
-dontwarn com.google.crypto.tink.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# ── Ktor — classes JVM non disponibles sur Android ──
# Ktor debug detector référence java.lang.management.* (JVM only, pas Android)
-dontwarn java.lang.management.**

# ── AndroidX / Jetpack Compose ──
-dontwarn androidx.**
-keep class androidx.compose.** { *; }

# ── Coil (image loading) ──
-keep class coil3.** { *; }
-dontwarn coil3.**
