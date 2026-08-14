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
     *
     * Réponse backend : { conversations: [...], total: N }
     * (messagerie.go:201 ConversationListResult). On désérialise via le wrapper
     * puis on renvoie uniquement la liste.
     */
    suspend fun listConversations(): List<ConversationDto> {
        val response: ConversationListResultDto = client.get("/api/messagerie/conversations").body()
        return response.conversations
    }

    /**
     * Obtenir une conversation par ID.
     * GET /api/messagerie/conversations/{id}
     *
     * Réponse backend : bare Conversation (messagerie.go:71). Les champs
     * participants/lastMessage/epreuveId seront null (absents de la bare Conversation)
     * — acceptable, ils sont déjà nullable dans le DTO.
     */
    suspend fun getConversation(id: String): ConversationDto {
        return client.get("/api/messagerie/conversations/$id").body()
    }

    /**
     * Créer une conversation DIRECT (1-à-1).
     * POST /api/messagerie/conversations/direct
     *
     * Body attendu par le backend (CreateDirectConversationInput, messagerie.go:228-231) :
     * { targetUserId: "...", titre?: "..." }
     *
     * Réponse backend : bare Conversation (messagerie.go:111 createDirect).
     *
     * Note : le backend n'expose PAS POST /api/messagerie/conversations —
     * seul `/conversations/direct` (et `/conversations/ia-private`) existent.
     */
    suspend fun createConversation(input: Map<String, Any?>): ConversationDto {
        return client.post("/api/messagerie/conversations/direct") {
            setBody(input)
        }.body()
    }

    /**
     * Lister les messages d'une conversation.
     * GET /api/messagerie/conversations/{id}/messages
     *
     * Réponse backend : { messages: [...], nextCursor?: "...", hasMore: BOOL }
     * (messagerie.go:208 MessageListResult).
     *
     * Pagination : le backend attend le paramètre query `cursor` (et non `before`).
     * On garde le paramètre Kotlin `before` (préserve la signature publique) mais
     * on l'envoie au backend sous le nom `cursor`.
     */
    suspend fun listMessages(
        conversationId: String,
        before: String? = null,
        limit: Int = 50
    ): List<MessageDto> {
        val response: MessageListResultDto = client.get("/api/messagerie/conversations/$conversationId/messages") {
            before?.let { parameter("cursor", it) }
            parameter("limit", limit)
        }.body()
        return response.messages
    }

    /**
     * Envoyer un message.
     * POST /api/messagerie/conversations/{id}/messages
     *
     * Réponse backend : bare Message (messagerie.go:169 sendMessage).
     */
    suspend fun sendMessage(conversationId: String, contenu: String): MessageDto {
        return client.post("/api/messagerie/conversations/$conversationId/messages") {
            setBody(mapOf("contenu" to contenu))
        }.body()
    }
}
