// SECT Mobile — Session DTOs (1:1 with backend JSON)
package com.sect.mobile.shared.data.dto

import kotlinx.serialization.Serializable

/**
 * SessionPassation — backend domain.SessionPassation (session.go:43-69).
 *
 * Mismatches corrigés (DIAG-1) :
 * - `note: Double?` → backend `score: *float64` (omitempty). Renommé `score`.
 * - `dateSoumission: InstantDto?` → backend `dateFin: *time.Time` (omitempty). Renommé `dateFin`.
 * - `penaliteProctoring: Double?` → backend `penalite: float64` (NON omitempty, toujours
 *   présent, défaut 0). Renommé `penalite`.
 * - `proctoringAlerts: Int` → backend `alertes: int` (NON omitempty, défaut 0). Renommé `alertes`.
 * - `tempsRestant` : ABSENT backend (champ dérivé côté frontend uniquement).
 *   Gardé nullable + default null pour préserver la signature iOS qui l'utilise
 *   (sera toujours null côté backend → fallback epreuve.duree*60 côté iOS).
 *
 * Domain model (SessionPassation) inchangé : le mapper fait la conversion
 * dto.score → domain.note, dto.dateFin → domain.dateSoumission, etc.
 */
@Serializable
data class SessionPassationDto(
    val id: String,
    val etudiantId: String,
    val epreuveId: String,
    val statut: String,
    val dateDebut: InstantDto? = null,
    val dateFin: InstantDto? = null,
    val tempsRestant: Int? = null,
    val score: Double? = null,
    val penalite: Double = 0.0,
    val alertes: Int = 0,
    val createdAt: InstantDto,
    val updatedAt: InstantDto,
    val epreuve: EpreuveDto? = null,
    val reponses: List<ReponseDto>? = null
)

/**
 * Reponse — backend domain.Reponse (session.go:110-119).
 *
 * Mismatches corrigés (DIAG-1) :
 * - `note: Double?` → backend `score: *float64` (omitempty). Renommé `score`.
 * - `noteAi: Double?` → backend `noteIA: *float64` (casing IA vs Ai). Renommé `noteIA`.
 * - `feedbackAi: String?` → backend `justificationIA: *string` (omitempty). Renommé `justificationIA`.
 * - `createdAt` / `updatedAt` : ABSENTS backend (le Go n'a pas ces champs sur Reponse).
 *   Rendus nullables pour éviter MissingFieldException.
 *
 * Domain model (Reponse) inchangé : le mapper fait la conversion
 * dto.score → domain.note, dto.noteIA → domain.noteAi, dto.justificationIA → domain.feedbackAi.
 */
@Serializable
data class ReponseDto(
    val id: String,
    val sessionId: String,
    val questionId: String,
    val contenu: String? = null,
    val score: Double? = null,
    val noteIA: Double? = null,
    val justificationIA: String? = null,
    val createdAt: InstantDto? = null,
    val updatedAt: InstantDto? = null
)

// ── Response wrappers (le backend Go retourne des objets wrappés) ──

/**
 * Body pour POST /api/sessions — backend domain.StartSessionInput
 * (session.go:139-142).
 *
 * Le backend ignore `etudiantId` du body et utilise claims.UserID du JWT
 * (anti-spoofing). On envoie donc "" pour etudiantId.
 */
@Serializable
data class StartSessionInputDto(
    val etudiantId: String = "",
    val epreuveId: String
)

/**
 * Réponse de POST /api/sessions (startSession, session_handlers.go:69-128) :
 * { session: {...}, resumed: BOOL, epreuve: { questions: [...] } }
 */
@Serializable
data class StartSessionResponseDto(
    val session: SessionPassationDto,
    val resumed: Boolean = false,
    val epreuve: EpreuveQuestionsWrapperDto? = null
)

/** Wrapper autour de la liste des questions dans StartSessionResponseDto. */
@Serializable
data class EpreuveQuestionsWrapperDto(
    val questions: List<QuestionDto> = emptyList()
)

/**
 * Body pour POST /api/sessions/{id}/submit — backend domain.SubmitSessionInput
 * (session.go:144-148).
 *
 * Reponses : Map<String, String> (clé = questionId, valeur = contenu).
 */
@Serializable
data class SubmitSessionInputDto(
    val autoSubmit: Boolean = false,
    val reponses: Map<String, String> = emptyMap()
)

/**
 * Réponse de POST /api/sessions/{id}/submit — backend domain.SubmitResult
 * (session.go:201-216, retournée par session_handlers.go:277 submitSession).
 *
 * Le backend retourne un objet complexe (et non un bare SessionPassation).
 */
@Serializable
data class SubmitResultDto(
    val session: SessionPassationDto? = null,
    val score: Double = 0.0,
    val rawScore: Double = 0.0,
    val penalite: Double = 0.0,
    val totalPossible: Double = 0.0,
    val autoGradableTotal: Double = 0.0,
    val percentage: Int = 0,
    val autoGraded: Int = 0,
    val pendingCorrection: Int = 0,
    val scenario: String = "",
    val scenarioMessage: String = "",
    val message: String = ""
)
