// SECT Mobile — [DEPRECATED] Modèles de données partagés
// Ce fichier est OBSOLÈTE. Les modèles ont été séparés en fichiers individuels :
// - DTOs (avec @Serializable) : data/dto/ (AuthDto.kt, UserDto.kt, etc.)
// - Domain Models (purs)     : domain/model/ (Auth.kt, User.kt, etc.)
// - Mappers                  : data/mapper/ (AuthMapper.kt, UserMapper.kt, etc.)
//
// Architecture Clean Architecture :
//   data/dto → data/mapper → domain/model
//   Les DTOs sont 1:1 avec le JSON du backend Go.
//   Les Domain Models sont découplés de la sérialisation.
//   Les Mappers font la conversion entre les deux.
//
// Ce fichier sera supprimé dans une version future.
package com.sect.mobile.shared.domain.model

// Typealias conservé pour compatibilité — les nouveaux fichiers l'utilisent aussi
typealias Instant = String

@Deprecated(
    message = "Les modèles ont été migrés vers des fichiers individuels (Auth.kt, User.kt, Epreuve.kt, etc.) et DTOs (data/dto/). Ce fichier sera supprimé.",
    level = DeprecationLevel.WARNING
)
object ModelsMigrated {
    const val MIGRATED = true
    const val DTO_PACKAGE = "com.sect.mobile.shared.data.dto"
    const val MAPPER_PACKAGE = "com.sect.mobile.shared.data.mapper"
    const val DOMAIN_PACKAGE = "com.sect.mobile.shared.domain.model"
}
