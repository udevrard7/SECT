package com.sect.mobile.shared.domain.model

data class Devoir(
    val id: String,
    val titre: String,
    val description: String?,
    val dateCreation: String,
    val dateLimite: String,
    val pointsMax: Int,
    val statut: String,
    val fichierUrl: String?,
    val auteur: Auteur?,
    val soumissionUtilisateur: Soumission?
)

data class Soumission(
    val id: String,
    val devoirId: String,
    val etudiantId: String,
    val dateSoumission: String,
    val fichierUrl: String?,
    val commentaire: String?,
    val note: Float?,
    val statut: String,
    val etudiant: Auteur?
)

data class Auteur(
    val id: String,
    val nom: String,
    val prenom: String,
    val email: String?
)

data class PresignedUrl(
    val uploadUrl: String,
    val fileUrl: String,
    val key: String
)

// ════════════════════════════════════════════════════════
// SECT-MOBILE-PARITY-T1 : Input de création de devoir (domain)
// Miroir du backend anonymous struct createDevoir (devoir_handlers.go).
// ════════════════════════════════════════════════════════

/**
 * Input de création d'un devoir (POST /api/devoirs).
 *
 * Champs requis (validés côté backend handler) :
 * - titre, uniteEnseignementId, dateLimite (RFC3339)
 *
 * Rôles autorisés : ENSEIGNANT uniquement.
 * enseignantId : si null, le backend utilise l'ID du caller.
 * Le statut est forcé à BROUILLON côté backend.
 *
 * @param titre Titre du devoir (requis)
 * @param uniteEnseignementId ID de l'UE (requis)
 * @param dateLimite Date limite au format RFC3339 (ex: "2026-12-31T23:59:00Z")
 * @param description Description optionnelle
 * @param consignes Consignes détaillées optionnelles
 * @param enseignantId ID enseignant (null = caller, doit matcher le caller si fourni)
 * @param typeSeance TD | TP | COURS (null = "TD")
 * @param datePublication Date de publication RFC3339 optionnelle (null = non publiée)
 * @param noteMax Note maximale (null = 20.0)
 * @param renduFichiers Descripteur de fichier (single nullable string côté backend)
 * @param soumissionGroupe Soumission en groupe (null = false)
 * @param nbMaxFichiers Nombre max de fichiers (null = 5)
 * @param tailleMaxFichier Taille max en octets (null = 10 Mo)
 * @param anneeUniversitaire Année universitaire (null = "2024-2025")
 */
data class CreateDevoirInput(
    val titre: String,
    val uniteEnseignementId: String,
    val dateLimite: String,
    val description: String? = null,
    val consignes: String? = null,
    val enseignantId: String? = null,
    val typeSeance: String? = null,
    val datePublication: String? = null,
    val noteMax: Double? = null,
    val renduFichiers: String? = null,
    val soumissionGroupe: Boolean? = null,
    val nbMaxFichiers: Int? = null,
    val tailleMaxFichier: Int? = null,
    val anneeUniversitaire: String? = null
)
