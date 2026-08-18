// SECT Mobile — ResultatDetail DTOs (Phase R1)
// SECT-MOBILE-PARITY-R1 : contrat pour le détail d'un résultat étudiant.
//
// Utilise les endpoints backend existants (pas de nouvel endpoint) :
// GET /api/resultats?epreuveId=X → Branch B : { sessions: [...], stats: {...} }
//   → sessions contiennent reponses + resultat + epreuve
//
// Le mobile filtre côté client pour trouver la session de l'étudiant connecté
// (le backend force déjà etudiantId = claims.UserID pour le rôle ETUDIANT
// dans listResultats → Branch A si etudiantId fourni, Branch B si epreuveId fourni).
//
// Pour le détail étudiant : GET /api/resultats (sans params) → Branch A
// retourne toutes les sessions de l'étudiant. On filtre par epreuveId côté mobile.
package com.sect.mobile.shared.data.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * DTO pour le détail d'un résultat (Phase R1).
 * Miroir du backend domain.SessionPassation enrichi (avec reponses + resultat + epreuve).
 */
@Serializable
data class ResultatDetailDto(
    @SerialName("id") val id: String = "",
    @SerialName("etudiantId") val etudiantId: String = "",
    @SerialName("epreuveId") val epreuveId: String = "",
    @SerialName("statut") val statut: String = "",
    @SerialName("dateDebut") val dateDebut: String? = null,
    @SerialName("dateFin") val dateFin: String? = null,
    @SerialName("score") val score: Double? = null,
    @SerialName("alertes") val alertes: Int = 0,
    @SerialName("penalite") val penalite: Double = 0.0,
    @SerialName("reponses") val reponses: List<ResultatReponseDto> = emptyList(),
    @SerialName("resultat") val resultat: ResultatFinalDto? = null,
    @SerialName("epreuve") val epreuve: ResultatEpreuveRefDto? = null
)

@Serializable
data class ResultatReponseDto(
    @SerialName("id") val id: String = "",
    @SerialName("questionId") val questionId: String = "",
    @SerialName("contenu") val contenu: String? = null,
    @SerialName("score") val score: Double? = null,
    @SerialName("commentaire") val commentaire: String? = null,
    @SerialName("noteIA") val noteIA: Double? = null,
    @SerialName("justificationIA") val justificationIA: String? = null
)

@Serializable
data class ResultatFinalDto(
    @SerialName("id") val id: String = "",
    @SerialName("sessionId") val sessionId: String = "",
    @SerialName("scoreFinal") val scoreFinal: Double = 0.0,
    @SerialName("totalPossible") val totalPossible: Double = 0.0,
    @SerialName("dateCorrection") val dateCorrection: String? = null,
    @SerialName("dateRetour") val dateRetour: String? = null,
    @SerialName("commentaires") val commentaires: String? = null
)

@Serializable
data class ResultatEpreuveRefDto(
    @SerialName("id") val id: String = "",
    @SerialName("titre") val titre: String = "",
    @SerialName("duree") val duree: Int = 0,
    @SerialName("noteTotal") val noteTotal: Double = 20.0,
    @SerialName("enseignant") val enseignant: ResultatEnseignantRefDto? = null
)

@Serializable
data class ResultatEnseignantRefDto(
    @SerialName("id") val id: String = "",
    @SerialName("name") val name: String = ""
)
