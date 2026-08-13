// SECT Mobile — Session DTO ↔ Domain mappers
package com.sect.mobile.shared.data.mapper

import com.sect.mobile.shared.data.dto.ReponseDto
import com.sect.mobile.shared.data.dto.SessionPassationDto
import com.sect.mobile.shared.domain.enum.StatutSession
import com.sect.mobile.shared.domain.model.Reponse
import com.sect.mobile.shared.domain.model.SessionPassation

// ── DTO → Domain ──

fun SessionPassationDto.toDomain() = SessionPassation(
    id = id,
    etudiantId = etudiantId,
    epreuveId = epreuveId,
    statut = StatutSession.valueOf(statut),
    dateDebut = dateDebut,
    dateSoumission = dateSoumission,
    tempsRestant = tempsRestant,
    note = note,
    penaliteProctoring = penaliteProctoring,
    proctoringAlerts = proctoringAlerts,
    createdAt = createdAt,
    updatedAt = updatedAt,
    epreuve = epreuve?.toDomain(),
    reponses = reponses?.map { it.toDomain() }
)

fun ReponseDto.toDomain() = Reponse(
    id = id,
    sessionId = sessionId,
    questionId = questionId,
    contenu = contenu,
    note = note,
    noteAi = noteAi,
    feedbackAi = feedbackAi,
    createdAt = createdAt,
    updatedAt = updatedAt
)

// ── Domain → DTO ──

fun SessionPassation.toDto() = SessionPassationDto(
    id = id,
    etudiantId = etudiantId,
    epreuveId = epreuveId,
    statut = statut.name,
    dateDebut = dateDebut,
    dateSoumission = dateSoumission,
    tempsRestant = tempsRestant,
    note = note,
    penaliteProctoring = penaliteProctoring,
    proctoringAlerts = proctoringAlerts,
    createdAt = createdAt,
    updatedAt = updatedAt,
    epreuve = epreuve?.toDto(),
    reponses = reponses?.map { it.toDto() }
)

fun Reponse.toDto() = ReponseDto(
    id = id,
    sessionId = sessionId,
    questionId = questionId,
    contenu = contenu,
    note = note,
    noteAi = noteAi,
    feedbackAi = feedbackAi,
    createdAt = createdAt,
    updatedAt = updatedAt
)
