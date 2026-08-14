// SECT Mobile — Messagerie DTO ↔ Domain mappers
package com.sect.mobile.shared.data.mapper

import com.sect.mobile.shared.data.dto.ConversationDto
import com.sect.mobile.shared.data.dto.ConversationParticipantDto
import com.sect.mobile.shared.data.dto.MessageDto
import com.sect.mobile.shared.data.dto.MessageUserRefDto
import com.sect.mobile.shared.domain.enum.ConversationType
import com.sect.mobile.shared.domain.model.Conversation
import com.sect.mobile.shared.domain.model.ConversationParticipant
import com.sect.mobile.shared.domain.model.Message
import com.sect.mobile.shared.domain.model.UserRef

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
    // expediteurId (DTO nullable, backend userId *string omitempty) → domaine non-null.
    // Pour les messages IA (userId absent), on fallback "" — le compare `== currentUser.id`
    // renvoie false (correct : un message IA n'est jamais "le mien").
    expediteurId = expediteurId ?: "",
    contenu = contenu,
    expediteur = expediteur?.toDomain(),
    createdAt = createdAt,
    // updatedAt absent côté backend (Message n'a que createdAt) → fallback createdAt.
    updatedAt = updatedAt ?: createdAt
)

/**
 * MessageUserRefDto → UserRef : on drop le champ `role` (non présent dans UserRef).
 * Le rôle n'est pas utilisé côté UI messagerie — seul id/name/email le sont.
 */
fun MessageUserRefDto.toDomain() = UserRef(
    id = id,
    name = name,
    email = email
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
    expediteur = expediteur?.toMessageUserRefDto(),
    createdAt = createdAt,
    updatedAt = updatedAt
)

/**
 * UserRef → MessageUserRefDto : le champ `role` n'existe pas dans UserRef, on met
 * une valeur par défaut ("ETUDIANT") — ce sens Domain→DTO n'est utilisé que pour
 * des mocks/tests locaux (jamais envoyé au backend).
 */
fun UserRef.toMessageUserRefDto() = MessageUserRefDto(
    id = id,
    name = name,
    email = email,
    role = "ETUDIANT"
)
