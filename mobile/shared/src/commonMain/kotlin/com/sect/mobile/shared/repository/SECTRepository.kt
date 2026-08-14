// SECT Mobile — Repository central (orchestre API + Cache)
package com.sect.mobile.shared.repository

import com.sect.mobile.shared.cache.TokenCache
import com.sect.mobile.shared.domain.model.*
import com.sect.mobile.shared.network.api.*

/**
 * SECTRepository est le point d'entrée unique pour toutes les opérations de données.
 * Il coordonne les appels API et la gestion du cache de tokens.
 *
 * Architecture :
 * - UI (Compose/SwiftUI) → ViewModel → SECTRepository → Api + Cache
 * - Les ViewModels ne connaissent jamais les détails HTTP ou de cache
 *
 * @deprecated Use SECTRepositoryImpl (which implements SECTRepositoryInterface and uses mappers)
 *             instead. This legacy class returns DTOs directly typed as Domain models,
 *             which breaks when DTOs and Domain models diverge.
 *             The iOS KmpRepositoryProvider still references this class and will be
 *             migrated in a follow-up task.
 */
@Deprecated(
    message = "Use SECTRepositoryImpl (implements SECTRepositoryInterface with mappers). " +
             "This class returns DTOs as Domain models without mapping.",
    level = DeprecationLevel.WARNING,
    replaceWith = ReplaceWith(
        "SECTRepositoryImpl(authApi, userApi, epreuveApi, sessionApi, messagerieApi, tokenCache)",
        "com.sect.mobile.shared.data.repository.SECTRepositoryImpl"
    )
)
class SECTRepository(
    private val authApi: AuthApi,
    private val userApi: UserApi,
    private val epreuveApi: EpreuveApi,
    private val sessionApi: SessionApi,
    private val messagerieApi: MessagerieApi,
    private val tokenCache: TokenCache
) {
    // ── Auth ──

    suspend fun login(identifier: String, password: String): AuthSession {
        val session = authApi.login(Credentials(identifier, password))
        tokenCache.saveSession(
            accessToken = session.accessToken,
            refreshToken = session.refreshToken,
            expiresAt = session.expiresAt.toString()
        )
        return session
    }

    suspend fun refreshToken(): AuthSession {
        val rt = tokenCache.getRefreshToken()
        val session = authApi.refresh(rt)
        tokenCache.saveSession(
            accessToken = session.accessToken,
            refreshToken = session.refreshToken,
            expiresAt = session.expiresAt.toString()
        )
        return session
    }

    suspend fun logout() {
        val rt = tokenCache.getRefreshToken()
        try {
            authApi.logout(rt)
        } finally {
            tokenCache.clear()
        }
    }

    suspend fun isAuthenticated(): Boolean = tokenCache.isAuthenticated()

    suspend fun getCurrentUser(): User = authApi.me()

    // ── Users ──

    suspend fun listUsers(
        search: String? = null,
        role: String? = null,
        etablissementId: String? = null,
        page: Int = 1,
        limit: Int = 20
    ): UserListResult = userApi.list(search, role, etablissementId, page, limit)

    suspend fun getUser(id: String): User = userApi.get(id)

    suspend fun createUser(input: CreateUserInput): User = userApi.create(input)

    suspend fun updateUser(id: String, input: Map<String, Any?>): User = userApi.update(id, input)

    suspend fun deleteUser(id: String) = userApi.delete(id)

    // ── Epreuves ──

    suspend fun listEpreuves(
        search: String? = null,
        statut: String? = null,
        filiereId: String? = null,
        page: Int = 1,
        limit: Int = 20
    ): List<Epreuve> = epreuveApi.list(search, statut, filiereId, page, limit)

    suspend fun getEpreuve(id: String): Epreuve = epreuveApi.get(id)

    suspend fun createEpreuve(input: Map<String, Any?>): Epreuve = epreuveApi.create(input)

    suspend fun updateEpreuve(id: String, input: Map<String, Any?>): Epreuve = epreuveApi.update(id, input)

    suspend fun deleteEpreuve(id: String) = epreuveApi.delete(id)

    suspend fun getEpreuveSessions(epreuveId: String): List<SessionPassation> = epreuveApi.sessions(epreuveId)

    // ── Sessions (Passation) ──

    suspend fun startSession(epreuveId: String): SessionPassation = sessionApi.getOrCreate(epreuveId)

    suspend fun submitSession(sessionId: String, reponses: List<Map<String, Any?>>): SessionPassation =
        sessionApi.submit(sessionId, reponses)

    suspend fun saveReponse(sessionId: String, questionId: String, contenu: String) =
        sessionApi.saveReponse(sessionId, questionId, contenu)

    // ── Messagerie ──

    suspend fun listConversations(): List<Conversation> = messagerieApi.listConversations()

    suspend fun getConversation(id: String): Conversation = messagerieApi.getConversation(id)

    suspend fun listMessages(conversationId: String, before: String? = null): List<Message> =
        messagerieApi.listMessages(conversationId, before)

    suspend fun sendMessage(conversationId: String, contenu: String): Message =
        messagerieApi.sendMessage(conversationId, contenu)

    // ── Password Reset ──

    suspend fun requestPasswordReset(email: String) = authApi.requestPasswordReset(email)

    suspend fun confirmPasswordReset(token: String, newPassword: String) =
        authApi.confirmPasswordReset(token, newPassword)

    suspend fun changePassword(currentPassword: String, newPassword: String) =
        authApi.changePassword(currentPassword, newPassword)
}
