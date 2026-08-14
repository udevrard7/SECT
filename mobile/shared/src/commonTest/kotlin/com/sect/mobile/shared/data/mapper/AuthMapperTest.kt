package com.sect.mobile.shared.data.mapper

import com.sect.mobile.shared.data.dto.AuthSessionDto
import com.sect.mobile.shared.data.dto.CredentialsDto
import com.sect.mobile.shared.data.dto.UserDto
import com.sect.mobile.shared.domain.enum.Role
import com.sect.mobile.shared.domain.model.Credentials
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Tests unitaires pour AuthMapper (DTO ↔ Domain conversions).
 *
 * Valide que :
 * - AuthSessionDto.toDomain() préserve tous les champs (user, tokens, expiresAt)
 * - Credentials.toDto() convertit correctement
 * - Les champs nullable sont gérés (null reste null)
 */
class AuthMapperTest {

    private fun sampleUserDto() = UserDto(
        id = "usr_123",
        email = "prof@sect.ci",
        name = "Professeur Test",
        role = "ENSEIGNANT",
        etablissementId = "etab_456",
        filiereId = null,
        image = null,
        actif = true,
        mustChangePwd = false,
        matricule = null,
        niveau = null,
        derniereConnexion = null,
        createdAt = "2025-01-01T00:00:00Z",
        updatedAt = "2025-01-02T00:00:00Z",
        deletedAt = null,
        etablissement = null,
        filiere = null
    )

    @Test
    fun authSessionDto_toDomain_preserves_all_fields() {
        val dto = AuthSessionDto(
            user = sampleUserDto(),
            accessToken = "access_token_abc",
            refreshToken = "refresh_token_xyz",
            expiresAt = "2025-12-31T23:59:59Z"
        )

        val domain = dto.toDomain()

        assertEquals("access_token_abc", domain.accessToken)
        assertEquals("refresh_token_xyz", domain.refreshToken)
        assertEquals("2025-12-31T23:59:59Z", domain.expiresAt)
        assertEquals("usr_123", domain.user.id)
        assertEquals("prof@sect.ci", domain.user.email)
        assertEquals(Role.ENSEIGNANT, domain.user.role)
        assertEquals("etab_456", domain.user.etablissementId)
    }

    @Test
    fun credentials_toDto_maps_identifier_and_password() {
        val domain = Credentials(
            identifier = "prof@sect.ci",
            password = "Secret123!"
        )

        val dto = domain.toDto()

        assertEquals("prof@sect.ci", dto.identifier)
        assertEquals("Secret123!", dto.password)
    }

    @Test
    fun authSessionDto_toDomain_handles_admin_user_with_null_etablissement() {
        val adminDto = sampleUserDto().copy(
            id = "admin_001",
            email = "admin@sect.ci",
            role = "ADMIN",
            etablissementId = null
        )
        val dto = AuthSessionDto(
            user = adminDto,
            accessToken = "admin_access",
            refreshToken = "admin_refresh",
            expiresAt = "2025-12-31T23:59:59Z"
        )

        val domain = dto.toDomain()

        assertEquals(Role.ADMIN, domain.user.role)
        assertEquals(null, domain.user.etablissementId)
    }
}
