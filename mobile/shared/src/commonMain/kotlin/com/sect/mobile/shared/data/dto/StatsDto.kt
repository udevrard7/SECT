// SECT Mobile — Stats DTOs (Enseignant & Étudiant)
package com.sect.mobile.shared.data.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// ──────────────────────────────────────────────────────────────────────
// DTOs ENSEIGNANT
// ──────────────────────────────────────────────────────────────────────

@Serializable
data class EnseignantStatsDto(
    val nbDocuments: Int = 0,
    val nbQuestionsTotal: Int = 0,
    val nbEpreuves: Int = 0,
    val nbEpreuvesActives: Int = 0,
    val nbCorrectionsEnAttente: Int = 0,
    val pendingCorrections: List<PendingCorrectionDto> = emptyList(),
    val recentEpreuves: List<RecentEpreuveDto> = emptyList(),
    val performanceParEpreuve: List<PerformanceDataDto> = emptyList(),
    val evolutionMoyennes: List<EvolutionMoyenneDto> = emptyList(),
    val epreuvesAVenir: List<EpreuveAVenirDto> = emptyList()
)

@Serializable
data class PendingCorrectionDto(
    val sessionId: String,
    val etudiantNom: String,
    val etudiantEmail: String,
    val epreuveTitre: String,
    val questionType: String,
    val questionPreview: String,
    val submittedAt: String
)

@Serializable
data class RecentEpreuveDto(
    val id: String,
    val titre: String,
    val statut: String,
    val nbParticipants: Int,
    val moyenne: Double? = null,
    val date: String
)

@Serializable
data class PerformanceDataDto(
    val titre: String,
    val moyenne: Double,
    val tauxReussite: Double
)

@Serializable
data class EvolutionMoyenneDto(
    val mois: String,
    val moyenne: Double,
    val nbEvaluations: Int
)

@Serializable
data class EpreuveAVenirDto(
    val id: String,
    val titre: String,
    val date: String,
    val dateFin: String,
    val duree: Int,
    val statut: String,
    val nbParticipants: Int
)

// ──────────────────────────────────────────────────────────────────────
// DTOs ÉTUDIANT
// ──────────────────────────────────────────────────────────────────────

@Serializable
data class EtudiantStatsDto(
    val nbEpreuvesAVenir: Int = 0,
    val nbEpreuvesTerminees: Int = 0,
    val moyenne: Double = 0.0,
    val meilleureNote: Double = 0.0,
    val epreuvesAVenir: List<EpreuveAVenirEtudiantDto> = emptyList(),
    val resultatsRecents: List<ResultatRecentDto> = emptyList(),
    val evolutionScores: List<EvolutionScoreDto> = emptyList(),
    val performanceParType: List<PerformanceTypeDto> = emptyList(),
    val sessionEnCours: SessionEnCoursDto? = null
)

@Serializable
data class EpreuveAVenirEtudiantDto(
    val id: String,
    val titre: String,
    val date: String,
    val dateFin: String,
    val duree: Int,
    val enseignant: String,
    val nbQuestions: Int,
    val totalPoints: Double
)

@Serializable
data class ResultatRecentDto(
    val id: String,
    val epreuveId: String,
    val titre: String,
    val enseignant: String,
    val date: String,
    val score: Double,
    val statut: String,
    val resultat: ResultatDetailDto? = null
)

@Serializable
data class ResultatDetailDto(
    val scoreFinal: Double,
    val totalPossible: Double,
    // SECT-MOBILE-PARITY-R1 : champs enrichis pour le détail
    val id: String = "",
    val sessionId: String = "",
    val dateCorrection: String? = null,
    val dateRetour: String? = null,
    val commentaires: String? = null
)

// ════════════════════════════════════════════════════════
// SECT-MOBILE-PARITY-R2 : Détail par question
// ════════════════════════════════════════════════════════

/**
 * DTO pour une session de passation avec détail (Phase R2).
 * Miroir du backend domain.SessionPassation enrichi.
 *
 * Source : GET /api/resultats?epreuveId=X → { sessions: [...] }
 * Chaque session contient : reponses + resultat + epreuve (avec questions).
 */
@Serializable
data class SessionResultatDto(
    @SerialName("id") val id: String = "",
    @SerialName("etudiantId") val etudiantId: String = "",
    @SerialName("epreuveId") val epreuveId: String = "",
    @SerialName("statut") val statut: String = "",
    @SerialName("dateDebut") val dateDebut: String? = null,
    @SerialName("dateFin") val dateFin: String? = null,
    @SerialName("score") val score: Double? = null,
    @SerialName("alertes") val alertes: Int = 0,
    @SerialName("penalite") val penalite: Double = 0.0,
    @SerialName("reponses") val reponses: List<ReponseDto> = emptyList(),
    @SerialName("resultat") val resultat: ResultatDetailDto? = null,
    @SerialName("epreuve") val epreuve: SessionEpreuveRefDto? = null
)

@Serializable
data class ReponseDto(
    @SerialName("id") val id: String = "",
    @SerialName("questionId") val questionId: String = "",
    @SerialName("contenu") val contenu: String? = null,
    @SerialName("score") val score: Double? = null,
    @SerialName("commentaire") val commentaire: String? = null,
    @SerialName("noteIA") val noteIA: Double? = null,
    @SerialName("justificationIA") val justificationIA: String? = null
)

@Serializable
data class SessionEpreuveRefDto(
    @SerialName("id") val id: String = "",
    @SerialName("titre") val titre: String = "",
    @SerialName("description") val description: String? = null,
    @SerialName("duree") val duree: Int = 0,
    @SerialName("noteTotal") val noteTotal: Double = 20.0,
    @SerialName("enseignant") val enseignant: SessionEnseignantRefDto? = null,
    @SerialName("questions") val questions: List<EpreuveQuestionInfoDto> = emptyList()
)

@Serializable
data class SessionEnseignantRefDto(
    @SerialName("id") val id: String = "",
    @SerialName("name") val name: String = ""
)

@Serializable
data class EpreuveQuestionInfoDto(
    @SerialName("id") val id: String = "",
    @SerialName("questionId") val questionId: String = "",
    @SerialName("bareme") val bareme: Double = 0.0,
    @SerialName("ordre") val ordre: Int = 0,
    @SerialName("question") val question: EpreuveQuestionDetailDto? = null
)

@Serializable
data class EpreuveQuestionDetailDto(
    @SerialName("id") val id: String = "",
    @SerialName("type") val type: String = "",
    @SerialName("enonce") val enonce: String = "",
    @SerialName("difficulte") val difficulte: String? = null
)

@Serializable
data class EvolutionScoreDto(
    val titre: String,
    val score: Double,
    val date: String
)

@Serializable
data class PerformanceTypeDto(
    val type: String,
    val moyenne: Double,
    val nbReponses: Int
)

@Serializable
data class SessionEnCoursDto(
    val id: String,
    val epreuveId: String,
    val epreuveTitre: String,
    val dateDebut: String
)
