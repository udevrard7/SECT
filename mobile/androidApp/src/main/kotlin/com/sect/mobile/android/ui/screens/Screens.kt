// SECT Mobile — Écrans Android (placeholders pour la structure initiale)
package com.sect.mobile.android.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

// ── Splash Screen ──
@Composable
fun SplashScreen(
    onNavigateToLogin: () -> Unit,
    onNavigateToDashboard: () -> Unit
) {
    // TODO: Vérifier si l'utilisateur est déjà authentifié
    // Si oui → onNavigateToDashboard(), sinon → onNavigateToLogin()
    LaunchedEffect(Unit) {
        // Vérification du token en cache
        onNavigateToLogin()
    }

    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("SECT", style = MaterialTheme.typography.headlineLarge)
            Text("Système d'Évaluation", style = MaterialTheme.typography.bodyLarge)
            Spacer(modifier = Modifier.height(16.dp))
            CircularProgressIndicator()
        }
    }
}

// ── Login Screen ──
@Composable
fun LoginScreen(onLoginSuccess: () -> Unit) {
    var identifier by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Box(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("SECT", style = MaterialTheme.typography.headlineLarge)
            Text("Connexion", style = MaterialTheme.typography.titleMedium)
            Spacer(modifier = Modifier.height(32.dp))

            OutlinedTextField(
                value = identifier,
                onValueChange = { identifier = it },
                label = { Text("Email ou Matricule") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            Spacer(modifier = Modifier.height(16.dp))

            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Mot de passe") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            error?.let {
                Spacer(modifier = Modifier.height(8.dp))
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }

            Spacer(modifier = Modifier.height(24.dp))

            Button(
                onClick = {
                    isLoading = true
                    // TODO: Appeler repository.login(identifier, password)
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = !isLoading && identifier.isNotBlank() && password.isNotBlank()
            ) {
                if (isLoading) CircularProgressIndicator(modifier = Modifier.size(20.dp))
                else Text("Se connecter")
            }

            Spacer(modifier = Modifier.height(16.dp))

            TextButton(onClick = { /* TODO: Mot de passe oublié */ }) {
                Text("Mot de passe oublié ?")
            }
        }
    }
}

// ── Dashboard Screen ──
@Composable
fun DashboardScreen(
    onNavigateToEpreuves: () -> Unit,
    onNavigateToMessagerie: () -> Unit,
    onNavigateToProfile: () -> Unit,
    onNavigateToSettings: () -> Unit,
    onLogout: () -> Unit
) {
    Scaffold(
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = true,
                    onClick = { },
                    icon = { Icon(androidx.compose.material.icons.Icons.Default.Home, "Accueil") },
                    label = { Text("Accueil") }
                )
                NavigationBarItem(
                    selected = false,
                    onClick = onNavigateToEpreuves,
                    icon = { Icon(androidx.compose.material.icons.Icons.Default.Assignment, "Épreuves") },
                    label = { Text("Épreuves") }
                )
                NavigationBarItem(
                    selected = false,
                    onClick = onNavigateToMessagerie,
                    icon = { Icon(androidx.compose.material.icons.Icons.Default.Chat, "Messages") },
                    label = { Text("Messages") }
                )
                NavigationBarItem(
                    selected = false,
                    onClick = onNavigateToProfile,
                    icon = { Icon(androidx.compose.material.icons.Icons.Default.Person, "Profil") },
                    label = { Text("Profil") }
                )
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("Tableau de bord", style = MaterialTheme.typography.headlineMedium)
            Text("Bienvenue sur SECT Mobile", style = MaterialTheme.typography.bodyLarge)
        }
    }
}

// ── Epreuves Screen ──
@Composable
fun EpreuvesScreen(
    onEpreuveClick: (String) -> Unit,
    onBack: () -> Unit
) {
    // TODO: Implémenter avec repository.listEpreuves()
    Text("Épreuves — à implémenter")
}

// ── Epreuve Detail Screen ──
@Composable
fun EpreuveDetailScreen(
    epreuveId: String,
    onStartPassation: () -> Unit,
    onBack: () -> Unit
) {
    Text("Détail épreuve $epreuveId — à implémenter")
}

// ── Passation Screen ──
@Composable
fun PassationScreen(
    epreuveId: String,
    onFinish: () -> Unit,
    onBack: () -> Unit
) {
    Text("Passation épreuve $epreuveId — à implémenter")
}

// ── Messagerie Screen ──
@Composable
fun MessagerieScreen(
    onConversationClick: (String) -> Unit,
    onBack: () -> Unit
) {
    Text("Messagerie — à implémenter")
}

// ── Profile Screen ──
@Composable
fun ProfileScreen(onBack: () -> Unit) {
    Text("Profil — à implémenter")
}

// ── Settings Screen ──
@Composable
fun SettingsScreen(onBack: () -> Unit) {
    Text("Paramètres — à implémenter")
}
