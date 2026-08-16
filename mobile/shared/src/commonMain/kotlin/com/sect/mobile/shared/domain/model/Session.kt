// SECT Mobile — Session domain models (pure Kotlin, no serialization coupling)
package com.sect.mobile.shared.domain.model

import com.sect.mobile.shared.domain.enum.StatutSession

data class SessionPassation(
    val id: String,
    val etudiantId: String,
    val epreuveId: String,
    val statut: StatutSession,
    val dateDebut: Instant? = null,
    val dateSoumission: Instant? = null,
    val tempsRestant: Int? = null,
    val note: Double? = null,
    val penaliteProctoring: Double? = null,
    val proctoringAlerts: Int = 0,
    val createdAt: Instant,
    val updatedAt: Instant,
    val epreuve: Epreuve? = null,
    val reponses: List<Reponse>? = null
)

data class Reponse(
    val id: String,
    val sessionId: String,
    val questionId: String,
    val contenu: String? = null,
    val note: Double? = null,
    val noteAi: Double? = null,
    val feedbackAi: String? = null,
    val createdAt: Instant,
    val updatedAt: Instant
)

/**
 * SubmitResult — résultat de la soumission d'une session.
 * Domain model (mirroir du DTO SubmitResultDto / backend domain.SubmitResult, session.go:201-216).
 *
 * Contient la session mise à jour + métriques de scoring (score, scénario A/B,
 * pendingCorrection, etc.). Utilisé par PassationViewModel pour afficher le
 * résultat de la soumission.
 */
data class SubmitResult(
    val session: SessionPassation? = null,
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
