// SECT Mobile — Correction domain models (pure Kotlin, no serialization coupling)
package com.sect.mobile.shared.domain.model

/**
 * Session à corriger par un enseignant.
 * Domain model miroir de CorrectionSessionDto (backend domain.CorrectionSession).
 *
 * Source : GET /api/correction → { sessions: [CorrectionSessionDto] }
 */
data class CorrectionSession(
    val id: String,
    val etudiantId: String,
    val etudiant: CorrectionEtudiant?,
    val etudiantNom: String,
    val etudiantEmail: String,
    val epreuveId: String,
    val epreuveTitre: String,
    val statut: String,             // SOUMISE | CORRIGEE | RETOURNEE
    val dateFin: String?,           // ISO datetime
    val score: Double?,             // score final si déjà calculé
    val reponses: List<CorrectionReponse>,
    val alertes: Int,               // nb alertes proctoring
    val needsCorrectionCount: Int,  // réponses sans note
    val allCorrected: Boolean,
    val autoGradedScore: Double,    // QCU/QCM auto-corrigés
    val autoGradedTotal: Double,
    val resultat: CorrectionResultat?,
    val epreuve: CorrectionEpreuve?
)

data class CorrectionEtudiant(
    val id: String,
    val name: String,
    val email: String
)

data class CorrectionReponse(
    val id: String,
    val questionId: String,
    val contenu: String?,           // réponse de l'étudiant
    val score: Double?,             // note attribuée (null = non noté)
    val commentaire: String?,       // feedback enseignant
    val noteIA: Double?,            // suggestion IA
    val justificationIA: String?,   // justification de l'IA
    val statusIA: String?,          // statut correction IA (polling)
    val bareme: Double,             // points max de la question
    val ordre: Int,
    val type: String?,              // QCU | QCM | QRC | CODE
    val enonce: String?
)

data class CorrectionResultat(
    val id: String,
    val scoreFinal: Double,
    val totalPossible: Double?,
    val dateCorrection: String?
)

data class CorrectionEpreuve(
    val id: String,
    val titre: String,
    val questions: List<CorrectionQuestion>
)

data class CorrectionQuestion(
    val id: String,
    val questionId: String,
    val bareme: Double,
    val ordre: Int,
    val type: String?,
    val enonce: String?
)
