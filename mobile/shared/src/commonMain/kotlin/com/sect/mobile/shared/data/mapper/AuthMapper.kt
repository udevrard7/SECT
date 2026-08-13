// SECT Mobile — Auth DTO ↔ Domain mappers
package com.sect.mobile.shared.data.mapper

import com.sect.mobile.shared.data.dto.AuthSessionDto
import com.sect.mobile.shared.data.dto.CredentialsDto
import com.sect.mobile.shared.data.dto.MultiAccountInfoDto
import com.sect.mobile.shared.domain.model.AuthSession
import com.sect.mobile.shared.domain.model.Credentials
import com.sect.mobile.shared.domain.model.MultiAccountInfo

// ── DTO → Domain ──

fun AuthSessionDto.toDomain() = AuthSession(
    user = user.toDomain(),
    accessToken = accessToken,
    refreshToken = refreshToken,
    expiresAt = expiresAt
)

fun MultiAccountInfoDto.toDomain() = MultiAccountInfo(
    userId = userId,
    email = email,
    name = name,
    role = role,
    etablissementId = etablissementId,
    etablissementNom = etablissementNom
)

// ── Domain → DTO ──

fun Credentials.toDto() = CredentialsDto(
    identifier = identifier,
    password = password
)
