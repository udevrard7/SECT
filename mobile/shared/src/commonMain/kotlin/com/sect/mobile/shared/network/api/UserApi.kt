// SECT Mobile — Service API Utilisateurs
package com.sect.mobile.shared.network.api

import com.sect.mobile.shared.data.dto.*
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.request.*
import io.ktor.http.*

class UserApi(private val client: HttpClient) {

    /**
     * Lister les utilisateurs (avec filtres/pagination).
     * GET /api/users
     *
     * Le backend (user_handlers.go:48 listUsers) retourne directement un
     * UserListResult (bare) → pas de wrapper.
     */
    suspend fun list(
        search: String? = null,
        role: String? = null,
        etablissementId: String? = null,
        page: Int = 1,
        limit: Int = 20
    ): UserListResultDto {
        return client.get("/api/users") {
            search?.let { parameter("search", it) }
            role?.let { parameter("role", it) }
            etablissementId?.let { parameter("etablissementId", it) }
            parameter("page", page)
            parameter("limit", limit)
        }.body()
    }

    /**
     * Obtenir un utilisateur par ID.
     * GET /api/users/{id} — réponse wrappée : { user: {...} }
     * (user_handlers.go:115 getUser retourne `{"user": user}`)
     */
    suspend fun get(id: String): UserDto {
        val response: UserResponseDto = client.get("/api/users/$id").body()
        return response.user
    }

    /**
     * Créer un utilisateur.
     * POST /api/users — réponse wrappée : { user: {...}, temporaryPassword?: "..." }
     * (user_handlers.go:158-166 createUser)
     */
    suspend fun create(input: CreateUserInputDto): UserDto {
        val response: CreateUserResponseDto = client.post("/api/users") {
            setBody(input)
        }.body()
        return response.user
    }

    /**
     * Mettre à jour un utilisateur.
     * PATCH /api/users/{id} — réponse wrappée : { user: {...} }
     * (user_handlers.go:212 updateUser retourne `{"user": user}`)
     */
    suspend fun update(id: String, input: Map<String, Any?>): UserDto {
        val response: UserResponseDto = client.patch("/api/users/$id") {
            setBody(input)
        }.body()
        return response.user
    }

    /**
     * Supprimer un utilisateur.
     * DELETE /api/users/{id}
     */
    suspend fun delete(id: String) {
        client.delete("/api/users/$id")
    }

    /**
     * Soft-delete un utilisateur (ADMIN).
     * DELETE /api/users/{id}/soft
     */
    suspend fun softDelete(id: String) {
        client.delete("/api/users/$id/soft")
    }

    /**
     * Réinitialiser le mot de passe d'un utilisateur (ADMIN).
     * POST /api/users/{id}/reset-password
     *
     * Réponse : { message, temporaryPassword, mustChangePassword: BOOL }
     * (user_handlers.go:486-490 resetUserPassword)
     *
     * Note : l'ancienne signature retournait `Map<String, String>` ce qui échouait
     * à désérialiser le booléen `mustChangePassword`. Le DTO typé corrige ce bug.
     */
    suspend fun resetPassword(id: String): ResetPasswordResponseDto {
        return client.post("/api/users/$id/reset-password").body()
    }

    /**
     * Déverrouiller un compte (ADMIN).
     * POST /api/users/{id}/unlock
     */
    suspend fun unlock(id: String) {
        client.post("/api/users/$id/unlock")
    }
}
