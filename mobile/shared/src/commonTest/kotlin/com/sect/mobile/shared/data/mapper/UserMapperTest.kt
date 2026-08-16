package com.sect.mobile.shared.data.mapper

import com.sect.mobile.shared.data.dto.EtablissementRefDto
import com.sect.mobile.shared.data.dto.FiliereRefDto
import com.sect.mobile.shared.data.dto.UserDto
import com.sect.mobile.shared.domain.enum.Role
import com.sect.mobile.shared.domain.model.CreateUserInput
import com.sect.mobile.shared.domain.model.EtablissementRef
import com.sect.mobile.shared.domain.model.FiliereRef
import com.sect.mobile.shared.domain.model.User
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * Tests unitaires pour UserMapper (DTO ↔ Domain conversions).
 *
 * Valide que :
 * - UserDto.toDomain() convertit tous les champs + l'enum Role
 * - User.toDto() fait la conversion inverse (round-trip)
 * - Les refs imbriquées (etablissement, filiere) sont mappées correctement
 * - Les champs nullables null restent null
 * - CreateUserInput.toDto() convertit le role en String
 */
class UserMapperTest {

    private fun sampleUserDto() = UserDto(
        id = "usr_001",
        email = "etudiant@sect.ci",
        name = "Étudiant Test",
        role = "ETUDIANT",
        etablissementId = "etab_001",
        filiereId = "fil_001",
        image = null,
        actif = true,
        mustChangePwd = false,
        matricule = "MAT2025-001",
        niveau = "L3",
        derniereConnexion = null,
        createdAt = "2025-01-01T00:00:00Z",
        updatedAt = "2025-06-15T10:30:00Z",
        deletedAt = null,
        etablissement = EtablissementRefDto(
            id = "etab_001",
            nom = "Université Test",
            type = "UNIVERSITE",
            matriculeRegex = null,
            matriculeFormat = "MAT{YYYY}-{NNN}",
            matriculeExample = "MAT2025-001"
        ),
        filiere = FiliereRefDto(
            id = "fil_001",
            nom = "Informatique",
            code = "INFO"
        )
    )

    @Test
    fun userDto_toDomain_maps_all_fields() {
        val dto = sampleUserDto()

        val domain = dto.toDomain()

        assertEquals("usr_001", domain.id)
        assertEquals("etudiant@sect.ci", domain.email)
        assertEquals("Étudiant Test", domain.name)
        assertEquals(Role.ETUDIANT, domain.role)
        assertEquals("etab_001", domain.etablissementId)
        assertEquals("fil_001", domain.filiereId)
        assertEquals("MAT2025-001", domain.matricule)
        assertEquals("L3", domain.niveau)
        assertEquals(true, domain.actif)
    }

    @Test
    fun userDto_toDomain_maps_nested_refs() {
        val dto = sampleUserDto()

        val domain = dto.toDomain()

        assertEquals("etab_001", domain.etablissement?.id)
        assertEquals("Université Test", domain.etablissement?.nom)
        assertEquals("UNIVERSITE", domain.etablissement?.type)
        assertEquals("MAT{YYYY}-{NNN}", domain.etablissement?.matriculeFormat)

        assertEquals("fil_001", domain.filiere?.id)
        assertEquals("Informatique", domain.filiere?.nom)
        assertEquals("INFO", domain.filiere?.code)
    }

    @Test
    fun userDto_toDomain_handles_null_refs() {
        val dto = sampleUserDto().copy(
            etablissementId = null,
            filiereId = null,
            etablissement = null,
            filiere = null
        )

        val domain = dto.toDomain()

        assertNull(domain.etablissementId)
        assertNull(domain.filiereId)
        assertNull(domain.etablissement)
        assertNull(domain.filiere)
    }

    @Test
    fun user_toDto_round_trips_correctly() {
        val original = sampleUserDto().toDomain()

        val dto = original.toDto()
        val roundTripped = dto.toDomain()

        assertEquals(original.id, roundTripped.id)
        assertEquals(original.email, roundTripped.email)
        assertEquals(original.role, roundTripped.role)
        assertEquals(original.etablissementId, roundTripped.etablissementId)
        assertEquals(original.matricule, roundTripped.matricule)
        assertEquals(original.etablissement?.nom, roundTripped.etablissement?.nom)
        assertEquals(original.filiere?.code, roundTripped.filiere?.code)
    }

    @Test
    fun createUserInput_toDto_converts_role_to_string() {
        val input = CreateUserInput(
            name = "Nouveau Prof",
            email = "newprof@sect.ci",
            password = "TempPass123!",
            role = Role.ENSEIGNANT,
            etablissementId = "etab_001",
            filiereId = null,
            actif = true,
            matricule = null,
            niveau = null,
            mustChangePwd = true
        )

        val dto = input.toDto()

        assertEquals("ENSEIGNANT", dto.role)
        assertEquals("newprof@sect.ci", dto.email)
        assertEquals(true, dto.actif)
        assertEquals(true, dto.mustChangePwd)
        assertEquals("etab_001", dto.etablissementId)
        assertNull(dto.filiereId)
    }
}
