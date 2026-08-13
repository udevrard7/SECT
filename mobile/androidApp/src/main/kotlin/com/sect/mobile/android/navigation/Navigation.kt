// SECT Mobile — Navigation Android (avec Koin ViewModel injection)
package com.sect.mobile.android.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.sect.mobile.android.ui.screens.*
import com.sect.mobile.android.ui.viewmodel.*
import org.koin.androidx.compose.koinViewModel

object Routes {
    const val SPLASH = "splash"
    const val LOGIN = "login"
    const val DASHBOARD = "dashboard"
    const val EPREUVES = "epreuves"
    const val EPREUVE_DETAIL = "epreuves/{epreuveId}"
    const val PASSATION = "passation/{epreuveId}"
    const val RESULTS = "results/{epreuveId}"
    const val MESSAGERIE = "messagerie"
    const val CONVERSATION = "messagerie/{conversationId}"
    const val PROFILE = "profile"
    const val SETTINGS = "settings"
}

@Composable
fun SECTNavigation(
    navController: NavHostController = rememberNavController(),
    startDestination: String = Routes.SPLASH
) {
    NavHost(navController = navController, startDestination = startDestination) {

        composable(Routes.SPLASH) {
            val authVM: AuthViewModel = koinViewModel()
            SplashScreen(
                authState = authVM.authState.collectAsState().value,
                onNavigateToLogin = { navController.navigate(Routes.LOGIN) },
                onNavigateToDashboard = { navController.navigate(Routes.DASHBOARD) }
            )
        }

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

        composable(Routes.DASHBOARD) {
            val dashboardVM: DashboardViewModel = koinViewModel()
            val authVM: AuthViewModel = koinViewModel()
            DashboardScreen(
                viewModel = dashboardVM,
                onNavigateToEpreuves = { navController.navigate(Routes.EPREUVES) },
                onNavigateToMessagerie = { navController.navigate(Routes.MESSAGERIE) },
                onNavigateToProfile = { navController.navigate(Routes.PROFILE) },
                onNavigateToSettings = { navController.navigate(Routes.SETTINGS) },
                onLogout = {
                    authVM.logout()
                    navController.navigate(Routes.LOGIN) { popUpTo(0) { inclusive = true } }
                }
            )
        }

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

        composable(Routes.MESSAGERIE) {
            val messagerieVM: MessagerieViewModel = koinViewModel()
            MessagerieScreen(
                viewModel = messagerieVM,
                onConversationClick = { id -> navController.navigate("messagerie/$id") },
                onBack = { navController.popBackStack() }
            )
        }

        composable(Routes.PROFILE) {
            val profileVM: ProfileViewModel = koinViewModel()
            ProfileScreen(
                viewModel = profileVM,
                onBack = { navController.popBackStack() }
            )
        }

        composable(Routes.SETTINGS) {
            SettingsScreen(onBack = { navController.popBackStack() })
        }
    }
}

// Helper pour collectAsState dans navigation
@Composable
private fun <T> kotlinx.coroutines.flow.StateFlow<T>.collectAsState() =
    androidx.compose.runtime.collectAsState(initial = this.value)
