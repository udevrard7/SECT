// SECT Mobile — Navigation Android
package com.sect.mobile.android.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.sect.mobile.android.ui.screens.*

// ── Routes ──
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
    NavHost(
        navController = navController,
        startDestination = startDestination
    ) {
        composable(Routes.SPLASH) {
            SplashScreen(
                onNavigateToLogin = { navController.navigate(Routes.LOGIN) },
                onNavigateToDashboard = { navController.navigate(Routes.DASHBOARD) }
            )
        }

        composable(Routes.LOGIN) {
            LoginScreen(
                onLoginSuccess = { navController.navigate(Routes.DASHBOARD) {
                    popUpTo(Routes.SPLASH) { inclusive = true }
                }}
            )
        }

        composable(Routes.DASHBOARD) {
            DashboardScreen(
                onNavigateToEpreuves = { navController.navigate(Routes.EPREUVES) },
                onNavigateToMessagerie = { navController.navigate(Routes.MESSAGERIE) },
                onNavigateToProfile = { navController.navigate(Routes.PROFILE) },
                onNavigateToSettings = { navController.navigate(Routes.SETTINGS) },
                onLogout = {
                    navController.navigate(Routes.LOGIN) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            )
        }

        composable(Routes.EPREUVES) {
            EpreuvesScreen(
                onEpreuveClick = { id ->
                    navController.navigate("epreuves/$id")
                },
                onBack = { navController.popBackStack() }
            )
        }

        composable(Routes.EPREUVE_DETAIL) { backStackEntry ->
            val epreuveId = backStackEntry.arguments?.getString("epreuveId") ?: ""
            EpreuveDetailScreen(
                epreuveId = epreuveId,
                onStartPassation = { navController.navigate("passation/$epreuveId") },
                onBack = { navController.popBackStack() }
            )
        }

        composable(Routes.PASSATION) { backStackEntry ->
            val epreuveId = backStackEntry.arguments?.getString("epreuveId") ?: ""
            PassationScreen(
                epreuveId = epreuveId,
                onFinish = { navController.navigate("results/$epreuveId") },
                onBack = { navController.popBackStack() }
            )
        }

        composable(Routes.MESSAGERIE) {
            MessagerieScreen(
                onConversationClick = { id ->
                    navController.navigate("messagerie/$id")
                },
                onBack = { navController.popBackStack() }
            )
        }

        composable(Routes.PROFILE) {
            ProfileScreen(
                onBack = { navController.popBackStack() }
            )
        }

        composable(Routes.SETTINGS) {
            SettingsScreen(
                onBack = { navController.popBackStack() }
            )
        }
    }
}
