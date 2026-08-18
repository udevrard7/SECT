package com.sect.mobile.shared.domain.repository

import com.sect.mobile.shared.domain.model.*

/**
 * Main domain repository interface.
 * Defines all business operations without any data layer coupling.
 */
interface SECTRepositoryInterface : AuthRepository {
    // Users
    suspend fun listUsers(search: String? = null, role: String? = null, etablissementId: String? = null, page: Int = 1, limit: Int = 20): UserListResult
    suspend fun getUser(id: String): User
    suspend fun createUser(input: CreateUserInput): User
    suspend fun updateUser(id: String, input: Map<String, Any?>): User
    suspend fun deleteUser(id: String)

    // Epreuves
    suspend fun listEpreuves(search: String? = null, statut: String? = null, filiereId: String? = null, page: Int = 1, limit: Int = 20): List<Epreuve>
    suspend fun getEpreuve(id: String): Epreuve
    suspend fun createEpreuve(input: Map<String, Any?>): Epreuve
    suspend fun updateEpreuve(id: String, input: Map<String, Any?>): Epreuve
    suspend fun deleteEpreuve(id: String)
    suspend fun getEpreuveSessions(epreuveId: String): List<SessionPassation>

    // Sessions
    suspend fun startSession(epreuveId: String): SessionPassation
    suspend fun submitSession(sessionId: String, reponses: List<Map<String, Any?>>): SubmitResult
    suspend fun saveReponse(sessionId: String, questionId: String, contenu: String)

    // Messagerie
    suspend fun listConversations(): List<Conversation>
    suspend fun getConversation(id: String): Conversation
    suspend fun listMessages(conversationId: String, before: String? = null): List<Message>
    suspend fun sendMessage(conversationId: String, contenu: String): Message
    // SECT-MOBILE-PARITY P1-9 : création conversation direct
    suspend fun createDirectConversation(targetUserId: String): Conversation
    // SECT-MOBILE-PARITY P1-9 : méthodes Messages avancées
    suspend fun markConversationAsRead(conversationId: String)
    suspend fun setConversationMuted(conversationId: String, muted: Boolean)
    suspend fun editMessage(messageId: String, contenu: String): Message
    suspend fun deleteMessage(messageId: String)
    suspend fun signalMessage(messageId: String, raison: String)
    suspend fun toggleReaction(messageId: String, emoji: String)
    suspend fun getOrCreateIAPrivateConversation(): Conversation
    // SECT-MOBILE-PARITY-M1 : endpoints restants
    suspend fun leaveConversation(conversationId: String)
    suspend fun clearConversation(conversationId: String)
    suspend fun hideMessages(messageIds: List<String>)

    // Stats
    suspend fun getStatsEnseignant(): EnseignantStats
    suspend fun getStatsEtudiant(): EtudiantStats
    
    // Resultats & Corrections
    suspend fun getResultatsEtudiant(): List<Resultat>
    // SECT-MOBILE-PARITY-R1 : détail d'un résultat par epreuveId
    suspend fun getResultatDetail(epreuveId: String): ResultatDetail?
    suspend fun getSessionsACorriger(epreuveId: String? = null): List<CorrectionSession>
    suspend fun saveGrade(sessionId: String, questionId: String, score: Double?, commentaire: String?)
    suspend fun finalizeCorrectionSession(sessionId: String)
    suspend fun retournerCorrectionSession(sessionId: String)
    
    // Devoirs & Soumissions
    suspend fun listDevoirs(search: String? = null, statut: String? = null, page: Int = 1, limit: Int = 20): List<Devoir>
    suspend fun getDevoir(id: String): Devoir
    suspend fun createDevoir(titre: String, description: String?, dateLimite: String, pointsMax: Int, fichierUrl: String?): Devoir
    suspend fun updateDevoir(id: String, titre: String, description: String?, dateLimite: String, pointsMax: Int, fichierUrl: String?): Devoir
    suspend fun deleteDevoir(id: String)
    suspend fun getPresignedUrl(fileName: String, contentType: String): PresignedUrl
    suspend fun submitDevoir(devoirId: String, fichierUrl: String, commentaire: String?): Soumission
    suspend fun getSoumission(id: String): Soumission
    suspend fun listSoumissions(devoirId: String): List<Soumission>
    suspend fun noterSoumission(id: String, note: Float, commentaire: String?): Soumission
    // SECT-MOBILE-PARITY P1-8 : Correction IA des devoirs
    suspend fun aiGradeSoumission(soumissionId: String)
}
