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
