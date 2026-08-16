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
