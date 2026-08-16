// SECT Mobile — Écrans Android Connectés aux ViewModels
package com.sect.mobile.android.ui.screens

import androidx.compose.animation.*
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.*
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

@OptIn(ExperimentalMaterial3Api::class)

// ══════════════════════════════════════════════════
// SPLASH SCREEN
// ══════════════════════════════════════════════════

@Composable
fun SplashScreen(
    authState: AuthState,
    onNavigateToLogin: () -> Unit,
    onNavigateToDashboard: () -> Unit,
    onNavigateToWebRedirect: () -> Unit = {}
) {
    LaunchedEffect(authState) {
        when (authState) {
            is AuthState.Authenticated -> onNavigateToDashboard()
            is AuthState.RedirectToWeb -> onNavigateToWebRedirect()
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
// WEB REDIRECT SCREEN — pour ADMIN / RESPONSABLE
// L'app mobile est réservée aux enseignants et étudiants
// ══════════════════════════════════════════════════

@Composable
fun WebRedirectScreen(
    userName: String,
    role: String,
    onBackToLogin: () -> Unit
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val intent = remember {
        android.content.Intent(
            android.content.Intent.ACTION_VIEW,
            android.net.Uri.parse("https://sect-app.vercel.app")
        )
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = Icons.Default.Devices,
                contentDescription = null,
                modifier = Modifier.size(64.dp),
                tint = MaterialTheme.colorScheme.primary
            )
            Spacer(modifier = Modifier.height(24.dp))
            Text(
                "Bonjour $userName",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                "Votre rôle ($role) nécessite l'interface web",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                "L'application mobile SECT est réservée aux enseignants et étudiants.\n" +
                "Pour accéder à toutes les fonctionnalités d'administration, utilisez la version web.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center
            )
            Spacer(modifier = Modifier.height(32.dp))
            Button(
                onClick = { context.startActivity(intent) },
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Default.OpenInBrowser, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Ouvrir l'interface web")
            }
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedButton(
                onClick = onBackToLogin,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Retour à la connexion")
            }
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
        when (authState) {
            is AuthState.Authenticated -> onLoginSuccess()
            is AuthState.RedirectToWeb -> onLoginSuccess() // Navigue vers WebRedirect via SPLASH
            else -> {}
        }
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
    // Stats dérivées des épreuves à venir (le VM expose enseignantStats / etudiantStats séparément,
    // non fusionnés en une seule propriété `stats`).
    val upcomingList = (upcomingEpreuves as? UiState.Success)?.data ?: emptyList()
    val totalEpreuves = upcomingList.size
    val enCours = upcomingList.count { it.statut == StatutEpreuve.EN_COURS }
    val planifiees = upcomingList.count { it.statut == StatutEpreuve.PLANIFIEE }
    val isEnseignant = viewModel.isEnseignant

    LazyColumn(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        // ── En-tête : bienvenue ──
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "Bonjour, ${user?.name?.split(" ")?.firstOrNull() ?: "..."}",
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        if (isEnseignant) "Enseignant" else "Étudiant",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Icon(Icons.Default.AccountCircle, null, modifier = Modifier.size(48.dp))
            }
            Spacer(modifier = Modifier.height(16.dp))
        }

        // ── Stats rapides ──
        item {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StatCard("Épreuves", totalEpreuves.toString(), Modifier.weight(1f))
                StatCard("En cours", enCours.toString(), Modifier.weight(1f))
                StatCard("À venir", planifiees.toString(), Modifier.weight(1f))
            }
            Spacer(modifier = Modifier.height(16.dp))
        }

        // ── Titre section ──
        item {
            Text(
                if (isEnseignant) "Épreuves à surveiller" else "Mes épreuves à venir",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(modifier = Modifier.height(8.dp))
        }

        // ── Liste des épreuves ──
        when (upcomingEpreuves) {
            is UiState.Loading -> item {
                Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            is UiState.Error -> item {
                Text(
                    (upcomingEpreuves as UiState.Error).message,
                    color = MaterialTheme.colorScheme.error
                )
            }
            is UiState.Success -> {
                val epreuves = (upcomingEpreuves as UiState.Success).data
                if (epreuves.isEmpty()) {
                    item {
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Column(
                                modifier = Modifier.padding(24.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Icon(
                                    Icons.Default.EventBusy,
                                    contentDescription = null,
                                    modifier = Modifier.size(48.dp),
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    "Aucune épreuve à venir",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                } else {
                    items(epreuves, key = { it.id }) { epreuve ->
                        EpreuveCard(epreuve, onClick = onNavigateToEpreuves)
                    }
                }
            }
        }

        // ── Raccourci vers toutes les épreuves ──
        item {
            Spacer(modifier = Modifier.height(16.dp))
            OutlinedButton(
                onClick = onNavigateToEpreuves,
                modifier = Modifier.fillMaxWidth()
            ) {
 Text("Voir toutes les épreuves")
                Spacer(modifier = Modifier.width(8.dp))
                Icon(Icons.Default.ArrowForward, contentDescription = null, modifier = Modifier.size(16.dp))
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

@OptIn(ExperimentalMaterial3Api::class)
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
        is UiState.Loading -> Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        is UiState.Error -> Text(state.message, color = MaterialTheme.colorScheme.error)
        is UiState.Success -> {
            val user = state.data
            LazyColumn(modifier = Modifier.fillMaxSize().padding(16.dp)) {
                // ── En-tête profil ──
                item {
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(Icons.Default.AccountCircle, null, modifier = Modifier.size(64.dp),
                                tint = MaterialTheme.colorScheme.primary)
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(user.name, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                            Text(user.email, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(modifier = Modifier.height(4.dp))
                            AssistChip(onClick = {}, label = { Text(user.role.name) })
                        }
                    }
                    Spacer(modifier = Modifier.height(16.dp))
                }

                // ── Infos ──
                item {
                    Text("Informations", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(8.dp))
                }
                item {
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            user.etablissement?.let { InfoRow("Établissement", it.nom) }
                            user.filiere?.let { InfoRow("Filière", it.nom) }
                            user.matricule?.let { InfoRow("Matricule", it) }
                            InfoRow("Rôle", user.role.name)
                        }
                    }
                    Spacer(modifier = Modifier.height(16.dp))
                }

                // ── Paramètres ──
                item {
                    Text("Paramètres", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(8.dp))
                }
                item {
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text("SECT Mobile v1.0.0", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text("Système d'Évaluation Casse-Tête", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    Spacer(modifier = Modifier.height(24.dp))
                }
            }
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
    }
}

// ══════════════════════════════════════════════════
// SETTINGS SCREEN
// ══════════════════════════════════════════════════

@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    onLogout: () -> Unit
) {
    var isDarkTheme by remember { mutableStateOf(false) }
    var isBiometricEnabled by remember { mutableStateOf(false) }
    var isNotificationEnabled by remember { mutableStateOf(true) }
    var isAutoSaveEnabled by remember { mutableStateOf(true) }

    LazyColumn(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        item {
            Text("Paramètres", style = MaterialTheme.typography.headlineMedium)
            Spacer(modifier = Modifier.height(24.dp))
        }

        // ── Apparence ──
        item {
            Text("Apparence", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Spacer(modifier = Modifier.height(8.dp))
        }
        item {
            Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Row(
                    modifier = Modifier.padding(16.dp).fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(androidx.compose.material.icons.Icons.Default.DarkMode, "Thème sombre")
                        Spacer(modifier = Modifier.width(12.dp))
                        Text("Thème sombre")
                    }
                    Switch(checked = isDarkTheme, onCheckedChange = { isDarkTheme = it })
                }
            }
        }

        item { Spacer(modifier = Modifier.height(16.dp)) }

        // ── Sécurité ──
        item {
            Text("Sécurité", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Spacer(modifier = Modifier.height(8.dp))
        }
        item {
            Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Row(
                    modifier = Modifier.padding(16.dp).fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(androidx.compose.material.icons.Icons.Default.Fingerprint, "Biométrie")
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text("Authentification biométrique")
                            Text("Face ID / Empreinte digitale", style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    Switch(checked = isBiometricEnabled, onCheckedChange = { isBiometricEnabled = it })
                }
            }
        }

        item { Spacer(modifier = Modifier.height(16.dp)) }

        // ── Examens ──
        item {
            Text("Examens", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Spacer(modifier = Modifier.height(8.dp))
        }
        item {
            Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Row(
                    modifier = Modifier.padding(16.dp).fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(androidx.compose.material.icons.Icons.Default.Notifications, "Notifications")
                        Spacer(modifier = Modifier.width(12.dp))
                        Text("Notifications examens")
                    }
                    Switch(checked = isNotificationEnabled, onCheckedChange = { isNotificationEnabled = it })
                }
            }
        }
        item {
            Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Row(
                    modifier = Modifier.padding(16.dp).fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(androidx.compose.material.icons.Icons.Default.Save, "Auto-save")
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text("Sauvegarde automatique")
                            Text("Toutes les 30 secondes pendant l'examen", style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    Switch(checked = isAutoSaveEnabled, onCheckedChange = { isAutoSaveEnabled = it })
                }
            }
        }

        item { Spacer(modifier = Modifier.height(16.dp)) }

        // ── Informations ──
        item {
            Text("Informations", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Spacer(modifier = Modifier.height(8.dp))
        }
        item {
            Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(androidx.compose.material.icons.Icons.Default.Info, "Version")
                        Spacer(modifier = Modifier.width(12.dp))
                        Text("SECT Mobile v1.0.0")
                    }
                    Spacer(modifier = Modifier.height(4.dp))
                    Text("Système d'Évaluation Casse-Tête", style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }

        item { Spacer(modifier = Modifier.height(24.dp)) }

        // ── Déconnexion ──
        item {
            OutlinedButton(
                onClick = onLogout,
                modifier = Modifier.fillMaxWidth().height(48.dp),
                colors = ButtonDefaults.outlinedButtonColors(
                    contentColor = MaterialTheme.colorScheme.error
                )
            ) {
                Icon(androidx.compose.material.icons.Icons.Default.Logout, "Déconnexion")
                Spacer(modifier = Modifier.width(8.dp))
                Text("Déconnexion")
            }
        }
    }
}

// ══════════════════════════════════════════════════
// RESULTS SCREEN
// ══════════════════════════════════════════════════

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ResultsScreen(
    epreuveId: String,
    viewModel: PassationViewModel,
    onBack: () -> Unit
) {
    val session by viewModel.session.collectAsState()

    LaunchedEffect(epreuveId) {
        // La session est déjà chargée depuis la passation
    }

    Column(modifier = Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Résultats") },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, "Retour")
                }
            }
        )

        when (val s = session) {
            is UiState.Loading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            is UiState.Error -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(s.message, color = MaterialTheme.colorScheme.error)
                        Spacer(modifier = Modifier.height(16.dp))
                        OutlinedButton(onClick = onBack) { Text("Retour") }
                    }
                }
            }
            is UiState.Success -> {
                val sessionData = s.data
                LazyColumn(modifier = Modifier.fillMaxSize().padding(16.dp)) {
                    // Score principal
                    item {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.primaryContainer
                            )
                        ) {
                            Column(
                                modifier = Modifier.padding(24.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text("Note obtenue", style = MaterialTheme.typography.labelLarge,
                                    color = MaterialTheme.colorScheme.onPrimaryContainer)
                                Spacer(modifier = Modifier.height(8.dp))
                                val note = sessionData.note ?: 0.0
                                val noteTotal = sessionData.epreuve?.noteTotal ?: 20.0
                                Text(
                                    "${"%.1f".format(note)}/$noteTotal",
                                    style = MaterialTheme.typography.displaySmall,
                                    fontWeight = FontWeight.Bold,
                                    color = if (note >= noteTotal / 2) MaterialTheme.colorScheme.primary
                                           else MaterialTheme.colorScheme.error
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                val percentage = if (noteTotal > 0) (note / noteTotal * 100).toInt() else 0
                                Text("$percentage%", style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onPrimaryContainer)
                            }
                        }
                        Spacer(modifier = Modifier.height(16.dp))
                    }

                    // Détails session
                    item {
                        Text("Détails de la session", style = MaterialTheme.typography.titleMedium)
                        Spacer(modifier = Modifier.height(8.dp))
                    }

                    // Statistiques rapides
                    item {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            val reponses = sessionData.reponses ?: emptyList()
                            val answered = reponses.count { it.contenu != null }
                            val totalQ = sessionData.epreuve?.questionCount ?: reponses.size
                            StatCard("Répondu", "$answered/$totalQ", Modifier.weight(1f))
                            StatCard("Alertes", "${sessionData.proctoringAlerts}", Modifier.weight(1f))
                            StatCard("Pénalité", "${"%.1f".format(sessionData.penaliteProctoring ?: 0.0)}pt", Modifier.weight(1f))
                        }
                        Spacer(modifier = Modifier.height(16.dp))
                    }

                    // Détail par question
                    if (sessionData.reponses?.isNotEmpty() == true) {
                        item {
                            Text("Détail par question", style = MaterialTheme.typography.titleMedium)
                            Spacer(modifier = Modifier.height(8.dp))
                        }
                        items(sessionData.reponses!!, key = { it.id }) { reponse ->
                            Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                                Row(
                                    modifier = Modifier.padding(12.dp).fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text("Question ${reponse.questionId.takeLast(4)}",
                                            style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                                        reponse.contenu?.let {
                                            Text(it, style = MaterialTheme.typography.bodySmall,
                                                maxLines = 2, overflow = TextOverflow.Ellipsis)
                                        }
                                        reponse.feedbackAi?.let {
                                            Spacer(modifier = Modifier.height(4.dp))
                                            Text("IA : $it", style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.primary)
                                        }
                                    }
                                    Column(horizontalAlignment = Alignment.End) {
                                        val noteQ = reponse.note ?: reponse.noteAi
                                        if (noteQ != null) {
                                            Text("${"%.1f".format(noteQ)} pt",
                                                style = MaterialTheme.typography.bodyMedium,
                                                fontWeight = FontWeight.Bold,
                                                color = if (noteQ > 0) MaterialTheme.colorScheme.primary
                                                       else MaterialTheme.colorScheme.error)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// ══════════════════════════════════════════════════
// CONVERSATION SCREEN
// ══════════════════════════════════════════════════

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConversationScreen(
    conversationId: String,
    viewModel: MessagerieViewModel,
    onBack: () -> Unit
) {
    val messages by viewModel.messages.collectAsState()
    val messageText by viewModel.messageText.collectAsState()
    val isSending by viewModel.isSending.collectAsState()

    LaunchedEffect(conversationId) { viewModel.selectConversation(conversationId) }

    Column(modifier = Modifier.fillMaxSize()) {
        // Header
        TopAppBar(
            title = { Text("Conversation") },
            navigationIcon = {
                IconButton(onClick = {
                    viewModel.backToConversations()
                    onBack()
                }) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, "Retour")
                }
            }
        )

        // Messages
        when (val state = messages) {
            is UiState.Loading -> {
                Box(modifier = Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            is UiState.Error -> {
                Box(modifier = Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Text(state.message, color = MaterialTheme.colorScheme.error)
                }
            }
            is UiState.Success -> {
                LazyColumn(
                    modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = 16.dp),
                    reverseLayout = true
                ) {
                    items(state.data, key = { it.id }) { message ->
                        val isMe = message.expediteurId == viewModel.selectedConversationId.value
                        MessageBubble(
                            message = message,
                            isMe = isMe
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                    }
                }
            }
        }

        // Input zone
        Surface(
            modifier = Modifier.fillMaxWidth(),
            tonalElevation = 3.dp
        ) {
            Row(
                modifier = Modifier.padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedTextField(
                    value = messageText,
                    onValueChange = { viewModel.onMessageTextChanged(it) },
                    placeholder = { Text("Écrire un message...") },
                    modifier = Modifier.weight(1f),
                    maxLines = 3,
                    enabled = !isSending
                )
                IconButton(
                    onClick = { viewModel.sendMessage() },
                    enabled = messageText.isNotBlank() && !isSending
                ) {
                    if (isSending) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    } else {
                        Icon(Icons.AutoMirrored.Filled.Send, "Envoyer",
                            tint = if (messageText.isNotBlank()) MaterialTheme.colorScheme.primary
                                   else MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

@Composable
private fun MessageBubble(message: com.sect.mobile.shared.domain.model.Message, isMe: Boolean) {
    val alignment = if (isMe) Alignment.End else Alignment.Start
    val color = if (isMe) MaterialTheme.colorScheme.primaryContainer
                else MaterialTheme.colorScheme.surfaceVariant
    val textColor = if (isMe) MaterialTheme.colorScheme.onPrimaryContainer
                   else MaterialTheme.colorScheme.onSurfaceVariant

    Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = alignment) {
        Surface(
            shape = MaterialTheme.shapes.medium,
            color = color,
            modifier = Modifier.widthIn(max = 280.dp)
        ) {
            Column(modifier = Modifier.padding(10.dp)) {
                if (!isMe) {
                    message.expediteur?.name?.let {
                        Text(it, style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)
                        Spacer(modifier = Modifier.height(2.dp))
                    }
                }
                Text(message.contenu, style = MaterialTheme.typography.bodyMedium, color = textColor)
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    message.createdAt.toString().take(19),
                    style = MaterialTheme.typography.labelSmall,
                    color = textColor.copy(alpha = 0.6f)
                )
            }
        }
    }
}

// Extension pour clickable sur ListItem — déjà importé via androidx.compose.foundation.clickable
