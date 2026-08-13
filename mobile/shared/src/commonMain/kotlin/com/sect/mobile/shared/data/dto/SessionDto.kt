// SECT Mobile — Session DTOs (1:1 with backend JSON)
package com.sect.mobile.shared.data.dto

import kotlinx.serialization.Serializable

@Serializable
data class SessionPassationDto(
    val id: String,
    val etudiantId: String,
    val epreuveId: String,
    val statut: String,
    val dateDebut: InstantDto? = null,
    val dateSoumission: InstantDto? = null,
    val tempsRestant: Int? = null,
    val note: Double? = null,
    val penaliteProctoring: Double? = null,
    val proctoringAlerts: Int = 0,
    val createdAt: InstantDto,
    val updatedAt: InstantDto,
    val epreuve: EpreuveDto? = null,
    val reponses: List<ReponseDto>? = null
)

@Serializable
data class ReponseDto(
    val id: String,
    val sessionId: String,
    val questionId: String,
    val contenu: String? = null,
    val note: Double? = null,
    val noteAi: Double? = null,
    val feedbackAi: String? = null,
    val createdAt: InstantDto,
    val updatedAt: InstantDto
)
