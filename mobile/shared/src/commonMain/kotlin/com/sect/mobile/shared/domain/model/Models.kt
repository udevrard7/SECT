// SECT Mobile — Modèles de données partagés (DTOs correspondant aux réponses Go)
package com.sect.mobile.shared.domain.model

import com.sect.mobile.shared.domain.enum.*
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// Type alias pour les dates — le backend Go envoie des ISO-8601 strings
// kotlinx-datetime Instant nécessite un serializer custom; on utilise String pour la compat JSON
typealias Instant = String

// ──────────────────────────────────────────
// Auth
// ──────────────────────────────────────────

@Serializable
data class Credentials(
    val identifier: String,  // email ou matricule
    val password: String
)

@Serializable
data class AuthSession(
    val user: User,
    val accessToken: String,
    val refreshToken: String,
    val expiresAt: Instant
)

@Serializable
data class MultiAccountInfo(
    val userId: String,
    val email: String,
    val name: String,
    val role: String,
    val etablissementId: String,
    val etablissementNom: String
)

// ──────────────────────────────────────────
// User
// ──────────────────────────────────────────

@Serializable
data class User(
    val id: String,
    val email: String,
    val name: String,
    val role: Role,
    @SerialName("etablissementId") val etablissementId: String? = null,
    @SerialName("filiereId") val filiereId: String? = null,
    val image: String? = null,
    val actif: Boolean = true,
    val mustChangePwd: Boolean = false,
    val matricule: String? = null,
    val niveau: String? = null,
    val derniereConnexion: Instant? = null,
    val createdAt: Instant,
    val updatedAt: Instant,
    val deletedAt: Instant? = null,
    val etablissement: EtablissementRef? = null,
    val filiere: FiliereRef? = null
)

@Serializable
data class EtablissementRef(
    val id: String,
    val nom: String,
    val type: String? = null,
    val matriculeRegex: String? = null,
    val matriculeFormat: String? = null,
    val matriculeExample: String? = null
)

@Serializable
data class FiliereRef(
    val id: String,
    val nom: String,
    val code: String
)

@Serializable
data class UserRef(
    val id: String,
    val name: String,
    val email: String
)

@Serializable
data class UserListResult(
    val users: List<User>,
    val total: Int,
    val page: Int,
    val limit: Int
)

@Serializable
data class CreateUserInput(
    val name: String,
    val email: String,
    val password: String,
    val role: Role,
    val etablissementId: String? = null,
    val filiereId: String? = null,
    val actif: Boolean? = null,
    val matricule: String? = null,
    val niveau: String? = null,
    val mustChangePwd: Boolean? = null
)

// ──────────────────────────────────────────
// Etablissement
// ──────────────────────────────────────────

@Serializable
data class Etablissement(
    val id: String,
    val nom: String,
    val type: String? = null,
    val ville: String? = null,
    val pays: String,
    val adresse: String? = null,
    val telephone: String? = null,
    val email: String? = null,
    val siteWeb: String? = null,
    val logo: String? = null,
    val actif: Boolean = true,
    val exempleMatricule: String? = null,
    val formatMatricule: String? = null,
    val regexMatricule: String? = null,
    val certWatermarkText: String? = null,
    val certWatermarkEnabled: Boolean = false,
    val certWatermarkOpacity: Double = 0.0,
    val createdAt: Instant,
    val updatedAt: Instant,
    val anneeAcademiqueCouranteId: String? = null,
    val anneeCourante: AnneeAcademiqueRef? = null,
    val count: EtablissementCount? = null,
    val filieres: List<FiliereRef>? = null
)

@Serializable
data class EtablissementCount(
    val filieres: Int,
    val users: Int
)

// ──────────────────────────────────────────
// Annee Academique
// ──────────────────────────────────────────

@Serializable
data class AnneeAcademique(
    val id: String,
    val libelle: String,
    val dateDebut: Instant,
    val dateFin: Instant,
    val etablissementId: String,
    val actif: Boolean,
    val createdAt: Instant,
    val updatedAt: Instant
)

@Serializable
data class AnneeAcademiqueRef(
    val id: String,
    val libelle: String,
    val dateDebut: Instant,
    val dateFin: Instant,
    val actif: Boolean
)

// ──────────────────────────────────────────
// Filiere
// ──────────────────────────────────────────

@Serializable
data class Filiere(
    val id: String,
    val nom: String,
    val code: String? = null,
    val etablissementId: String,
    val responsableId: String? = null,
    val description: String? = null,
    val nbEtudiants: Int? = null,
    val actif: Boolean = true,
    val createdAt: Instant,
    val updatedAt: Instant,
    val etablissement: EtablissementRef? = null,
    val responsable: UserRef? = null
)

// ──────────────────────────────────────────
// UniteEnseignement
// ──────────────────────────────────────────

@Serializable
data class UniteEnseignement(
    val id: String,
    val code: String,
    val nom: String,
    val description: String? = null,
    val filiereId: String,
    val niveau: String,
    val semestre: Int? = null,
    val creditsECTS: Int? = null,
    val volumeHeuresCM: Int,
    val volumeHeuresTD: Int,
    val volumeHeuresTP: Int,
    val obligatoire: Boolean,
    val actif: Boolean,
    val createdAt: Instant,
    val updatedAt: Instant,
    val filiere: FiliereRef? = null
)

// ──────────────────────────────────────────
// Epreuve
// ──────────────────────────────────────────

@Serializable
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

@Serializable
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

@Serializable
data class Proposition(
    val id: String,
    val questionId: String,
    val texte: String,
    val estCorrecte: Boolean,
    val ordre: Int
)

// ──────────────────────────────────────────
// SessionPassation
// ──────────────────────────────────────────

@Serializable
data class SessionPassation(
    val id: String,
    val etudiantId: String,
    val epreuveId: String,
    val statut: StatutSession,
    val dateDebut: Instant? = null,
    val dateSoumission: Instant? = null,
    val tempsRestant: Int? = null,
    val note: Double? = null,
    val penaliteProctoring: Double? = null,
    val proctoringAlerts: Int = 0,
    val createdAt: Instant,
    val updatedAt: Instant,
    val epreuve: Epreuve? = null,
    val reponses: List<Reponse>? = null
)

@Serializable
data class Reponse(
    val id: String,
    val sessionId: String,
    val questionId: String,
    val contenu: String? = null,
    val note: Double? = null,
    val noteAi: Double? = null,
    val feedbackAi: String? = null,
    val createdAt: Instant,
    val updatedAt: Instant
)

// ──────────────────────────────────────────
// Messagerie
// ──────────────────────────────────────────

@Serializable
data class Conversation(
    val id: String,
    val type: ConversationType,
    val titre: String? = null,
    val etablissementId: String? = null,
    val filiereId: String? = null,
    val epreuveId: String? = null,
    val createdAt: Instant,
    val updatedAt: Instant,
    val participants: List<ConversationParticipant>? = null,
    val lastMessage: Message? = null
)

@Serializable
data class ConversationParticipant(
    val id: String,
    val conversationId: String,
    val userId: String,
    val user: UserRef? = null
)

@Serializable
data class Message(
    val id: String,
    val conversationId: String,
    val expediteurId: String,
    val contenu: String,
    val expediteur: UserRef? = null,
    val createdAt: Instant,
    val updatedAt: Instant
)

// ──────────────────────────────────────────
// Abonnement / SaaS
// ──────────────────────────────────────────

@Serializable
data class Abonnement(
    val id: String,
    val etablissementId: String,
    val planId: String,
    val statut: StatutAbonnement,
    val dateDebut: Instant,
    val dateFin: Instant? = null,
    val createdAt: Instant,
    val updatedAt: Instant
)

// ──────────────────────────────────────────
// API Error
// ──────────────────────────────────────────

@Serializable
data class ApiError(
    val error: String,
    val code: Int? = null,
    val details: String? = null
)

// ──────────────────────────────────────────
// Paginated Result générique
// ──────────────────────────────────────────

@Serializable
data class PaginatedResult<T>(
    val items: List<T>,
    val total: Int,
    val page: Int,
    val limit: Int
)
