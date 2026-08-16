// SECT Mobile — Stats domain models (Enseignant & Étudiant)
package com.sect.mobile.shared.domain.model

/**
 * Statistiques pour le dashboard Enseignant
 * Correspond au contrat backend: /api/stats/enseignant
 */
data class EnseignantStats(
    val nbDocuments: Int = 0,
    val nbQuestionsTotal: Int = 0,
    val nbEpreuves: Int = 0,
    val nbEpreuvesActives: Int = 0,
    val nbCorrectionsEnAttente: Int = 0,
    val pendingCorrections: List<PendingCorrection> = emptyList(),
    val recentEpreuves: List<RecentEpreuve> = emptyList(),
    val performanceParEpreuve: List<PerformanceData> = emptyList(),
    val evolutionMoyennes: List<EvolutionMoyenne> = emptyList(),
    val epreuvesAVenir: List<EpreuveAVenir> = emptyList()
)

/**
 * Correction en attente (session soumise à corriger)
 */
data class PendingCorrection(
    val sessionId: String,
    val etudiantNom: String,
    val etudiantEmail: String,
    val epreuveTitre: String,
    val questionType: String,
    val questionPreview: String,
    val submittedAt: String
)

/**
 * Épreuve récente avec statistiques
 */
data class RecentEpreuve(
    val id: String,
    val titre: String,
    val statut: String,
    val nbParticipants: Int,
    val moyenne: Double? = null,
    val date: String
)

/**
 * Performance par épreuve
 */
data class PerformanceData(
    val titre: String,
    val moyenne: Double,
    val tauxReussite: Double
)

/**
 * Évolution des moyennes dans le temps
 */
data class EvolutionMoyenne(
    val mois: String,
    val moyenne: Double,
    val nbEvaluations: Int
)

/**
 * Épreuve à venir (planifiée ou en cours)
 */
data class EpreuveAVenir(
    val id: String,
    val titre: String,
    val date: String,
    val dateFin: String,
    val duree: Int,
    val statut: String,
    val nbParticipants: Int
)

// ──────────────────────────────────────────────────────────────────────
// STATISTIQUES ÉTUDIANT
// ──────────────────────────────────────────────────────────────────────

/**
 * Statistiques pour le dashboard Étudiant
 * Correspond au contrat backend: /api/stats/etudiant
 */
data class EtudiantStats(
    val nbEpreuvesAVenir: Int = 0,
    val nbEpreuvesTerminees: Int = 0,
    val moyenne: Double = 0.0,
    val meilleureNote: Double = 0.0,
    val epreuvesAVenir: List<EpreuveAVenirEtudiant> = emptyList(),
    val resultatsRecents: List<ResultatRecent> = emptyList(),
    val evolutionScores: List<EvolutionScore> = emptyList(),
    val performanceParType: List<PerformanceType> = emptyList(),
    val sessionEnCours: SessionEnCours? = null
)

/**
 * Épreuve à venir (vue étudiant)
 */
data class EpreuveAVenirEtudiant(
    val id: String,
    val titre: String,
    val date: String,
    val dateFin: String,
    val duree: Int,
    val enseignant: String,
    val nbQuestions: Int,
    val totalPoints: Double
)

/**
 * Résultat récent d'une épreuve
 */
data class ResultatRecent(
    val id: String,
    val epreuveId: String,
    val titre: String,
    val enseignant: String,
    val date: String,
    val score: Double,
    val statut: String,
    val resultat: ResultatDetail? = null
)

/**
 * Détail du résultat (score final / total)
 */
data class ResultatDetail(
    val scoreFinal: Double,
    val totalPossible: Double
)

/**
 * Évolution des scores dans le temps
 */
data class EvolutionScore(
    val titre: String,
    val score: Double,
    val date: String
)

/**
 * Performance par type de question
 */
data class PerformanceType(
    val type: String,
    val moyenne: Double,
    val nbReponses: Int
)

/**
 * Session d'examen en cours
 */
data class SessionEnCours(
    val id: String,
    val epreuveId: String,
    val epreuveTitre: String,
    val dateDebut: String
)
