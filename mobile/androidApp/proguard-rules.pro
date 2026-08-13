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
