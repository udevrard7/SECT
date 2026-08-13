// SECT Mobile — Messagerie domain models (pure Kotlin, no serialization coupling)
package com.sect.mobile.shared.domain.model

import com.sect.mobile.shared.domain.enum.ConversationType

data class Conversation(
    val id: String,
    val type: ConversationType,
    val titre: String? = null,
    val etablissementId: String? = null,
    val filiereId: String? = null,
    val epreuveId: String? = null,
    val createdAt: Instant,
    val updatedAt: Instant,
    val participants: List<ConversationParticipant>? = null,
    val lastMessage: Message? = null
)

data class ConversationParticipant(
    val id: String,
    val conversationId: String,
    val userId: String,
    val user: UserRef? = null
)

data class Message(
    val id: String,
    val conversationId: String,
    val expediteurId: String,
    val contenu: String,
    val expediteur: UserRef? = null,
    val createdAt: Instant,
    val updatedAt: Instant
)
