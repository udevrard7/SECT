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
    val totalPossible: Double,
    // SECT-MOBILE-PARITY-R1 : champs enrichis
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
 * Session de passation avec détail complet (Phase R2).
 * Contient les réponses de l'étudiant + les infos épreuve/questions.
 */
data class SessionResultat(
    val id: String,
    val etudiantId: String,
    val epreuveId: String,
    val statut: String,
    val dateDebut: String?,
    val dateFin: String?,
    val score: Double?,
    val alertes: Int,
    val penalite: Double,
    val reponses: List<ReponseResultat>,
    val resultat: ResultatDetail?,
    val epreuve: SessionEpreuveRef?
) {
    val effectiveScore: Double get() = resultat?.scoreFinal ?: (score ?: 0.0)
    val pourcentage: Double
        get() = if (resultat?.totalPossible ?: 20.0 > 0)
            (effectiveScore / (resultat?.totalPossible ?: 20.0)) * 100.0 else 0.0
    val estReussi: Boolean get() = pourcentage >= 50.0
}

data class ReponseResultat(
    val id: String,
    val questionId: String,
    val contenu: String?,
    val score: Double?,
    val commentaire: String?,
    val noteIA: Double?,
    val justificationIA: String?
)

data class SessionEpreuveRef(
    val id: String,
    val titre: String,
    val description: String?,
    val duree: Int,
    val noteTotal: Double,
    val enseignant: SessionEnseignantRef?,
    val questions: List<EpreuveQuestionInfo>
)

data class SessionEnseignantRef(
    val id: String,
    val name: String
)

data class EpreuveQuestionInfo(
    val id: String,
    val questionId: String,
    val bareme: Double,
    val ordre: Int,
    val question: EpreuveQuestionDetail?
)

data class EpreuveQuestionDetail(
    val id: String,
    val type: String,
    val enonce: String,
    val difficulte: String?
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
