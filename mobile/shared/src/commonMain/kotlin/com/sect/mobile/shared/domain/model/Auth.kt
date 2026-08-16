// SECT Mobile — Auth domain models (pure Kotlin, no serialization coupling)
package com.sect.mobile.shared.domain.model

// Note: typealias Instant = String is currently provided by the legacy Models.kt
// in this same package. When Models.kt is cleaned up, the typealias should be
// moved to a dedicated Time.kt file or restored here.

data class Credentials(
    val identifier: String,
    val password: String
)

data class AuthSession(
    val user: User,
    val accessToken: String,
    val refreshToken: String,
    val expiresAt: Instant
)

data class MultiAccountInfo(
    val userId: String,
    val email: String,
    val name: String,
    val role: String,
    val etablissementId: String,
    val etablissementNom: String
)
