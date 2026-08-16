// SECT Mobile — Navigation Android avec Bottom Navigation RBAC (Enseignant vs Étudiant)
// SECT-MOBILE-FOCUS : app réservée Enseignant + Étudiant → navigation adaptative selon le rôle
// REFACTOR-PHASE2 : Navigation type-safe inspirée du routing Next.js du frontend web
package com.sect.mobile.android.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Assessment
import androidx.compose.material.icons.filled.Book
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.EditNote
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.sect.mobile.android.ui.screens.*
import com.sect.mobile.android.ui.screens.corrections.CorrectionsScreen
import com.sect.mobile.android.ui.screens.resultats.ResultatsScreen
import com.sect.mobile.android.ui.viewmodel.*
import com.sect.mobile.android.ui.components.navigation.*
import org.koin.androidx.compose.koinViewModel

/**
 * Routes type-safe inspirées du routing Next.js (/frontend/src/app).
 * Évite les hardcoded strings et permet une navigation prévisible.
 */
sealed class ScreenRoute(val route: String) {
    // Auth
    object Splash : ScreenRoute("splash")
    object Login : ScreenRoute("login")
    object WebRedirect : ScreenRoute("web_redirect")
    
    // Bottom Navigation (commun)
    object Dashboard : ScreenRoute("dashboard")
    object Epreuves : ScreenRoute("epreuves")
    object Messagerie : ScreenRoute("messagerie")
    object Profile : ScreenRoute("profile")
    
    // Spécifique Étudiant
    object Resultats : ScreenRoute("resultats")
    
    // Spécifique Enseignant
    object Corrections : ScreenRoute("corrections")
    
    // Routes secondaires avec arguments
    data class EpreuveDetail(val id: String) : ScreenRoute("epreuves/$id")
    data class Passation(val id: String) : ScreenRoute("passation/$id")
    data class Results(val id: String) : ScreenRoute("results/$id")
    data class Conversation(val id: String) : ScreenRoute("messagerie/$id")
    
    companion object {
        fun fromRoute(route: String): ScreenRoute? {
            return when {
                route == "splash" -> Splash
                route == "login" -> Login
                route == "web_redirect" -> WebRedirect
                route == "dashboard" -> Dashboard
                route == "epreuves" -> Epreuves
                route == "messagerie" -> Messagerie
                route == "profile" -> Profile
                route == "resultats" -> Resultats
                route == "corrections" -> Corrections
                route.startsWith("epreuves/") -> EpreuveDetail(route.removePrefix("epreuves/"))
                route.startsWith("passation/") -> Passation(route.removePrefix("passation/"))
                route.startsWith("results/") -> Results(route.removePrefix("results/"))
                route.startsWith("messagerie/") && route.count { it == '/' } > 0 -> {
                    // Éviter confusion avec /messagerie (liste)
                    Conversation(route.removePrefix("messagerie/"))
                }
                else -> null
            }
        }
    }
}

object Routes {
    const val SPLASH = "splash"
    const val LOGIN = "login"
    const val WEB_REDIRECT = "web_redirect"

    // Bottom Navigation (commun)
    const val DASHBOARD = "dashboard"
    const val EPREUVES = "epreuves"
    const val MESSAGERIE = "messagerie"
    const val PROFILE = "profile"

    // Spécifique Étudiant
    const val RESULTATS = "resultats"
    
    // Spécifique Enseignant
    const val CORRECTIONS = "corrections"

    // Routes secondaires (accessibles depuis les onglets)
    const val EPREUVE_DETAIL = "epreuves/{epreuveId}"
    const val PASSATION = "passation/{epreuveId}"
    const val RESULTS = "results/{epreuveId}"
    const val CONVERSATION = "messagerie/{conversationId}"
}

@Composable
fun SECTNavigation(
    navController: NavHostController = rememberNavController(),
    startDestination: String = Routes.SPLASH
) {
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route
    
    // Récupérer le rôle utilisateur pour la navigation conditionnelle
    val authVM: AuthViewModel = koinViewModel()
    val authState by authVM.authState.collectAsState()
    // AuthState.Authenticated n'expose pas `user` (seulement userId/role/userName)
    // → on lit directement le StateFlow<User?> du ViewModel pour récupérer le Role typé.
    val currentUser by authVM.currentUser.collectAsState()
    val isEnseignant = currentUser?.role?.name == "ENSEIGNANT"
    val isEtudiant = currentUser?.role?.name == "ETUDIANT"
    
    // Déterminer les items de navigation selon le rôle
    val navItems = getNavItemsForRole(isEnseignant = isEnseignant)
    
    // Mappe les routes pour inclure les badges dynamiques
    val navItemsWithBadges = navItems.map { item ->
        when (item.route) {
            Routes.MESSAGERIE -> {
                // TODO: Récupérer le nombre de messages non lus depuis MessagerieViewModel
                item.copy(badgeCount = null)
            }
            Routes.CORRECTIONS -> {
                // TODO: Récupérer le nombre de corrections en attente depuis DashboardViewModel
                item.copy(badgeCount = null)
            }
            Routes.RESULTATS -> {
                // TODO: Récupérer le nombre de nouveaux résultats
                item.copy(badgeCount = null)
            }
            else -> item
        }
    }

    // Détermine si on affiche la bottom bar (seulement sur les onglets principaux)
    val mainRoutes = buildList {
        add(Routes.DASHBOARD)
        add(Routes.EPREUVES)
        add(Routes.MESSAGERIE)
        add(Routes.PROFILE)
        if (isEtudiant) add(Routes.RESULTATS)
        if (isEnseignant) add(Routes.CORRECTIONS)
    }
    val showBottomBar = currentRoute in mainRoutes

    Scaffold(
        bottomBar = {
            if (showBottomBar) {
                SectBottomNavigationBar(
                    items = navItemsWithBadges,
                    currentRoute = currentRoute ?: "",
                    onNavigate = { route ->
                        navController.navigate(route) {
                            popUpTo(navController.graph.findStartDestination().id) {
                                saveState = true
                            }
                            launchSingleTop = true
                            restoreState = true
                        }
                    }
                )
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = startDestination,
            modifier = Modifier.padding(innerPadding)
        ) {
            // ── Splash (avant auth) ──
            composable(Routes.SPLASH) {
                val splashAuthVM: AuthViewModel = koinViewModel()
                SplashScreen(
                    authState = splashAuthVM.authState.collectAsState().value,
                    onNavigateToLogin = { navController.navigate(Routes.LOGIN) },
                    onNavigateToDashboard = {
                        navController.navigate(Routes.DASHBOARD) {
                            popUpTo(Routes.SPLASH) { inclusive = true }
                        }
                    },
                    onNavigateToWebRedirect = { navController.navigate(Routes.WEB_REDIRECT) }
                )
            }

            // ── Web Redirect (ADMIN/RESPONSABLE) ──
            composable(Routes.WEB_REDIRECT) {
                val redirectAuthVM: AuthViewModel = koinViewModel()
                val authState by redirectAuthVM.authState.collectAsState()
                val state = authState as? AuthState.RedirectToWeb
                WebRedirectScreen(
                    userName = state?.userName ?: "",
                    role = state?.role ?: "",
                    onBackToLogin = {
                        redirectAuthVM.logout()
                        navController.navigate(Routes.LOGIN) { popUpTo(0) { inclusive = true } }
                    }
                )
            }

            // ── Login ──
            composable(Routes.LOGIN) {
                val loginAuthVM: AuthViewModel = koinViewModel()
                LoginScreen(
                    viewModel = loginAuthVM,
                    onLoginSuccess = {
                        navController.navigate(Routes.DASHBOARD) {
                            popUpTo(Routes.SPLASH) { inclusive = true }
                        }
                    }
                )
            }

            // ══ BOTTOM NAV : Onglets conditionnels ══

            // 🏠 Accueil
            composable(Routes.DASHBOARD) {
                val dashboardVM: DashboardViewModel = koinViewModel()
                val dashboardAuthVM: AuthViewModel = koinViewModel()
                DashboardScreen(
                    viewModel = dashboardVM,
                    onNavigateToEpreuves = { navController.navigate(Routes.EPREUVES) },
                    onNavigateToMessagerie = { navController.navigate(Routes.MESSAGERIE) },
                    onNavigateToProfile = { navController.navigate(Routes.PROFILE) },
                    onNavigateToSettings = { navController.navigate(Routes.PROFILE) },
                    onLogout = {
                        dashboardAuthVM.logout()
                        navController.navigate(Routes.LOGIN) { popUpTo(0) { inclusive = true } }
                    },
                    onNavigateToResultats = { navController.navigate(Routes.RESULTATS) },
                    onNavigateToCorrections = { navController.navigate(Routes.CORRECTIONS) }
                )
            }

            // 📝 Épreuves
            composable(Routes.EPREUVES) {
                val epreuveVM: EpreuveViewModel = koinViewModel()
                EpreuvesScreen(
                    viewModel = epreuveVM,
                    onEpreuveClick = { id -> navController.navigate("epreuves/$id") },
                    onBack = { navController.popBackStack() }
                )
            }

            composable(Routes.EPREUVE_DETAIL) { backStackEntry ->
                val epreuveId = backStackEntry.arguments?.getString("epreuveId") ?: ""
                val epreuveDetailVM: EpreuveViewModel = koinViewModel()
                EpreuveDetailScreen(
                    epreuveId = epreuveId,
                    viewModel = epreuveDetailVM,
                    onStartPassation = { navController.navigate("passation/$epreuveId") },
                    onBack = { navController.popBackStack() }
                )
            }

            composable(Routes.PASSATION) { backStackEntry ->
                val epreuveId = backStackEntry.arguments?.getString("epreuveId") ?: ""
                val passationVM: PassationViewModel = koinViewModel()
                PassationScreen(
                    epreuveId = epreuveId,
                    viewModel = passationVM,
                    onFinish = { navController.navigate("results/$epreuveId") },
                    onBack = { navController.popBackStack() }
                )
            }

            // 💬 Messages
            composable(Routes.MESSAGERIE) {
                val messagerieVM: MessagerieViewModel = koinViewModel()
                MessagerieScreen(
                    viewModel = messagerieVM,
                    onConversationClick = { id -> navController.navigate("messagerie/$id") },
                    onBack = { navController.popBackStack() }
                )
            }

            composable(Routes.CONVERSATION) { backStackEntry ->
                val conversationId = backStackEntry.arguments?.getString("conversationId") ?: ""
                val conversationVM: MessagerieViewModel = koinViewModel()
                ConversationScreen(
                    conversationId = conversationId,
                    viewModel = conversationVM,
                    onBack = { navController.popBackStack() }
                )
            }

            // 👤 Profil
            composable(Routes.PROFILE) {
                val profileVM: ProfileViewModel = koinViewModel()
                val profileAuthVM: AuthViewModel = koinViewModel()
                ProfileScreen(
                    viewModel = profileVM,
                    onBack = { navController.popBackStack() }
                )
            }

            // 📊 Résultats (Étudiant uniquement)
            // Branché SECT-MOBILE-NAV-1 : liste des résultats de l'étudiant connecté.
            // Accessible via l'onglet "Résultats" de la bottom bar (studentNavItems)
            // + raccourci depuis le Dashboard (onNavigateToResultats).
            composable(Routes.RESULTATS) {
                val resultatsVM: ResultatsViewModel = koinViewModel()
                ResultatsScreen(
                    onBackClick = { navController.popBackStack() },
                    onResultClick = { resultatId ->
                        // TODO(SECT-MOBILE-NAV) : créer une route détail de résultat
                        // (ex: resultats/{resultatId}) affichant le détail par question.
                        // Pour l'instant, pas de route détail — on reste sur la liste.
                    },
                    viewModel = resultatsVM
                )
            }

            // ✏️ Corrections (Enseignant uniquement)
            // Branché SECT-MOBILE-NAV-1 : liste des copies à corriger pour l'enseignant.
            // Accessible via l'onglet "Corrections" de la bottom bar (enseignantNavItems)
            // + raccourci depuis le Dashboard (onNavigateToCorrections).
            //
            // NOTE : getSessionsACorriger() retourne actuellement emptyList() car la route
            // backend /api/sessions/a-corriger n'existe pas encore (voir ResultatsApi.kt).
            // L'écran affichera l'état "Aucune copie à corriger" en attendant.
            composable(Routes.CORRECTIONS) {
                val correctionsVM: CorrectionsViewModel = koinViewModel()
                CorrectionsScreen(
                    onBackClick = { navController.popBackStack() },
                    onSessionClick = { sessionId ->
                        // TODO(SECT-MOBILE-NAV) : créer une route détail de correction
                        // (ex: corrections/{sessionId}) affichant les réponses à noter.
                        // Pour l'instant, pas de route détail — on reste sur la liste.
                    },
                    viewModel = correctionsVM
                )
            }

            // ── Results (après passation) ──
            composable(Routes.RESULTS) { backStackEntry ->
                val epreuveId = backStackEntry.arguments?.getString("epreuveId") ?: ""
                val resultsVM: PassationViewModel = koinViewModel()
                ResultsScreen(
                    epreuveId = epreuveId,
                    viewModel = resultsVM,
                    onBack = { navController.popBackStack() }
                )
            }
        }
    }
}
