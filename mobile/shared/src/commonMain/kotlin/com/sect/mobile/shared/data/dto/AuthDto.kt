// SECT Mobile — Auth DTOs (1:1 with backend JSON)
package com.sect.mobile.shared.data.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

typealias InstantDto = String

@Serializable
data class CredentialsDto(
    val identifier: String,
    val password: String
)

@Serializable
data class AuthSessionDto(
    val user: UserDto,
    val accessToken: String,
    val refreshToken: String,
    val expiresAt: InstantDto
)

@Serializable
data class MultiAccountInfoDto(
    val userId: String,
    val email: String,
    val name: String,
    val role: String,
    val etablissementId: String,
    val etablissementNom: String
)
