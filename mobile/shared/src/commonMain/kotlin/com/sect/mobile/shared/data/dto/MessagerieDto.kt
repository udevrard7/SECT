// SECT Mobile — Messagerie DTOs (1:1 with backend JSON)
package com.sect.mobile.shared.data.dto

import kotlinx.serialization.Serializable

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
    val lastMessage: MessageDto? = null
)

@Serializable
data class ConversationParticipantDto(
    val id: String,
    val conversationId: String,
    val userId: String,
    val user: UserRefDto? = null
)

@Serializable
data class MessageDto(
    val id: String,
    val conversationId: String,
    val expediteurId: String,
    val contenu: String,
    val expediteur: UserRefDto? = null,
    val createdAt: InstantDto,
    val updatedAt: InstantDto
)
