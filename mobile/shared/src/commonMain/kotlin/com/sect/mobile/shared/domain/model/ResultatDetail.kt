// SECT Mobile — ResultatDetail domain models (Phase R1)
// SECT-MOBILE-PARITY-R1 : modèles domain pour le détail d'un résultat.
package com.sect.mobile.shared.domain.model

/**
 * Détail d'un résultat étudiant (Phase R1).
 * Contient les réponses par question + le résultat final + infos épreuve.
 */
data class ResultatDetail(
    val id: String,
    val etudiantId: String,
    val epreuveId: String,
    val statut: String,
    val dateDebut: String?,
    val dateFin: String?,
    val score: Double?,
    val alertes: Int,
    val penalite: Double,
    val reponses: List<ResultatReponse>,
    val resultat: ResultatFinal?,
    val epreuve: ResultatEpreuveRef?
) {
    /** Score final calculé (score - pénalité, ou scoreFinal du resultat). */
    val effectiveScore: Double
        get() = resultat?.scoreFinal ?: (score ?: 0.0)

    /** Score sur 20 (si noteTotal = 20). */
    val scoreOn20: Double
        get() = effectiveScore

    /** Pourcentage (0-100). */
    val pourcentage: Double
        get() = if (resultat?.totalPossible ?: 20.0 > 0)
            (effectiveScore / (resultat?.totalPossible ?: 20.0)) * 100.0
        else 0.0

    /** Est réussi (≥ 50%). */
    val estReussi: Boolean get() = pourcentage >= 50.0

    /** Nombre de réponses. */
    val reponseCount: Int get() = reponses.size

    /** Réponses notées. */
    val reponsesNotees: Int get() = reponses.count { it.score != null }
}

data class ResultatReponse(
    val id: String,
    val questionId: String,
    val contenu: String?,
    val score: Double?,
    val commentaire: String?,
    val noteIA: Double?,
    val justificationIA: String?
)

data class ResultatFinal(
    val id: String,
    val sessionId: String,
    val scoreFinal: Double,
    val totalPossible: Double,
    val dateCorrection: String?,
    val dateRetour: String?,
    val commentaires: String?
)

data class ResultatEpreuveRef(
    val id: String,
    val titre: String,
    val duree: Int,
    val noteTotal: Double,
    val enseignant: ResultatEnseignantRef?
)

data class ResultatEnseignantRef(
    val id: String,
    val name: String
)
