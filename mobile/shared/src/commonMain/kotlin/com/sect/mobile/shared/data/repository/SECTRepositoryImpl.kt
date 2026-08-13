// SECT Mobile — Data-layer implementation of SECTRepositoryInterface
// Orchestrates API calls (returning DTOs) and converts to domain models via mappers.
package com.sect.mobile.shared.data.repository

import com.sect.mobile.shared.cache.TokenCache
import com.sect.mobile.shared.data.dto.CredentialsDto
import com.sect.mobile.shared.data.mapper.*
import com.sect.mobile.shared.domain.model.*
import com.sect.mobile.shared.domain.repository.SECTRepositoryInterface
import com.sect.mobile.shared.network.api.AuthApi
import com.sect.mobile.shared.network.api.EpreuveApi
import com.sect.mobile.shared.network.api.MessagerieApi
import com.sect.mobile.shared.network.api.SessionApi
import com.sect.mobile.shared.network.api.UserApi

/**
 * SECTRepositoryImpl is the data-layer implementation of the domain repository interface.
 *
 * Architecture flow:
 *   UI → ViewModel → SECTRepositoryInterface ← SECTRepositoryImpl → API (DTOs) → Mapper → Domain
 *
 * Responsibilities:
 * - Calls APIs which return DTOs (JSON-deserialized objects)
 * - Converts DTOs → Domain models using .toDomain() extension functions
 * - Converts Domain models → DTOs for API inputs using .toDto() extension functions
 * - Manages token cache for authentication state
 */
class SECTRepositoryImpl(
    private val authApi: AuthApi,
    private val userApi: UserApi,
    private val epreuveApi: EpreuveApi,
    private val sessionApi: SessionApi,
    private val messagerieApi: MessagerieApi,
    private val tokenCache: TokenCache
) : SECTRepositoryInterface {

    // ── Auth ──

    override suspend fun login(identifier: String, password: String): AuthSession {
        val dto = authApi.login(CredentialsDto(identifier, password))
        tokenCache.saveSession(dto.accessToken, dto.refreshToken, dto.expiresAt)
        return dto.toDomain()
    }

    override suspend fun refreshToken(): AuthSession {
        val rt = tokenCache.getRefreshToken()
        val dto = authApi.refresh(rt)
        tokenCache.saveSession(dto.accessToken, dto.refreshToken, dto.expiresAt)
        return dto.toDomain()
    }

    override suspend fun logout() {
        val rt = tokenCache.getRefreshToken()
        try { authApi.logout(rt) } finally { tokenCache.clear() }
    }

    override suspend fun isAuthenticated(): Boolean = tokenCache.isAuthenticated()

    override suspend fun getCurrentUser(): User = authApi.me().toDomain()

    // ── Users ──

    override suspend fun listUsers(
        search: String?,
        role: String?,
        etablissementId: String?,
        page: Int,
        limit: Int
    ): UserListResult {
        return userApi.list(search, role, etablissementId, page, limit).toDomain()
    }

    override suspend fun getUser(id: String): User = userApi.get(id).toDomain()

    override suspend fun createUser(input: CreateUserInput): User = userApi.create(input.toDto()).toDomain()

    override suspend fun updateUser(id: String, input: Map<String, Any?>): User = userApi.update(id, input).toDomain()

    override suspend fun deleteUser(id: String) = userApi.delete(id)

    // ── Epreuves ──

    override suspend fun listEpreuves(
        search: String?,
        statut: String?,
        filiereId: String?,
        page: Int,
        limit: Int
    ): List<Epreuve> {
        return epreuveApi.list(search, statut, filiereId, page, limit).map { it.toDomain() }
    }

    override suspend fun getEpreuve(id: String): Epreuve = epreuveApi.get(id).toDomain()

    override suspend fun createEpreuve(input: Map<String, Any?>): Epreuve = epreuveApi.create(input).toDomain()

    override suspend fun updateEpreuve(id: String, input: Map<String, Any?>): Epreuve = epreuveApi.update(id, input).toDomain()

    override suspend fun deleteEpreuve(id: String) = epreuveApi.delete(id)

    override suspend fun getEpreuveSessions(epreuveId: String): List<SessionPassation> {
        return epreuveApi.sessions(epreuveId).map { it.toDomain() }
    }

    // ── Sessions ──

    override suspend fun startSession(epreuveId: String): SessionPassation = sessionApi.getOrCreate(epreuveId).toDomain()

    override suspend fun submitSession(sessionId: String, reponses: List<Map<String, Any?>>): SessionPassation =
        sessionApi.submit(sessionId, reponses).toDomain()

    override suspend fun saveReponse(sessionId: String, questionId: String, contenu: String) =
        sessionApi.saveReponse(sessionId, questionId, contenu)

    // ── Messagerie ──

    override suspend fun listConversations(): List<Conversation> = messagerieApi.listConversations().map { it.toDomain() }

    override suspend fun getConversation(id: String): Conversation = messagerieApi.getConversation(id).toDomain()

    override suspend fun listMessages(conversationId: String, before: String?): List<Message> =
        messagerieApi.listMessages(conversationId, before).map { it.toDomain() }

    override suspend fun sendMessage(conversationId: String, contenu: String): Message =
        messagerieApi.sendMessage(conversationId, contenu).toDomain()

    // ── Password Reset ──

    override suspend fun requestPasswordReset(email: String) = authApi.requestPasswordReset(email)

    override suspend fun confirmPasswordReset(token: String, newPassword: String) =
        authApi.confirmPasswordReset(token, newPassword)

    override suspend fun changePassword(currentPassword: String, newPassword: String) =
        authApi.changePassword(currentPassword, newPassword)
}
