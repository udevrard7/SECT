// SECT Mobile — Navigation Android avec Bottom Navigation (4 onglets)
// SECT-MOBILE-FOCUS : app réservée Enseignant + Étudiant → navigation simplifiée
package com.sect.mobile.android.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Book
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Dashboard
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
import com.sect.mobile.android.ui.viewmodel.*
import org.koin.androidx.compose.koinViewModel

object Routes {
    const val SPLASH = "splash"
    const val LOGIN = "login"
    const val WEB_REDIRECT = "web_redirect"

    // Bottom Navigation (4 onglets)
    const val DASHBOARD = "dashboard"
    const val EPREUVES = "epreuves"
    const val MESSAGERIE = "messagerie"
    const val PROFILE = "profile"

    // Routes secondaires (accessibles depuis les onglets)
    const val EPREUVE_DETAIL = "epreuves/{epreuveId}"
    const val PASSATION = "passation/{epreuveId}"
    const val RESULTS = "results/{epreuveId}"
    const val CONVERSATION = "messagerie/{conversationId}"
}

data class BottomNavItem(
    val route: String,
    val label: String,
    val icon: androidx.compose.ui.graphics.vector.ImageVector
)

val bottomNavItems = listOf(
    BottomNavItem(Routes.DASHBOARD, "Accueil", Icons.Default.Dashboard),
    BottomNavItem(Routes.EPREUVES, "Épreuves", Icons.Default.Book),
    BottomNavItem(Routes.MESSAGERIE, "Messages", Icons.Default.Chat),
    BottomNavItem(Routes.PROFILE, "Profil", Icons.Default.Person),
)

@Composable
fun SECTNavigation(
    navController: NavHostController = rememberNavController(),
    startDestination: String = Routes.SPLASH
) {
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    // Détermine si on affiche la bottom bar (seulement sur les 4 onglets principaux)
    val showBottomBar = currentRoute in bottomNavItems.map { it.route }

    Scaffold(
        bottomBar = {
            if (showBottomBar) {
                NavigationBar {
                    bottomNavItems.forEach { item ->
                        NavigationBarItem(
                            icon = { Icon(item.icon, contentDescription = item.label) },
                            label = { Text(item.label) },
                            selected = currentRoute == item.route,
                            onClick = {
                                navController.navigate(item.route) {
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
                val authVM: AuthViewModel = koinViewModel()
                SplashScreen(
                    authState = authVM.authState.collectAsState().value,
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
                val authVM: AuthViewModel = koinViewModel()
                val authState by authVM.authState.collectAsState()
                val state = authState as? AuthState.RedirectToWeb
                WebRedirectScreen(
                    userName = state?.userName ?: "",
                    role = state?.role ?: "",
                    onBackToLogin = {
                        authVM.logout()
                        navController.navigate(Routes.LOGIN) { popUpTo(0) { inclusive = true } }
                    }
                )
            }

            // ── Login ──
            composable(Routes.LOGIN) {
                val authVM: AuthViewModel = koinViewModel()
                LoginScreen(
                    viewModel = authVM,
                    onLoginSuccess = {
                        navController.navigate(Routes.DASHBOARD) {
                            popUpTo(Routes.SPLASH) { inclusive = true }
                        }
                    }
                )
            }

            // ══ BOTTOM NAV : 4 onglets ══

            // 🏠 Accueil
            composable(Routes.DASHBOARD) {
                val dashboardVM: DashboardViewModel = koinViewModel()
                val authVM: AuthViewModel = koinViewModel()
                DashboardScreen(
                    viewModel = dashboardVM,
                    onNavigateToEpreuves = { navController.navigate(Routes.EPREUVES) },
                    onNavigateToMessagerie = { navController.navigate(Routes.MESSAGERIE) },
                    onNavigateToProfile = { navController.navigate(Routes.PROFILE) },
                    onNavigateToSettings = { navController.navigate(Routes.PROFILE) },
                    onLogout = {
                        authVM.logout()
                        navController.navigate(Routes.LOGIN) { popUpTo(0) { inclusive = true } }
                    }
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
                val epreuveVM: EpreuveViewModel = koinViewModel()
                EpreuveDetailScreen(
                    epreuveId = epreuveId,
                    viewModel = epreuveVM,
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
                val messagerieVM: MessagerieViewModel = koinViewModel()
                ConversationScreen(
                    conversationId = conversationId,
                    viewModel = messagerieVM,
                    onBack = { navController.popBackStack() }
                )
            }

            // 👤 Profil
            composable(Routes.PROFILE) {
                val profileVM: ProfileViewModel = koinViewModel()
                val authVM: AuthViewModel = koinViewModel()
                ProfileScreen(
                    viewModel = profileVM,
                    onBack = { navController.popBackStack() }
                )
            }

            // ── Results (après passation) ──
            composable(Routes.RESULTS) { backStackEntry ->
                val epreuveId = backStackEntry.arguments?.getString("epreuveId") ?: ""
                val passationVM: PassationViewModel = koinViewModel()
                ResultsScreen(
                    epreuveId = epreuveId,
                    viewModel = passationVM,
                    onBack = { navController.popBackStack() }
                )
            }
        }
    }
}
