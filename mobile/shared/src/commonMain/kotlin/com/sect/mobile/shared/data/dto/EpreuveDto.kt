// SECT Mobile — Epreuve DTOs (1:1 with backend JSON)
package com.sect.mobile.shared.data.dto

import kotlinx.serialization.Serializable

@Serializable
data class EpreuveDto(
    val id: String,
    val enseignantId: String,
    val titre: String,
    val description: String? = null,
    val duree: Int,
    val dateDebut: InstantDto,
    val dateFin: InstantDto,
    val melangeQuestions: Boolean,
    val melangePropositions: Boolean,
    val blocageRetour: Boolean,
    val statut: String,
    val filiereId: String? = null,
    val uniteEnseignementId: String? = null,
    val niveau: String? = null,
    val sessionExamen: String,
    val anneeAcademiqueId: String? = null,
    val createdAt: InstantDto,
    val updatedAt: InstantDto,
    val deletedAt: InstantDto? = null,
    val proctoringActif: Boolean = false,
    val verificationIdentite: Boolean = false,
    val generationMode: String,
    val isTemplate: Boolean = false,
    val noteTotal: Double = 20.0,
    val clotureeAt: InstantDto? = null,
    val clotureeAutomatiquement: Boolean = false,
    val raisonCloture: String? = null,
    val delaiGrace: Int = 0,
    val epreuveOrigineId: String? = null,
    val questionCount: Int? = null,
    val totalPoints: Double? = null,
    val enseignant: UserRefDto? = null,
    val filiere: FiliereRefDto? = null,
    val questions: List<QuestionDto>? = null
)

@Serializable
data class QuestionDto(
    val id: String,
    val epreuveId: String,
    val type: String,
    val enonce: String,
    val difficulte: String? = null,
    val bareme: Double,
    val ordre: Int,
    val propositions: List<PropositionDto>? = null,
    val theme: String? = null,
    val codeLangage: String? = null,
    val codeStarter: String? = null
)

@Serializable
data class PropositionDto(
    val id: String,
    val questionId: String,
    val texte: String,
    val estCorrecte: Boolean,
    val ordre: Int
)

// ── Response wrappers (le backend Go retourne des objets wrappés, pas des bare arrays) ──

/**
 * Réponse de GET /api/epreuves (list).
 * Le backend retourne { epreuves, filieres, [total, page, limit, totalPages] }.
 * Sans wrapper, la désérialisation en List<EpreuveDto> échoue silencieusement
 * et le dashboard reste vide.
 */
@Serializable
data class EpreuveListResponseDto(
    val epreuves: List<EpreuveDto> = emptyList(),
    val filieres: List<FiliereRefDto> = emptyList(),
    val total: Int? = null,
    val page: Int? = null,
    val limit: Int? = null,
    val totalPages: Int? = null
)

/** Réponse de GET /api/epreuves/{id} : { epreuve: {...} } */
@Serializable
data class EpreuveResponseDto(val epreuve: EpreuveDto)

/** Réponse de POST/PATCH /api/epreuves : { epreuve: {...}, message: "..." } */
@Serializable
data class EpreuveMutationResponseDto(
    val epreuve: EpreuveDto,
    val message: String? = null
)
