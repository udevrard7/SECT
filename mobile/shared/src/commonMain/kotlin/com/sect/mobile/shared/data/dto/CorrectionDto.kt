package com.sect.mobile.shared.data.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * DTOs pour l'API /api/correction (correction enseignant).
 *
 * Miroir exact du backend Go :
 * - internal/domain/certificat.go (CorrectionSession, CorrectionReponse, etc.)
 * - internal/transport/http/certificat_handlers.go:listCorrectionSessions (GET /api/correction)
 * - internal/transport/http/correction_enhanced_handlers.go:saveGradeOrFinalize
 *   (PATCH /api/correction/{sessionId}/ai-grade)
 *
 * Contrat :
 *   GET /api/correction → { sessions: [CorrectionSessionDto] }
 *   PATCH /api/correction/{sessionId}/ai-grade { questionId, score, commentaire } → save grade
 *   PATCH /api/correction/{sessionId}/ai-grade { finalizeAll: true } → finalize session
 *   POST  /api/correction/{sessionId}/retourner → return copy to student
 */

@Serializable
data class CorrectionSessionDto(
    @SerialName("id") val id: String = "",
    @SerialName("sessionId") val sessionId: String? = null,
    @SerialName("etudiantId") val etudiantId: String = "",
    @SerialName("etudiant") val etudiant: CorrectionEtudiantDto? = null,
    @SerialName("etudiantNom") val etudiantNom: String = "",
    @SerialName("etudiantEmail") val etudiantEmail: String = "",
    @SerialName("epreuveId") val epreuveId: String = "",
    @SerialName("epreuveTitre") val epreuveTitre: String = "",
    @SerialName("statut") val statut: String = "",
    @SerialName("dateFin") val dateFin: String? = null,
    @SerialName("score") val score: Double? = null,
    @SerialName("reponses") val reponses: List<CorrectionReponseDto> = emptyList(),
    @SerialName("alertes") val alertes: Int = 0,
    @SerialName("needsCorrectionCount") val needsCorrectionCount: Int = 0,
    @SerialName("allCorrected") val allCorrected: Boolean = false,
    @SerialName("autoGradedScore") val autoGradedScore: Double = 0.0,
    @SerialName("autoGradedTotal") val autoGradedTotal: Double = 0.0,
    @SerialName("resultat") val resultat: CorrectionResultatDto? = null,
    @SerialName("epreuve") val epreuve: CorrectionEpreuveDto? = null
) {
    /** Le backend renvoie parfois `id` vide et `sessionId` rempli (rétrocompat). */
    val effectiveId: String get() = id.ifEmpty { sessionId ?: "" }
}

@Serializable
data class CorrectionEtudiantDto(
    @SerialName("id") val id: String = "",
    @SerialName("name") val name: String = "",
    @SerialName("email") val email: String = ""
)

@Serializable
data class CorrectionReponseDto(
    @SerialName("id") val id: String = "",
    @SerialName("questionId") val questionId: String = "",
    @SerialName("contenu") val contenu: String? = null,
    @SerialName("score") val score: Double? = null,
    @SerialName("commentaire") val commentaire: String? = null,
    @SerialName("noteIA") val noteIA: Double? = null,
    @SerialName("justificationIA") val justificationIA: String? = null,
    @SerialName("statusIA") val statusIA: String? = null,
    @SerialName("bareme") val bareme: Double = 0.0,
    @SerialName("ordre") val ordre: Int = 0,
    @SerialName("type") val type: String? = null,
    @SerialName("enonce") val enonce: String? = null
)

@Serializable
data class CorrectionResultatDto(
    @SerialName("id") val id: String = "",
    @SerialName("scoreFinal") val scoreFinal: Double = 0.0,
    @SerialName("totalPossible") val totalPossible: Double? = null,
    @SerialName("dateCorrection") val dateCorrection: String? = null
)

@Serializable
data class CorrectionEpreuveDto(
    @SerialName("id") val id: String = "",
    @SerialName("titre") val titre: String = "",
    @SerialName("questions") val questions: List<CorrectionQuestionDto> = emptyList()
)

@Serializable
data class CorrectionQuestionDto(
    @SerialName("id") val id: String = "",
    @SerialName("questionId") val questionId: String = "",
    @SerialName("bareme") val bareme: Double = 0.0,
    @SerialName("ordre") val ordre: Int = 0,
    @SerialName("type") val type: String? = null,
    @SerialName("enonce") val enonce: String? = null
)

/**
 * Body pour PATCH /api/correction/{sessionId}/ai-grade.
 * Deux usages mutuellement exclusifs :
 * - save grade : { questionId, score, commentaire }
 * - finalize   : { finalizeAll: true }
 */
@Serializable
data class SaveGradeInputDto(
    val questionId: String? = null,
    val score: Double? = null,
    val commentaire: String? = null,
    val finalizeAll: Boolean? = null
)
