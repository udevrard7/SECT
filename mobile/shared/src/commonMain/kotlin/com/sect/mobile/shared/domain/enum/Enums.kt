// SECT Mobile — Énumérations partagées correspondant aux enums Go backend
package com.sect.mobile.shared.domain.enum

import kotlinx.serialization.Serializable

// ── Rôles utilisateur ──
@Serializable
enum class Role {
    ADMIN,
    RESPONSABLE,
    ENSEIGNANT,
    ETUDIANT;

    fun isAtLeast(required: Role): Boolean = this.ordinal <= required.ordinal
}

// ── Niveaux d'étude ──
@Serializable
enum class NiveauEtude {
    L1, L2, L3, M1, M2, DOCTORAT
}

// ── Statuts d'épreuve ──
@Serializable
enum class StatutEpreuve {
    BROUILLON,
    PLANIFIEE,
    EN_COURS,
    TERMINEE,
    CLOTUREE
}

// ── Types de question ──
@Serializable
enum class TypeQuestion {
    QCU,
    QCM,
    QRC,
    REFLEXION,
    TRS,
    CODE
}

// ── Difficulté ──
@Serializable
enum class Difficulte {
    FACILE,
    MOYEN,
    DIFFICILE,
    EXPERT
}

// ── Mode de génération ──
@Serializable
enum class ModeGeneration {
    MANUELLE,
    IA_ASSISTEE
}

// ── Session d'examen ──
@Serializable
enum class SessionExamen {
    NORMALE,
    RATTRAPAGE,
    SPECIALE,
    EXCEPTIONNELLE,
    DIFFERE
}

// ── Statut de session de passation ──
@Serializable
enum class StatutSession {
    NON_COMMENCEE,
    EN_COURS,
    SOUMISE,
    CORRIGEE,
    RETOURNEE,
    ABSENT,
    NON_SOUMIS
}

// ── Statut d'abonnement ──
@Serializable
enum class StatutAbonnement {
    ESSAI,
    ACTIF,
    EXPIRE,
    RESILIE,
    EN_ATTENTE_PAIEMENT
}

// ── Type de plan ──
@Serializable
enum class TypePlan {
    GRATUIT,
    STANDARD,
    PREMIUM
}

// ── Type de conversation (messagerie) ──
@Serializable
enum class ConversationType {
    IA,
    CLASSE,
    PROMO,
    EQUIPE,
    STAFF,
    DIRECT
}

// ── Type de séance (CM/TD/TP) ──
@Serializable
enum class TypeSeance {
    CM,
    TD,
    TP
}

// ── Statut d'affectation ──
@Serializable
enum class StatutAffectation {
    PROVISOIRE,
    VALIDEE,
    PUBLIEE
}

// ── Statut d'inscription ──
@Serializable
enum class StatutInscription {
    EN_COURS,
    PROMU,
    REDOUBLANT,
    DIPLOME,
    EXCLU,
    REORIENTE,
    QUITTE
}
