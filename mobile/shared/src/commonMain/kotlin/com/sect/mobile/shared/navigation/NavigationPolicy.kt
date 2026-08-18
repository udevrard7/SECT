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
 * SECT-NAV-EXAMPREP : Prépa Examens devient une destination primaire pour l'étudiant.
 *
 * Étudiant    : Accueil · Travail · Prépa · Résultats · Messages (5 onglets)
 * Enseignant  : Accueil · Travail · Corrections · Messages (4 onglets)
 *
 * "Travail" regroupe Épreuves + Devoirs (sous-navigation par tabs).
 * "Prépa" (examprep/home) est le hub du module ExamPrep (dashboard pédagogique).
 * Les sous-routes examprep/* restent SECONDARY (stack interne au module).
 * Profil est secondaire (accessible via avatar dans la TopBar).
 * Passation est immersif (bottom bar masquée).
 */
object NavigationPolicy {

    // ── Routes primaires ──
    // Étudiant : 5 onglets (SECT-NAV-EXAMPREP : ajout Prépa)
    // Enseignant : 4 onglets (Prépa est centré étudiant)

    val etudiantPrimaryRoutes: List<String> = listOf(
        "dashboard", "travail", "examprep/home", "resultats", "messagerie"
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
    // SECT-NAV-EXAMPREP : examprep/ est SECONDARY, mais examprep/home est PRIMARY.
    // shouldShowBottomBar vérifie primaryRoutes AVANT secondaryRoutePrefixes.

    val secondaryRoutePrefixes: List<String> = listOf(
        "epreuves/",          // détail d'une épreuve
        "messagerie/",        // conversation
        "corrections/",       // détail de correction
        "results/",           // résultats après passation
        "examprep/"           // sous-routes ExamPrep (documents, reader, review, etc.)
        // NOTE : examprep/home est PRIMARY (dans etudiantPrimaryRoutes), pas SECONDARY.
        // shouldShowBottomBar vérifie primaryRoutes en premier.
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
     *
     * SECT-NAV-EXAMPREP : primaryRoutes est vérifié AVANT secondaryRoutePrefixes
     * pour que examprep/home (PRIMARY) ne soit pas masqué par le prefix examprep/ (SECONDARY).
     */
    fun shouldShowBottomBar(route: String?, role: MobileRole): Boolean {
        if (route == null) return false
        if (route in authRoutes) return false
        if (immersiveRoutePrefixes.any { route.startsWith(it) }) return false
        // SECT-NAV-EXAMPREP : vérifier PRIMARY avant SECONDARY
        if (route in primaryRoutes(role)) return true
        if (secondaryRoutePrefixes.any { route.startsWith(it) }) return false
        if (route in secondaryExactRoutes) return false
        return false
    }

    /**
     * Classification d'une route.
     * SECT-NAV-EXAMPREP : primaryRoutes vérifié avant secondaryRoutePrefixes.
     */
    fun levelOf(route: String?, role: MobileRole): NavLevel {
        if (route == null) return NavLevel.AUTH
        if (route in authRoutes) return NavLevel.AUTH
        if (immersiveRoutePrefixes.any { route.startsWith(it) }) return NavLevel.IMMERSIVE
        // SECT-NAV-EXAMPREP : vérifier PRIMARY avant SECONDARY
        if (route in primaryRoutes(role)) return NavLevel.PRIMARY
        if (secondaryRoutePrefixes.any { route.startsWith(it) }) return NavLevel.SECONDARY
        if (route in secondaryExactRoutes) return NavLevel.SECONDARY
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
