package com.sect.mobile.shared.data.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class DevoirDto(
    @SerialName("id") val id: String,
    @SerialName("titre") val titre: String,
    @SerialName("description") val description: String?,
    @SerialName("date_creation") val dateCreation: String,
    @SerialName("date_limite") val dateLimite: String,
    @SerialName("points_max") val pointsMax: Int,
    @SerialName("statut") val statut: String, // PUBLIE, ARCHIVE
    @SerialName("fichier_url") val fichierUrl: String?,
    @SerialName("auteur") val auteur: AuteurDto?,
    @SerialName("soumission_utilisateur") val soumissionUtilisateur: SoumissionDto?
)

@Serializable
data class SoumissionDto(
    @SerialName("id") val id: String,
    @SerialName("devoir_id") val devoirId: String,
    @SerialName("etudiant_id") val etudiantId: String,
    @SerialName("date_soumission") val dateSoumission: String,
    @SerialName("fichier_url") val fichierUrl: String?,
    @SerialName("commentaire") val commentaire: String?,
    @SerialName("note") val note: Float?,
    @SerialName("statut") val statut: String, // SOUMIS, CORRIGE, EN_RETARD
    @SerialName("etudiant") val etudiant: AuteurDto?
)

@Serializable
data class CreateDevoirRequest(
    val titre: String,
    val uniteEnseignementId: String,
    val dateLimite: String,
    val description: String? = null,
    val consignes: String? = null,
    val enseignantId: String? = null,
    val typeSeance: String = "TD",
    val datePublication: String? = null,
    val noteMax: Double = 20.0,
    val renduFichiers: String? = null,
    val soumissionGroupe: Boolean = false,
    val nbMaxFichiers: Int = 5,
    val tailleMaxFichier: Int = 10_485_760,
    val anneeUniversitaire: String = "2024-2025"
)

@Serializable
data class SubmitDevoirRequest(
    val devoirId: String,
    val fichierUrl: String,
    val commentaire: String?
)

@Serializable
data class PresignedUrlResponse(
    @SerialName("upload_url") val uploadUrl: String,
    @SerialName("file_url") val fileUrl: String,
    @SerialName("key") val key: String
)

@Serializable
data class AuteurDto(
    @SerialName("id") val id: String,
    @SerialName("nom") val nom: String,
    @SerialName("prenom") val prenom: String,
    @SerialName("email") val email: String?
)
