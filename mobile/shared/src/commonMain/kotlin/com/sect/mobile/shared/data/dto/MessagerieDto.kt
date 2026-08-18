// SECT Mobile — Messagerie DTOs (1:1 with backend JSON)
package com.sect.mobile.shared.data.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Conversation — backend domain.Conversation (messagerie.go:74-85).
 *
 * Le backend expose une Conversation bare pour GET /api/messagerie/conversations/{id}.
 * Les champs `participants`, `lastMessage`, `epreuveId` sont absents de la bare
 * Conversation (ils ne sont présents que dans ConversationWithMeta, retourné par
 * listConversations). On les garde nullables car `explicitNulls=false` +
 * `ignoreUnknownKeys=true` permettent leur absence.
 *
 * Champs backend additionnels (niveau, createdBy, deletedAt) sont ignorés
 * grâce à `ignoreUnknownKeys=true`.
 */
@Serializable
data class ConversationDto(
    val id: String,
    val type: String,
    val titre: String? = null,
    val etablissementId: String? = null,
    val filiereId: String? = null,
    val epreuveId: String? = null,
    val createdAt: InstantDto,
    val updatedAt: InstantDto,
    val participants: List<ConversationParticipantDto>? = null,
    val lastMessage: MessageDto? = null,
    val unreadCount: Int = 0 // Ajout pour les badges de notifications
)

@Serializable
data class ConversationParticipantDto(
    val id: String,
    val conversationId: String,
    val userId: String,
    val user: UserRefDto? = null
)

/**
 * Message — backend domain.Message (messagerie.go:107-125).
 *
 * Mismatches corrigés (DIAG-1) :
 * - `expediteurId` (required String) → backend `userId: *string` (nullable, omitempty).
 *   On garde le nom Kotlin lisible `expediteurId` avec `@SerialName("userId")` et on
 *   rend le champ nullable. Pour les messages IA (userId absent), expediteurId=null.
 * - `expediteur: UserRefDto?` → backend `user: *MessageUserRef` (avec champ `role`).
 *   On garde le nom Kotlin `expediteur` avec `@SerialName("user")` et on utilise
 *   `MessageUserRefDto` qui contient le champ `role` (absent de UserRefDto).
 * - `updatedAt` (required InstantDto) → ABSENT backend (le Go n'a pas de updatedAt
 *   sur Message, juste createdAt). On rend le champ nullable pour éviter
 *   MissingFieldException.
 * - `isIA`, `contenuHtml`, `replyToId`, `editedAt`, `deletedAt`, `replyTo`,
 *   `attachments`, `reactions` : ignorés via `ignoreUnknownKeys=true`.
 */
@Serializable
data class MessageDto(
    val id: String,
    val conversationId: String,
    @SerialName("userId") val expediteurId: String? = null,
    val contenu: String,
    @SerialName("user") val expediteur: MessageUserRefDto? = null,
    val createdAt: InstantDto,
    val updatedAt: InstantDto? = null,
    // SECT-MOBILE-PARITY P1-10/M1 : champs enrichis du backend
    val isIA: Boolean = false,
    val contenuHtml: String? = null,
    val replyToId: String? = null,
    val editedAt: String? = null,
    val deletedAt: String? = null,
    val attachments: List<MessageAttachmentDto>? = null,
    val reactions: List<ReactionSummaryDto>? = null
)

/**
 * MessageUserRefDto — backend domain.MessageUserRef (messagerie.go:128-133).
 * Équivalent de UserRefDto avec un champ `role` additionnel.
 */
@Serializable
data class MessageUserRefDto(
    val id: String,
    val name: String,
    val email: String,
    val role: String
)

/**
 * SECT-MOBILE-PARITY M1 : ReactionSummary DTO
 * Miroir du backend domain.ReactionSummary (messagerie.go).
 * Agrégation par émoji (1 summary par émoji, pas 1 par utilisateur).
 */
@Serializable
data class ReactionSummaryDto(
    val emoji: String = "",
    val count: Int = 0,
    val userIds: List<String> = emptyList(),
    val reactedByMe: Boolean = false
)

/**
 * SECT-MOBILE-PARITY M1 : MessageAttachment DTO
 * Miroir du backend domain.MessageAttachment (messagerie.go).
 */
@Serializable
data class MessageAttachmentDto(
    val id: String = "",
    val messageId: String = "",
    val type: String = "",
    val url: String = "",
    val filename: String = "",
    val mimeType: String = "",
    val size: Int = 0,
    val createdAt: String? = null
)

// ── Response wrappers (le backend Go retourne des objets wrappés) ──

/**
 * Réponse de GET /api/messagerie/conversations : { conversations: [...], total: N }
 * (backend domain.ConversationListResult, messagerie.go:201-204)
 */
@Serializable
data class ConversationListResultDto(
    val conversations: List<ConversationDto> = emptyList(),
    val total: Int = 0
)

/**
 * Réponse de GET /api/messagerie/conversations/{id}/messages :
 * { messages: [...], nextCursor?: "...", hasMore: BOOL }
 * (backend domain.MessageListResult, messagerie.go:208-212)
 *
 * Le paramètre de pagination côté backend est `cursor` (et non `before`).
 */
@Serializable
data class MessageListResultDto(
    val messages: List<MessageDto> = emptyList(),
    val nextCursor: String? = null,
    val hasMore: Boolean = false
)
