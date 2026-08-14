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
}
