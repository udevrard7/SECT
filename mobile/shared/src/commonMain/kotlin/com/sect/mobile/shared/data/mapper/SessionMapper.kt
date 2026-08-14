// SECT Mobile — Session DTO ↔ Domain mappers
package com.sect.mobile.shared.data.mapper

import com.sect.mobile.shared.data.dto.ReponseDto
import com.sect.mobile.shared.data.dto.SessionPassationDto
import com.sect.mobile.shared.data.dto.SubmitResultDto
import com.sect.mobile.shared.domain.enum.StatutSession
import com.sect.mobile.shared.domain.model.Reponse
import com.sect.mobile.shared.domain.model.SessionPassation
import com.sect.mobile.shared.domain.model.SubmitResult

// ── DTO → Domain ──

fun SessionPassationDto.toDomain() = SessionPassation(
    id = id,
    etudiantId = etudiantId,
    epreuveId = epreuveId,
    statut = StatutSession.valueOf(statut),
    dateDebut = dateDebut,
    // DTO `dateFin` (backend) → domaine `dateSoumission` (préserve la signature domaine)
    dateSoumission = dateFin,
    tempsRestant = tempsRestant,
    // DTO `score` (backend) → domaine `note` (préserve la signature domaine)
    note = score,
    // DTO `penalite` (backend) → domaine `penaliteProctoring` (préserve la signature domaine)
    penaliteProctoring = penalite,
    // DTO `alertes` (backend) → domaine `proctoringAlerts` (préserve la signature domaine)
    proctoringAlerts = alertes,
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
    // DTO `score` (backend) → domaine `note`
    note = score,
    // DTO `noteIA` (backend, casing IA) → domaine `noteAi` (préserve la signature domaine)
    noteAi = noteIA,
    // DTO `justificationIA` (backend) → domaine `feedbackAi` (préserve la signature domaine)
    feedbackAi = justificationIA,
    // createdAt/updatedAt absents backend (Reponse n'a pas ces champs côté Go) → fallback null
    createdAt = createdAt ?: "",
    updatedAt = updatedAt ?: ""
)

fun SubmitResultDto.toDomain() = SubmitResult(
    session = session?.toDomain(),
    score = score,
    rawScore = rawScore,
    penalite = penalite,
    totalPossible = totalPossible,
    autoGradableTotal = autoGradableTotal,
    percentage = percentage,
    autoGraded = autoGraded,
    pendingCorrection = pendingCorrection,
    scenario = scenario,
    scenarioMessage = scenarioMessage,
    message = message
)

// ── Domain → DTO ──

fun SessionPassation.toDto() = SessionPassationDto(
    id = id,
    etudiantId = etudiantId,
    epreuveId = epreuveId,
    statut = statut.name,
    dateDebut = dateDebut,
    // Domaine `dateSoumission` → DTO `dateFin` (backend)
    dateFin = dateSoumission,
    tempsRestant = tempsRestant,
    // Domaine `note` → DTO `score` (backend)
    score = note,
    // Domaine `penaliteProctoring` → DTO `penalite` (backend)
    penalite = penaliteProctoring ?: 0.0,
    // Domaine `proctoringAlerts` → DTO `alertes` (backend)
    alertes = proctoringAlerts,
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
    // Domaine `note` → DTO `score` (backend)
    score = note,
    // Domaine `noteAi` → DTO `noteIA` (backend, casing IA)
    noteIA = noteAi,
    // Domaine `feedbackAi` → DTO `justificationIA` (backend)
    justificationIA = feedbackAi,
    createdAt = createdAt,
    updatedAt = updatedAt
)
