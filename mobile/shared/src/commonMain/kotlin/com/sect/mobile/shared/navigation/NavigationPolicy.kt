// SECT Mobile — Navigation Policy (shared KMP, pure Kotlin)
// Déclare les destinations par rôle + classification (primaire / secondaire / immersif).
// Utilisé par Android (BottomBar + showBottomBar) et iOS (MainTabView) pour garantir
// une parité de navigation entre plateformes.
//
// SECT-MOBILE-NAV-PHASE-A : refonte 4 onglets + Profil en secondaire.
package com.sect.mobile.shared.navigation

/**
 * Rôles supportés par l'app mobile (exclut ADMIN/RESPONSABLE → WebRedirect).
 */
enum class MobileRole { ETUDIANT, ENSEIGNANT }

/**
 * Classification des routes pour décider d'afficher/masquer la bottom bar.
 */
enum class NavLevel {
    /** Onglets principaux de la bottom bar (4 par rôle). */
    PRIMARY,
    /** Routes secondaires accessibles par stack (détail, profil, conversation). */
    SECONDARY,
    /** Mode immersif : bottom bar masquée, plein écran. */
    IMMERSIVE,
    /** Racine d'auth (splash, login, web_redirect). */
    AUTH
}

/**
 * Politique de navigation centrale.
 *
 * Étudiant    : Accueil · Travail · Résultats · Messages
 * Enseignant  : Accueil · Travail · Corrections · Messages
 *
 * "Travail" regroupe Épreuves + Devoirs (sous-navigation par tabs).
 * Profil est secondaire (accessible via avatar dans la TopBar).
 * Passation est immersif (bottom bar masquée).
 */
object NavigationPolicy {

    // ── Routes primaires (4 par rôle) ──

    val etudiantPrimaryRoutes: List<String> = listOf(
        "dashboard", "travail", "resultats", "messagerie"
    )

    val enseignantPrimaryRoutes: List<String> = listOf(
        "dashboard", "travail", "corrections", "messagerie"
    )

    fun primaryRoutes(role: MobileRole): List<String> = when (role) {
        MobileRole.ETUDIANT -> etudiantPrimaryRoutes
        MobileRole.ENSEIGNANT -> enseignantPrimaryRoutes
    }

    // ── Routes immersives (bottom bar masquée) ──

    val immersiveRoutePrefixes: List<String> = listOf(
        "passation/"  // Mode examen — aucun élément de nav
    )

    // ── Routes secondaires (stack, bottom bar masquée) ──

    val secondaryRoutePrefixes: List<String> = listOf(
        "epreuves/",          // détail d'une épreuve
        "messagerie/",        // conversation
        "corrections/",       // détail de correction
        "results/"            // résultats après passation
    )

    val secondaryExactRoutes: List<String> = listOf(
        "profile",
        "settings"
    )

    // ── Routes d'auth (bottom bar masquée) ──

    val authRoutes: List<String> = listOf(
        "splash", "login", "web_redirect"
    )

    /**
     * Détermine si la bottom bar doit être visible pour une route donnée.
     * Visible uniquement sur les routes primaires du rôle.
     */
    fun shouldShowBottomBar(route: String?, role: MobileRole): Boolean {
        if (route == null) return false
        if (route in authRoutes) return false
        if (immersiveRoutePrefixes.any { route.startsWith(it) }) return false
        if (secondaryRoutePrefixes.any { route.startsWith(it) }) return false
        if (route in secondaryExactRoutes) return false
        return route in primaryRoutes(role)
    }

    /**
     * Classification d'une route.
     */
    fun levelOf(route: String?, role: MobileRole): NavLevel {
        if (route == null) return NavLevel.AUTH
        if (route in authRoutes) return NavLevel.AUTH
        if (immersiveRoutePrefixes.any { route.startsWith(it) }) return NavLevel.IMMERSIVE
        if (secondaryRoutePrefixes.any { route.startsWith(it) }) return NavLevel.SECONDARY
        if (route in secondaryExactRoutes) return NavLevel.SECONDARY
        if (route in primaryRoutes(role)) return NavLevel.PRIMARY
        return NavLevel.SECONDARY
    }

    /**
     * Le rôle étudiant voit l'onglet "Résultats".
     * Le rôle enseignant voit l'onglet "Corrections".
     */
    fun roleSpecificTab(role: MobileRole): String = when (role) {
        MobileRole.ETUDIANT -> "resultats"
        MobileRole.ENSEIGNANT -> "corrections"
    }
}
