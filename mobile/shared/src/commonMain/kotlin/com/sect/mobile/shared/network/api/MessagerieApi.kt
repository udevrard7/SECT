// SECT Mobile — Service API Messagerie
package com.sect.mobile.shared.network.api

import com.sect.mobile.shared.data.dto.*
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.request.*
import io.ktor.http.*

class MessagerieApi(private val client: HttpClient) {

    /**
     * Lister les conversations.
     * GET /api/messagerie/conversations
     */
    suspend fun listConversations(): List<ConversationDto> {
        return client.get("/api/messagerie/conversations").body()
    }

    /**
     * Obtenir une conversation par ID.
     * GET /api/messagerie/conversations/{id}
     */
    suspend fun getConversation(id: String): ConversationDto {
        return client.get("/api/messagerie/conversations/$id").body()
    }

    /**
     * Créer une conversation.
     * POST /api/messagerie/conversations
     */
    suspend fun createConversation(input: Map<String, Any?>): ConversationDto {
        return client.post("/api/messagerie/conversations") {
            setBody(input)
        }.body()
    }

    /**
     * Lister les messages d'une conversation.
     * GET /api/messagerie/conversations/{id}/messages
     */
    suspend fun listMessages(
        conversationId: String,
        before: String? = null,
        limit: Int = 50
    ): List<MessageDto> {
        return client.get("/api/messagerie/conversations/$conversationId/messages") {
            before?.let { parameter("before", it) }
            parameter("limit", limit)
        }.body()
    }

    /**
     * Envoyer un message.
     * POST /api/messagerie/conversations/{id}/messages
     */
    suspend fun sendMessage(conversationId: String, contenu: String): MessageDto {
        return client.post("/api/messagerie/conversations/$conversationId/messages") {
            setBody(mapOf("contenu" to contenu))
        }.body()
    }
}
