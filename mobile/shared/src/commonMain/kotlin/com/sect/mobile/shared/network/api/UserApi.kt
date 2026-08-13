// SECT Mobile — Service API Utilisateurs
package com.sect.mobile.shared.network.api

import com.sect.mobile.shared.domain.model.*
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.request.*
import io.ktor.http.*

class UserApi(private val client: HttpClient) {

    /**
     * Lister les utilisateurs (avec filtres/pagination).
     * GET /api/users
     */
    suspend fun list(
        search: String? = null,
        role: String? = null,
        etablissementId: String? = null,
        page: Int = 1,
        limit: Int = 20
    ): UserListResult {
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
     * GET /api/users/{id}
     */
    suspend fun get(id: String): User {
        return client.get("/api/users/$id").body()
    }

    /**
     * Créer un utilisateur.
     * POST /api/users
     */
    suspend fun create(input: CreateUserInput): User {
        return client.post("/api/users") {
            setBody(input)
        }.body()
    }

    /**
     * Mettre à jour un utilisateur.
     * PATCH /api/users/{id}
     */
    suspend fun update(id: String, input: Map<String, Any?>): User {
        return client.patch("/api/users/$id") {
            setBody(input)
        }.body()
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
     */
    suspend fun resetPassword(id: String): Map<String, String> {
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
