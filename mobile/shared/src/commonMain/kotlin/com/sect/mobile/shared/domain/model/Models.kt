// SECT Mobile — Modèles de données partagés
// Les modèles ont été séparés en fichiers individuels :
// - DTOs (avec @Serializable) : data/dto/ (AuthDto.kt, UserDto.kt, etc.)
// - Domain Models (purs)     : domain/model/ (Auth.kt, User.kt, etc.)
// - Mappers                  : data/mapper/ (AuthMapper.kt, UserMapper.kt, etc.)
//
// Architecture Clean Architecture :
//   data/dto → data/mapper → domain/model
//   Les DTOs sont 1:1 avec le JSON du backend Go.
//   Les Domain Models sont découplés de la sérialisation.
//   Les Mappers font la conversion entre les deux.
package com.sect.mobile.shared.domain.model

// Typealias conservé pour compatibilité — les nouveaux fichiers l'utilisent aussi
typealias Instant = String
