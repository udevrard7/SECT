// SECT Mobile — Écrans Android Connectés aux ViewModels
package com.sect.mobile.android.ui.screens

import androidx.compose.animation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.sect.mobile.android.ui.viewmodel.*
import com.sect.mobile.shared.domain.enum.Role
import com.sect.mobile.shared.domain.enum.StatutEpreuve
import com.sect.mobile.shared.domain.model.Epreuve
import kotlinx.datetime.Clock

// ══════════════════════════════════════════════════
// SPLASH SCREEN
// ══════════════════════════════════════════════════

@Composable
fun SplashScreen(
    authState: AuthState,
    onNavigateToLogin: () -> Unit,
    onNavigateToDashboard: () -> Unit
) {
    LaunchedEffect(authState) {
        when (authState) {
            is AuthState.Authenticated -> onNavigateToDashboard()
            is AuthState.Unauthenticated -> onNavigateToLogin()
            is AuthState.Error -> onNavigateToLogin()
            AuthState.CheckingToken -> { /* Afficher splash */ }
        }
    }

    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("SECT", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
            Text("Système d'Évaluation", style = MaterialTheme.typography.bodyLarge)
            Spacer(modifier = Modifier.height(24.dp))
            CircularProgressIndicator()
        }
    }
}

// ══════════════════════════════════════════════════
// LOGIN SCREEN
// ══════════════════════════════════════════════════

@Composable
fun LoginScreen(
    viewModel: AuthViewModel,
    onLoginSuccess: () -> Unit
) {
    var identifier by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var showPasswordReset by remember { mutableStateOf(false) }

    val isLoading by viewModel.isLoading.collectAsState()
    val error by viewModel.loginError.collectAsState()
    val authState by viewModel.authState.collectAsState()

    LaunchedEffect(authState) {
        if (authState is AuthState.Authenticated) onLoginSuccess()
    }

    if (showPasswordReset) {
        PasswordResetSheet(
            viewModel = viewModel,
            onDismiss = { showPasswordReset = false }
        )
    }

    Box(modifier = Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            // Logo
            Text("SECT", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
            Text("Système d'Évaluation Casse-Tête", style = MaterialTheme.typography.bodySmall)
            Spacer(modifier = Modifier.height(48.dp))

            // Form
            OutlinedTextField(
                value = identifier,
                onValueChange = { identifier = it },
                label = { Text("Email ou Matricule") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                enabled = !isLoading
            )
            Spacer(modifier = Modifier.height(12.dp))

            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Mot de passe") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                enabled = !isLoading
            )

            error?.let {
                Spacer(modifier = Modifier.height(8.dp))
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }

            Spacer(modifier = Modifier.height(24.dp))

            Button(
                onClick = { viewModel.login(identifier, password) },
                modifier = Modifier.fillMaxWidth().height(48.dp),
                enabled = !isLoading && identifier.isNotBlank() && password.isNotBlank()
            ) {
                if (isLoading) CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                else Text("Se connecter")
            }

            Spacer(modifier = Modifier.height(16.dp))
            TextButton(onClick = { showPasswordReset = true }) {
                Text("Mot de passe oublié ?")
            }
        }
    }
}

@Composable
private fun PasswordResetSheet(
    viewModel: AuthViewModel,
    onDismiss: () -> Unit
) {
    var email by remember { mutableStateOf("") }
    var success by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Mot de passe oublié") },
        text = {
            if (success) {
                Text("Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.")
            } else {
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = { Text("Email") },
                    singleLine = true
                )
            }
        },
        confirmButton = {
            if (!success) {
                TextButton(
                    onClick = {
                        viewModel.requestPasswordReset(email) { success = true }
                    },
                    enabled = email.isNotBlank()
                ) { Text("Envoyer") }
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Fermer") } }
    )
}

// ══════════════════════════════════════════════════
// DASHBOARD SCREEN
// ══════════════════════════════════════════════════

@Composable
fun DashboardScreen(
    viewModel: DashboardViewModel,
    onNavigateToEpreuves: () -> Unit,
    onNavigateToMessagerie: () -> Unit,
    onNavigateToProfile: () -> Unit,
    onNavigateToSettings: () -> Unit,
    onLogout: () -> Unit
) {
    val user by viewModel.user.collectAsState()
    val upcomingEpreuves by viewModel.upcomingEpreuves.collectAsState()
    val stats by viewModel.stats.collectAsState()

    Scaffold(
        bottomBar = {
            NavigationBar {
                NavigationBarItem(selected = true, onClick = {},
                    icon = { Icon(androidx.compose.material.icons.Icons.Default.Home, "Accueil") },
                    label = { Text("Accueil") })
                NavigationBarItem(selected = false, onClick = onNavigateToEpreuves,
                    icon = { Icon(androidx.compose.material.icons.Icons.Default.Assignment, "Épreuves") },
                    label = { Text("Épreuves") })
                NavigationBarItem(selected = false, onClick = onNavigateToMessagerie,
                    icon = { Icon(androidx.compose.material.icons.Icons.Default.Chat, "Messages") },
                    label = { Text("Messages") })
                NavigationBarItem(selected = false, onClick = onNavigateToProfile,
                    icon = { Icon(androidx.compose.material.icons.Icons.Default.Person, "Profil") },
                    label = { Text("Profil") })
            }
        }
    ) { padding ->
        LazyColumn(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
            // Bienvenue
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Bonjour, ${user?.name?.split(" ")?.firstOrNull() ?: "..."}",
                            style = MaterialTheme.typography.headlineSmall)
                        Text(user?.role?.name ?: "", style = MaterialTheme.typography.bodySmall)
                    }
                    Icon(androidx.compose.material.icons.Icons.Default.AccountCircle, null,
                        modifier = Modifier.size(48.dp))
                }
                Spacer(modifier = Modifier.height(16.dp))
            }

            // Stats rapides
            item {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    StatCard("Épreuves", stats.totalEpreuves.toString(), Modifier.weight(1f))
                    StatCard("En cours", stats.enCours.toString(), Modifier.weight(1f))
                    StatCard("Planifiées", stats.planifiees.toString(), Modifier.weight(1f))
                }
                Spacer(modifier = Modifier.height(16.dp))
            }

            // Épreuves à venir
            item {
                Text("Épreuves à venir", style = MaterialTheme.typography.titleMedium)
                Spacer(modifier = Modifier.height(8.dp))
            }

            when (upcomingEpreuves) {
                is UiState.Loading -> item { CircularProgressIndicator() }
                is UiState.Error -> item { Text((upcomingEpreuves as UiState.Error).message,
                    color = MaterialTheme.colorScheme.error) }
                is UiState.Success -> {
                    val epreuves = (upcomingEpreuves as UiState.Success).data
                    if (epreuves.isEmpty()) {
                        item { Text("Aucune épreuve à venir", style = MaterialTheme.typography.bodyMedium) }
                    } else {
                        items(epreuves, key = { it.id }) { epreuve ->
                            EpreuveCard(epreuve, onClick = { /* navigation */ })
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StatCard(label: String, value: String, modifier: Modifier = Modifier) {
    Card(modifier = modifier) {
        Column(modifier = Modifier.padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(value, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text(label, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun EpreuveCard(epreuve: Epreuve, onClick: () -> Unit) {
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(epreuve.titre, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium,
                    maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("${epreuve.duree} min · ${epreuve.questionCount ?: "?"} questions",
                    style = MaterialTheme.typography.bodySmall)
            }
            AssistChip(
                onClick = {},
                label = { Text(epreuve.statut.name, style = MaterialTheme.typography.labelSmall) }
            )
        }
    }
}

// ══════════════════════════════════════════════════
// EPREUVES LIST SCREEN
// ══════════════════════════════════════════════════

@Composable
fun EpreuvesScreen(
    viewModel: EpreuveViewModel,
    onEpreuveClick: (String) -> Unit,
    onBack: () -> Unit
) {
    val epreuves by viewModel.epreuves.collectAsState()
    val searchQuery by viewModel.searchQuery.collectAsState()

    Column(modifier = Modifier.fillMaxSize()) {
        // Search bar
        OutlinedTextField(
            value = searchQuery,
            onValueChange = { viewModel.onSearchChanged(it) },
            label = { Text("Rechercher une épreuve...") },
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            singleLine = true,
            leadingIcon = { Icon(androidx.compose.material.icons.Icons.Default.Search, null) }
        )

        // Filtres par statut
        ScrollableTabRow(selectedTabIndex = 0) {
            viewModel.statutOptions.forEachIndexed { index, (_, label) ->
                Tab(selected = false, onClick = { viewModel.onStatutFilterChanged(viewModel.statutOptions[index].first) },
                    text = { Text(label) })
            }
        }

        // Liste
        when (epreuves) {
            is UiState.Loading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            is UiState.Error -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text((epreuves as UiState.Error).message, color = MaterialTheme.colorScheme.error)
                }
            }
            is UiState.Success -> {
                val list = (epreuves as UiState.Success).data
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(list, key = { it.id }) { epreuve ->
                        EpreuveCard(epreuve, onClick = { onEpreuveClick(epreuve.id) })
                    }
                }
            }
        }
    }
}

// ══════════════════════════════════════════════════
// EPREUVE DETAIL / PASSATION / MESSAGERIE / PROFILE / SETTINGS
// (Ces écrans utilisent maintenant les ViewModels)
// ══════════════════════════════════════════════════

@Composable
fun EpreuveDetailScreen(
    epreuveId: String,
    viewModel: EpreuveViewModel,
    onStartPassation: () -> Unit,
    onBack: () -> Unit
) {
    val epreuveState by viewModel.selectedEpreuve.collectAsState()

    LaunchedEffect(epreuveId) { viewModel.loadEpreuveDetail(epreuveId) }

    when (val state = epreuveState) {
        is UiState.Loading -> {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        }
        is UiState.Error -> {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(state.message, color = MaterialTheme.colorScheme.error)
            }
        }
        is UiState.Success -> {
            val epreuve = state.data
            Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
                Text(epreuve.titre, style = MaterialTheme.typography.headlineMedium)
                Text("${epreuve.duree} min · ${epreuve.questionCount ?: 0} questions · ${epreuve.noteTotal} pts",
                    style = MaterialTheme.typography.bodyMedium)
                Spacer(modifier = Modifier.height(16.dp))

                epreuve.description?.let {
                    Text(it, style = MaterialTheme.typography.bodyMedium)
                    Spacer(modifier = Modifier.height(16.dp))
                }

                Button(onClick = onStartPassation,
                    modifier = Modifier.fillMaxWidth().height(48.dp)) {
                    Text("Commencer l'épreuve")
                }
            }
        }
    }
}

@Composable
fun PassationScreen(
    epreuveId: String,
    viewModel: PassationViewModel,
    onFinish: () -> Unit,
    onBack: () -> Unit
) {
    val session by viewModel.session.collectAsState()
    val remainingSeconds by viewModel.remainingSeconds.collectAsState()
    val currentIdx by viewModel.currentQuestionIndex.collectAsState()
    val localReponses by viewModel.localReponses.collectAsState()
    val isSubmitting by viewModel.isSubmitting.collectAsState()
    val isTimeWarning by viewModel.isTimeWarning.collectAsState()

    LaunchedEffect(epreuveId) { viewModel.startSession(epreuveId) }

    Column(modifier = Modifier.fillMaxSize()) {
        // Timer bar
        TopAppBar(
            title = {
                Text(viewModel.formatTime(remainingSeconds),
                    color = if (isTimeWarning) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface)
            },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(androidx.compose.material.icons.Icons.Default.Close, "Quitter")
                }
            }
        )

        // Question courante
        when (val s = session) {
            is UiState.Success -> {
                val epreuve = s.data.epreuve
                val questions = epreuve?.questions ?: emptyList()

                if (questions.isNotEmpty() && currentIdx < questions.size) {
                    val question = questions[currentIdx]
                    Column(modifier = Modifier.weight(1f).padding(16.dp)) {
                        Text("Question ${currentIdx + 1}/${questions.size}",
                            style = MaterialTheme.typography.labelLarge)
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(question.enonce, style = MaterialTheme.typography.bodyLarge)

                        Spacer(modifier = Modifier.height(16.dp))

                        // Zone de réponse
                        val currentReponse = localReponses[question.id] ?: ""
                        OutlinedTextField(
                            value = currentReponse,
                            onValueChange = { viewModel.onReponseChanged(question.id, it) },
                            label = { Text("Votre réponse") },
                            modifier = Modifier.fillMaxWidth().weight(1f)
                        )
                    }

                    // Navigation
                    Row(modifier = Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { viewModel.previousQuestion() },
                            enabled = currentIdx > 0, modifier = Modifier.weight(1f)) {
                            Text("Précédent")
                        }
                        if (currentIdx < questions.size - 1) {
                            Button(onClick = { viewModel.nextQuestion(questions.size) },
                                modifier = Modifier.weight(1f)) { Text("Suivant") }
                        } else {
                            Button(onClick = { viewModel.submitSession() },
                                enabled = !isSubmitting, modifier = Modifier.weight(1f)) {
                                if (isSubmitting) CircularProgressIndicator(strokeWidth = 2.dp)
                                else Text("Soumettre")
                            }
                        }
                    }
                }
            }
            else -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
        }
    }
}

@Composable
fun MessagerieScreen(
    viewModel: MessagerieViewModel,
    onConversationClick: (String) -> Unit,
    onBack: () -> Unit
) {
    val conversations by viewModel.conversations.collectAsState()

    when (val state = conversations) {
        is UiState.Loading -> {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        }
        is UiState.Error -> Text(state.message, color = MaterialTheme.colorScheme.error)
        is UiState.Success -> {
            LazyColumn(modifier = Modifier.fillMaxSize()) {
                items(state.data, key = { it.id }) { conv ->
                    ListItem(
                        headlineContent = { Text(conv.titre ?: "Conversation") },
                        supportingContent = { Text(conv.type.name) },
                        leadingContent = {
                            Icon(androidx.compose.material.icons.Icons.Default.Chat, null)
                        },
                        modifier = Modifier.clickable { onConversationClick(conv.id) }
                    )
                }
            }
        }
    }
}

@Composable
fun ProfileScreen(
    viewModel: ProfileViewModel,
    onBack: () -> Unit
) {
    val userState by viewModel.user.collectAsState()

    when (val state = userState) {
        is UiState.Loading -> CircularProgressIndicator()
        is UiState.Error -> Text(state.message, color = MaterialTheme.colorScheme.error)
        is UiState.Success -> {
            val user = state.data
            Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
                Text(user.name, style = MaterialTheme.typography.headlineMedium)
                Text(user.email, style = MaterialTheme.typography.bodyMedium)
                Text("Rôle : ${user.role.name}", style = MaterialTheme.typography.bodyMedium)
                user.etablissement?.let { Text("Établissement : ${it.nom}", style = MaterialTheme.typography.bodyMedium) }
                user.filiere?.let { Text("Filière : ${it.nom}", style = MaterialTheme.typography.bodyMedium) }
                user.matricule?.let { Text("Matricule : $it", style = MaterialTheme.typography.bodyMedium) }
            }
        }
    }
}

@Composable
fun SettingsScreen(onBack: () -> Unit) {
    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("Paramètres", style = MaterialTheme.typography.headlineMedium)
        Spacer(modifier = Modifier.height(16.dp))
        Text("À implémenter : thème, notifications, langues, etc.")
    }
}

// Extension pour clickable sur ListItem
private fun Modifier.clickable(onClick: () -> Unit): Modifier =
    this.then(androidx.compose.foundation.clickable(onClick = onClick))
