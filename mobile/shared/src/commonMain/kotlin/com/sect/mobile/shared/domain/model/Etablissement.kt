// SECT Mobile — Etablissement domain models (pure Kotlin, no serialization coupling)
package com.sect.mobile.shared.domain.model

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

data class EtablissementCount(
    val filieres: Int,
    val users: Int
)

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

data class AnneeAcademiqueRef(
    val id: String,
    val libelle: String,
    val dateDebut: Instant,
    val dateFin: Instant,
    val actif: Boolean
)
