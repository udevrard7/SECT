// SECT Mobile — User domain models (pure Kotlin, no serialization coupling)
package com.sect.mobile.shared.domain.model

import com.sect.mobile.shared.domain.enum.Role

data class User(
    val id: String,
    val email: String,
    val name: String,
    val role: Role,
    val etablissementId: String? = null,
    val filiereId: String? = null,
    val image: String? = null,
    val actif: Boolean = true,
    val mustChangePwd: Boolean = false,
    val matricule: String? = null,
    val niveau: String? = null,
    val derniereConnexion: Instant? = null,
    val createdAt: Instant,
    val updatedAt: Instant,
    val deletedAt: Instant? = null,
    val etablissement: EtablissementRef? = null,
    val filiere: FiliereRef? = null
)

data class EtablissementRef(
    val id: String,
    val nom: String,
    val type: String? = null,
    val matriculeRegex: String? = null,
    val matriculeFormat: String? = null,
    val matriculeExample: String? = null
)

data class FiliereRef(
    val id: String,
    val nom: String,
    val code: String
)

data class UserRef(
    val id: String,
    val name: String,
    val email: String
)

data class UserListResult(
    val users: List<User>,
    val total: Int,
    val page: Int,
    val limit: Int
)

data class CreateUserInput(
    val name: String,
    val email: String,
    val password: String,
    val role: Role,
    val etablissementId: String? = null,
    val filiereId: String? = null,
    val actif: Boolean? = null,
    val matricule: String? = null,
    val niveau: String? = null,
    val mustChangePwd: Boolean? = null
)
