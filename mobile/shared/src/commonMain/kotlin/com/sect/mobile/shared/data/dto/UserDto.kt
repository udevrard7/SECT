// SECT Mobile — User DTOs (1:1 with backend JSON)
package com.sect.mobile.shared.data.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class UserDto(
    val id: String,
    val email: String,
    val name: String,
    val role: String,
    @SerialName("etablissementId") val etablissementId: String? = null,
    @SerialName("filiereId") val filiereId: String? = null,
    val image: String? = null,
    val actif: Boolean = true,
    val mustChangePwd: Boolean = false,
    val matricule: String? = null,
    val niveau: String? = null,
    val derniereConnexion: InstantDto? = null,
    val createdAt: InstantDto,
    val updatedAt: InstantDto,
    val deletedAt: InstantDto? = null,
    val etablissement: EtablissementRefDto? = null,
    val filiere: FiliereRefDto? = null
)

@Serializable
data class EtablissementRefDto(
    val id: String,
    val nom: String,
    val type: String? = null,
    val matriculeRegex: String? = null,
    val matriculeFormat: String? = null,
    val matriculeExample: String? = null
)

@Serializable
data class FiliereRefDto(
    val id: String,
    val nom: String,
    val code: String
)

@Serializable
data class UserRefDto(
    val id: String,
    val name: String,
    val email: String
)

@Serializable
data class UserListResultDto(
    val users: List<UserDto>,
    val total: Int,
    val page: Int,
    val limit: Int
)

@Serializable
data class CreateUserInputDto(
    val name: String,
    val email: String,
    val password: String,
    val role: String,
    val etablissementId: String? = null,
    val filiereId: String? = null,
    val actif: Boolean? = null,
    val matricule: String? = null,
    val niveau: String? = null,
    val mustChangePwd: Boolean? = null
)

// ── Response wrappers (le backend Go retourne des objets wrappés) ──

/**
 * Réponse de GET /api/users/{id} et PATCH /api/users/{id} : { user: {...} }
 * (user_handlers.go:115 getUser, user_handlers.go:212 updateUser)
 */
@Serializable
data class UserResponseDto(val user: UserDto)

/**
 * Réponse de POST /api/users : { user: {...}, temporaryPassword?: "..." }
 * (user_handlers.go:158-166 createUser — temporaryPassword présent si mdp généré)
 */
@Serializable
data class CreateUserResponseDto(
    val user: UserDto,
    val temporaryPassword: String? = null
)

/**
 * Réponse de POST /api/users/{id}/reset-password :
 * { message, temporaryPassword, mustChangePassword: BOOL }
 * (user_handlers.go:486-490 resetUserPassword)
 *
 * Note : `mustChangePassword` est un booléen, incompatible avec l'ancien
 * `Map<String, String>` qui échouait à le désérialiser.
 */
@Serializable
data class ResetPasswordResponseDto(
    val message: String,
    val temporaryPassword: String,
    val mustChangePassword: Boolean
)
