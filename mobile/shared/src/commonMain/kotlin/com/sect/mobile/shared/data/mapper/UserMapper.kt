// SECT Mobile — User DTO ↔ Domain mappers
package com.sect.mobile.shared.data.mapper

import com.sect.mobile.shared.data.dto.CreateUserInputDto
import com.sect.mobile.shared.data.dto.EtablissementRefDto
import com.sect.mobile.shared.data.dto.FiliereRefDto
import com.sect.mobile.shared.data.dto.UserDto
import com.sect.mobile.shared.data.dto.UserListResultDto
import com.sect.mobile.shared.data.dto.UserRefDto
import com.sect.mobile.shared.domain.enum.Role
import com.sect.mobile.shared.domain.model.CreateUserInput
import com.sect.mobile.shared.domain.model.EtablissementRef
import com.sect.mobile.shared.domain.model.FiliereRef
import com.sect.mobile.shared.domain.model.User
import com.sect.mobile.shared.domain.model.UserListResult
import com.sect.mobile.shared.domain.model.UserRef

// ── DTO → Domain ──

fun UserDto.toDomain() = User(
    id = id,
    email = email,
    name = name,
    role = Role.valueOf(role),
    etablissementId = etablissementId,
    filiereId = filiereId,
    image = image,
    actif = actif,
    mustChangePwd = mustChangePwd,
    matricule = matricule,
    niveau = niveau,
    derniereConnexion = derniereConnexion,
    createdAt = createdAt,
    updatedAt = updatedAt,
    deletedAt = deletedAt,
    etablissement = etablissement?.toDomain(),
    filiere = filiere?.toDomain()
)

fun EtablissementRefDto.toDomain() = EtablissementRef(
    id = id,
    nom = nom,
    type = type,
    matriculeRegex = matriculeRegex,
    matriculeFormat = matriculeFormat,
    matriculeExample = matriculeExample
)

fun FiliereRefDto.toDomain() = FiliereRef(
    id = id,
    nom = nom,
    code = code
)

fun UserRefDto.toDomain() = UserRef(
    id = id,
    name = name,
    email = email
)

fun UserListResultDto.toDomain() = UserListResult(
    users = users.map { it.toDomain() },
    total = total,
    page = page,
    limit = limit
)

// ── Domain → DTO ──

fun User.toDto() = UserDto(
    id = id,
    email = email,
    name = name,
    role = role.name,
    etablissementId = etablissementId,
    filiereId = filiereId,
    image = image,
    actif = actif,
    mustChangePwd = mustChangePwd,
    matricule = matricule,
    niveau = niveau,
    derniereConnexion = derniereConnexion,
    createdAt = createdAt,
    updatedAt = updatedAt,
    deletedAt = deletedAt,
    etablissement = etablissement?.toDto(),
    filiere = filiere?.toDto()
)

fun EtablissementRef.toDto() = EtablissementRefDto(
    id = id,
    nom = nom,
    type = type,
    matriculeRegex = matriculeRegex,
    matriculeFormat = matriculeFormat,
    matriculeExample = matriculeExample
)

fun FiliereRef.toDto() = FiliereRefDto(
    id = id,
    nom = nom,
    code = code
)

fun UserRef.toDto() = UserRefDto(
    id = id,
    name = name,
    email = email
)

fun CreateUserInput.toDto() = CreateUserInputDto(
    name = name,
    email = email,
    password = password,
    role = role.name,
    etablissementId = etablissementId,
    filiereId = filiereId,
    actif = actif,
    matricule = matricule,
    niveau = niveau,
    mustChangePwd = mustChangePwd
)
