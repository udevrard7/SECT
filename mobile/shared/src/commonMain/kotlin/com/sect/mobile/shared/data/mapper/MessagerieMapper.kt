// SECT Mobile — Messagerie DTO ↔ Domain mappers
package com.sect.mobile.shared.data.mapper

import com.sect.mobile.shared.data.dto.ConversationDto
import com.sect.mobile.shared.data.dto.ConversationParticipantDto
import com.sect.mobile.shared.data.dto.MessageDto
import com.sect.mobile.shared.domain.enum.ConversationType
import com.sect.mobile.shared.domain.model.Conversation
import com.sect.mobile.shared.domain.model.ConversationParticipant
import com.sect.mobile.shared.domain.model.Message

// ── DTO → Domain ──

fun ConversationDto.toDomain() = Conversation(
    id = id,
    type = ConversationType.valueOf(type),
    titre = titre,
    etablissementId = etablissementId,
    filiereId = filiereId,
    epreuveId = epreuveId,
    createdAt = createdAt,
    updatedAt = updatedAt,
    participants = participants?.map { it.toDomain() },
    lastMessage = lastMessage?.toDomain()
)

fun ConversationParticipantDto.toDomain() = ConversationParticipant(
    id = id,
    conversationId = conversationId,
    userId = userId,
    user = user?.toDomain()
)

fun MessageDto.toDomain() = Message(
    id = id,
    conversationId = conversationId,
    expediteurId = expediteurId,
    contenu = contenu,
    expediteur = expediteur?.toDomain(),
    createdAt = createdAt,
    updatedAt = updatedAt
)

// ── Domain → DTO ──

fun Conversation.toDto() = ConversationDto(
    id = id,
    type = type.name,
    titre = titre,
    etablissementId = etablissementId,
    filiereId = filiereId,
    epreuveId = epreuveId,
    createdAt = createdAt,
    updatedAt = updatedAt,
    participants = participants?.map { it.toDto() },
    lastMessage = lastMessage?.toDto()
)

fun ConversationParticipant.toDto() = ConversationParticipantDto(
    id = id,
    conversationId = conversationId,
    userId = userId,
    user = user?.toDto()
)

fun Message.toDto() = MessageDto(
    id = id,
    conversationId = conversationId,
    expediteurId = expediteurId,
    contenu = contenu,
    expediteur = expediteur?.toDto(),
    createdAt = createdAt,
    updatedAt = updatedAt
)
