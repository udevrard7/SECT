// SECT Mobile — Service API Auth (login, refresh, logout, password reset)
package com.sect.mobile.shared.network.api

import com.sect.mobile.shared.domain.model.*
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*

class AuthApi(private val client: HttpClient) {

    /**
     * Login avec email ou matricule.
     * POST /api/auth/login
     */
    suspend fun login(credentials: Credentials): AuthSession {
        return client.post("/api/auth/login") {
            setBody(credentials)
        }.body()
    }

    /**
     * Rafraîchir le JWT access token.
     * POST /api/auth/refresh
     */
    suspend fun refresh(refreshToken: String): AuthSession {
        return client.post("/api/auth/refresh") {
            setBody(mapOf("refreshToken" to refreshToken))
        }.body()
    }

    /**
     * Logout (révoque le refresh token).
     * POST /api/auth/logout
     */
    suspend fun logout(refreshToken: String) {
        client.post("/api/auth/logout") {
            setBody(mapOf("refreshToken" to refreshToken))
        }
    }

    /**
     * Demander un reset de mot de passe.
     * POST /api/auth/password-reset
     */
    suspend fun requestPasswordReset(email: String) {
        client.post("/api/auth/password-reset") {
            setBody(mapOf("email" to email))
        }
    }

    /**
     * Confirmer le reset de mot de passe.
     * POST /api/auth/password-reset/confirm
     */
    suspend fun confirmPasswordReset(token: String, newPassword: String) {
        client.post("/api/auth/password-reset/confirm") {
            setBody(mapOf("token" to token, "newPassword" to newPassword))
        }
    }

    /**
     * Changer le mot de passe (utilisateur connecté).
     * POST /api/auth/change-password
     */
    suspend fun changePassword(currentPassword: String, newPassword: String) {
        client.post("/api/auth/change-password") {
            setBody(mapOf("currentPassword" to currentPassword, "newPassword" to newPassword))
        }
    }

    /**
     * Obtenir l'utilisateur courant.
     * GET /api/me
     */
    suspend fun me(): User {
        return client.get("/api/me").body()
    }

    /**
     * Vérifier un token d'invitation.
     * GET /api/invitations/verify?token=...
     */
    suspend fun verifyInvitation(token: String): Map<String, String> {
        return client.get("/api/invitations/verify") {
            parameter("token", token)
        }.body()
    }

    /**
     * Accepter une invitation.
     * POST /api/invitations/accept
     */
    suspend fun acceptInvitation(token: String, password: String, name: String): AuthSession {
        return client.post("/api/invitations/accept") {
            setBody(mapOf("token" to token, "password" to password, "name" to name))
        }.body()
    }
}
