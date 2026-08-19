// SECT Mobile — Epreuve domain models (pure Kotlin, no serialization coupling)
package com.sect.mobile.shared.domain.model

import com.sect.mobile.shared.domain.enum.Difficulte
import com.sect.mobile.shared.domain.enum.ModeGeneration
import com.sect.mobile.shared.domain.enum.SessionExamen
import com.sect.mobile.shared.domain.enum.StatutEpreuve
import com.sect.mobile.shared.domain.enum.TypeQuestion

data class Epreuve(
    val id: String,
    val enseignantId: String,
    val titre: String,
    val description: String? = null,
    val duree: Int,
    val dateDebut: Instant,
    val dateFin: Instant,
    val melangeQuestions: Boolean,
    val melangePropositions: Boolean,
    val blocageRetour: Boolean,
    val statut: StatutEpreuve,
    val filiereId: String? = null,
    val uniteEnseignementId: String? = null,
    val niveau: String? = null,
    val sessionExamen: SessionExamen,
    val anneeAcademiqueId: String? = null,
    val createdAt: Instant,
    val updatedAt: Instant,
    val deletedAt: Instant? = null,
    val proctoringActif: Boolean = false,
    val verificationIdentite: Boolean = false,
    val generationMode: ModeGeneration,
    val isTemplate: Boolean = false,
    val noteTotal: Double = 20.0,
    val clotureeAt: Instant? = null,
    val clotureeAutomatiquement: Boolean = false,
    val raisonCloture: String? = null,
    val delaiGrace: Int = 0,
    val epreuveOrigineId: String? = null,
    val questionCount: Int? = null,
    val totalPoints: Double? = null,
    val enseignant: UserRef? = null,
    val filiere: FiliereRef? = null,
    val questions: List<Question>? = null
)

data class Question(
    val id: String,
    val epreuveId: String,
    val type: TypeQuestion,
    val enonce: String,
    val difficulte: Difficulte? = null,
    val bareme: Double,
    val ordre: Int,
    val propositions: List<Proposition>? = null,
    val theme: String? = null,
    val codeLangage: String? = null,
    val codeStarter: String? = null
)

data class Proposition(
    val id: String,
    val questionId: String,
    val texte: String,
    val estCorrecte: Boolean,
    val ordre: Int
)

// ════════════════════════════════════════════════════════
// SECT-MOBILE-PARITY-T1 : Inputs de création (domain, pure Kotlin)
// Miroir du backend domain.CreateEpreuveInput (Go).
// Les champs requis correspondent aux validations de EpreuveUseCase.Create.
// ════════════════════════════════════════════════════════

/**
 * Input de création d'une épreuve (POST /api/epreuves).
 *
 * Champs requis (validés côté backend) :
 * - enseignantId, titre, duree (>0), dateDebut, dateFin, uniteEnseignementId
 *
 * Le statut est forcé à BROUILLON côté backend (non settable ici).
 * Les dates sont des chaînes ISO (le backend parse en time.Time).
 *
 * @param enseignantId ID de l'enseignant créateur (doit = user connecté pour rôle ENSEIGNANT)
 * @param titre Titre de l'épreuve
 * @param duree Durée en minutes (>0)
 * @param dateDebut ISO datetime (ex: "2026-09-01T08:00:00Z")
 * @param dateFin ISO datetime
 * @param uniteEnseignementId ID de l'UE (requis, non vide)
 * @param description Description optionnelle
 * @param melangeQuestions Mélanger l'ordre des questions (null = false côté DB)
 * @param melangePropositions Mélanger les propositions (null = false)
 * @param blocageRetour Bloquer le retour arrière (null = false)
 * @param filiereId ID de filière optionnel
 * @param niveau Niveau optionnel
 * @param sessionExamen NORMALE | RATTRAPAGE | SPECIALE | EXCEPTIONNELLE | DIFFERE (null = "NORMALE")
 * @param anneeAcademiqueId ID d'année académique optionnel
 * @param generationMode MANUELLE | IA_ASSISTEE (null = "MANUELLE")
 * @param noteTotal Note totale sur 20 par défaut
 * @param delaiGrace Délai de grâce en minutes
 * @param documentIds IDs de documents attachés
 */
data class CreateEpreuveInput(
    val enseignantId: String,
    val titre: String,
    val duree: Int,
    val dateDebut: String,
    val dateFin: String,
    val uniteEnseignementId: String,
    val description: String? = null,
    val melangeQuestions: Boolean? = null,
    val melangePropositions: Boolean? = null,
    val blocageRetour: Boolean? = null,
    val filiereId: String? = null,
    val niveau: String? = null,
    val sessionExamen: String? = null,
    val anneeAcademiqueId: String? = null,
    val generationMode: String? = null,
    val noteTotal: Double? = null,
    val delaiGrace: Int? = null,
    val documentIds: List<String>? = null
)
