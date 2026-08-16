// SECT Mobile — Data-layer implementation of SECTRepositoryInterface
// Orchestrates API calls (returning DTOs) and converts to domain models via mappers.
package com.sect.mobile.shared.data.repository

import com.sect.mobile.shared.cache.TokenCache
import com.sect.mobile.shared.data.dto.CreateDevoirRequest
import com.sect.mobile.shared.data.dto.CredentialsDto
import com.sect.mobile.shared.data.dto.SubmitDevoirRequest
import com.sect.mobile.shared.data.mapper.*
import com.sect.mobile.shared.domain.model.*
import com.sect.mobile.shared.domain.repository.SECTRepositoryInterface
import com.sect.mobile.shared.network.api.AuthApi
import com.sect.mobile.shared.network.api.CorrectionApi
import com.sect.mobile.shared.network.api.DevoirApi
import com.sect.mobile.shared.network.api.EpreuveApi
import com.sect.mobile.shared.network.api.MessagerieApi
import com.sect.mobile.shared.network.api.ResultatsApi
import com.sect.mobile.shared.network.api.SessionApi
import com.sect.mobile.shared.network.api.StatsApi
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
    private val statsApi: StatsApi,
    private val resultatsApi: ResultatsApi,
    private val devoirApi: DevoirApi,
    private val correctionApi: CorrectionApi,
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

    override suspend fun submitSession(sessionId: String, reponses: List<Map<String, Any?>>): SubmitResult =
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

    // ── Stats ──

    override suspend fun getStatsEnseignant(): EnseignantStats =
        statsApi.getStatsEnseignant().toDomain()

    override suspend fun getStatsEtudiant(): EtudiantStats =
        statsApi.getStatsEtudiant().toDomain()

    // ── Resultats & Corrections ──

    override suspend fun getResultatsEtudiant(): List<Resultat> =
        resultatsApi.getResultatsEtudiant().map { it.toDomain() }

    override suspend fun getSessionsACorriger(epreuveId: String?): List<CorrectionSession> =
        correctionApi.getSessions(epreuveId = epreuveId).map { it.toDomain() }

    override suspend fun saveGrade(
        sessionId: String,
        questionId: String,
        score: Double?,
        commentaire: String?
    ) {
        correctionApi.saveGrade(sessionId, questionId, score, commentaire)
    }

    override suspend fun finalizeCorrectionSession(sessionId: String) {
        correctionApi.finalizeSession(sessionId)
    }

    override suspend fun retournerCorrectionSession(sessionId: String) {
        correctionApi.retournerSession(sessionId)
    }
    
    // ── Devoirs & Soumissions ──
    
    override suspend fun listDevoirs(
        search: String?,
        statut: String?,
        page: Int,
        limit: Int
    ): List<Devoir> {
        return devoirApi.list(search, statut, page, limit).map { it.toDomain() }
    }
    
    override suspend fun getDevoir(id: String): Devoir = 
        devoirApi.get(id).toDomain()
    
    override suspend fun createDevoir(
        titre: String,
        description: String?,
        dateLimite: String,
        pointsMax: Int,
        fichierUrl: String?
    ): Devoir {
        val input = CreateDevoirRequest(titre, description, dateLimite, pointsMax, fichierUrl)
        return devoirApi.create(input).toDomain()
    }
    
    override suspend fun updateDevoir(
        id: String,
        titre: String,
        description: String?,
        dateLimite: String,
        pointsMax: Int,
        fichierUrl: String?
    ): Devoir {
        val input = CreateDevoirRequest(titre, description, dateLimite, pointsMax, fichierUrl)
        return devoirApi.update(id, input).toDomain()
    }
    
    override suspend fun deleteDevoir(id: String) = 
        devoirApi.delete(id)
    
    override suspend fun getPresignedUrl(fileName: String, contentType: String): PresignedUrl =
        devoirApi.getPresignedUrl(fileName, contentType).toDomain()
    
    override suspend fun submitDevoir(devoirId: String, fichierUrl: String, commentaire: String?): Soumission {
        val input = SubmitDevoirRequest(devoirId, fichierUrl, commentaire)
        return devoirApi.submitSoumission(input).toDomain()
    }
    
    override suspend fun getSoumission(id: String): Soumission =
        devoirApi.getSoumission(id).toDomain()
    
    override suspend fun listSoumissions(devoirId: String): List<Soumission> =
        devoirApi.listSoumissions(devoirId).map { it.toDomain() }
    
    override suspend fun noterSoumission(id: String, note: Float, commentaire: String?): Soumission =
        devoirApi.noterSoumission(id, note, commentaire).toDomain()
}
