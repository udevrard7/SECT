// SECT Mobile — Stats DTOs (Enseignant & Étudiant)
package com.sect.mobile.shared.data.dto

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
    val totalPossible: Double
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
