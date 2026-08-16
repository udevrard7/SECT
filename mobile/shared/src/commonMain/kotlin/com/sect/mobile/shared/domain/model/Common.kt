// SECT Mobile — Common domain models (pure Kotlin, no serialization coupling)
package com.sect.mobile.shared.domain.model

import com.sect.mobile.shared.domain.enum.StatutAbonnement

data class ApiError(
    val error: String,
    val code: Int? = null,
    val details: String? = null
)

data class PaginatedResult<T>(
    val items: List<T>,
    val total: Int,
    val page: Int,
    val limit: Int
)

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
