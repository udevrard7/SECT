// SECT Mobile — Common DTOs (1:1 with backend JSON)
package com.sect.mobile.shared.data.dto

import kotlinx.serialization.Serializable

@Serializable
data class ApiErrorDto(
    val error: String,
    val code: Int? = null,
    val details: String? = null
)

@Serializable
data class PaginatedResultDto<T>(
    val items: List<T>,
    val total: Int,
    val page: Int,
    val limit: Int
)

@Serializable
data class AbonnementDto(
    val id: String,
    val etablissementId: String,
    val planId: String,
    val statut: String,
    val dateDebut: InstantDto,
    val dateFin: InstantDto? = null,
    val createdAt: InstantDto,
    val updatedAt: InstantDto
)
