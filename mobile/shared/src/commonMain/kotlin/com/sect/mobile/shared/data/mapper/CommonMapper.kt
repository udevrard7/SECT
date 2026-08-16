// SECT Mobile — Common DTO ↔ Domain mappers
package com.sect.mobile.shared.data.mapper

import com.sect.mobile.shared.data.dto.AbonnementDto
import com.sect.mobile.shared.data.dto.ApiErrorDto
import com.sect.mobile.shared.data.dto.PaginatedResultDto
import com.sect.mobile.shared.domain.enum.StatutAbonnement
import com.sect.mobile.shared.domain.model.Abonnement
import com.sect.mobile.shared.domain.model.ApiError
import com.sect.mobile.shared.domain.model.PaginatedResult

// ── DTO → Domain ──

fun ApiErrorDto.toDomain() = ApiError(
    error = error,
    code = code,
    details = details
)

fun <T, R> PaginatedResultDto<T>.toDomain(itemMapper: (T) -> R) = PaginatedResult(
    items = items.map(itemMapper),
    total = total,
    page = page,
    limit = limit
)

fun AbonnementDto.toDomain() = Abonnement(
    id = id,
    etablissementId = etablissementId,
    planId = planId,
    statut = StatutAbonnement.valueOf(statut),
    dateDebut = dateDebut,
    dateFin = dateFin,
    createdAt = createdAt,
    updatedAt = updatedAt
)

// ── Domain → DTO ──

fun ApiError.toDto() = ApiErrorDto(
    error = error,
    code = code,
    details = details
)

fun <T, R> PaginatedResult<T>.toDto(itemMapper: (T) -> R) = PaginatedResultDto(
    items = items.map(itemMapper),
    total = total,
    page = page,
    limit = limit
)

fun Abonnement.toDto() = AbonnementDto(
    id = id,
    etablissementId = etablissementId,
    planId = planId,
    statut = statut.name,
    dateDebut = dateDebut,
    dateFin = dateFin,
    createdAt = createdAt,
    updatedAt = updatedAt
)
