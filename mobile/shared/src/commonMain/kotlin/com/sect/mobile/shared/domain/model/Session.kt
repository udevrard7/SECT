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
