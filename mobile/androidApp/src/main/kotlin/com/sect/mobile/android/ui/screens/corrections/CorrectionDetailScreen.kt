package com.sect.mobile.android.ui.screens.corrections

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.sect.mobile.android.ui.viewmodel.CorrectionDetailViewModel
import com.sect.mobile.android.ui.viewmodel.FinalizeState
import com.sect.mobile.android.ui.viewmodel.SaveState
import com.sect.mobile.shared.domain.model.CorrectionReponse
import com.sect.mobile.shared.domain.model.CorrectionSession

/**
 * Écran détail de correction — notation question par question.
 *
 * SECT-MOBILE-CORRECTION-1 :
 * - Affiche les réponses de l'étudiant avec l'énoncé de chaque question
 * - Permet de saisir/modifier le score + commentaire par question
 * - Boutons Finaliser (calcule score final) + Retourner (envoie à l'étudiant)
 *
 * La session est transmise via CorrectionSessionHolder (pas de GET unitaire backend).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CorrectionDetailScreen(
    sessionId: String,
    onBackClick: () -> Unit,
    onReturned: () -> Unit,
    viewModel: CorrectionDetailViewModel = koinViewModel()
) {
    val session by viewModel.session.collectAsState()
    val saveState by viewModel.saveState.collectAsState()
    val finalizeState by viewModel.finalizeState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Correction") },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Retour")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary,
                    navigationIconContentColor = MaterialTheme.colorScheme.onPrimary
                )
            )
        },
        bottomBar = {
            if (session != null) {
                CorrectionBottomBar(
                    session = session!!,
                    finalizeState = finalizeState,
                    onFinalize = viewModel::finalize,
                    onRetourner = { viewModel.retourner(onSuccess = onReturned) }
                )
            }
        }
    ) { paddingValues ->
        val current = session
        if (current == null) {
            // Session non disponible dans le holder (ex: app tuée et relancée
            // directement sur cette route) — pas de GET unitaire backend possible.
            Box(
                modifier = Modifier.fillMaxSize().padding(paddingValues),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Session non disponible", style = MaterialTheme.typography.titleMedium)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("Revenez à la liste des corrections.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(modifier = Modifier.height(16.dp))
                    Button(onClick = onBackClick) { Text("Retour à la liste") }
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(paddingValues),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // En-tête : étudiant + épreuve + indicateurs
                item { CorrectionHeader(current) }

                // Snackbars d'état save/finalize
                if (saveState is SaveState.Error) {
                    item {
                        Text((saveState as SaveState.Error).message,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall)
                    }
                }
                if (finalizeState is FinalizeState.Error) {
                    item {
                        Text((finalizeState as FinalizeState.Error).message,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall)
                    }
                }

                // Réponses à corriger
                items(current.reponses, key = { it.id }) { reponse ->
                    ReponseCard(
                        reponse = reponse,
                        saveState = saveState,
                        onSave = { score, commentaire ->
                            viewModel.saveGrade(reponse.questionId, score, commentaire)
                        }
                    )
                }
            }
        }
    }
}

@Composable
private fun CorrectionHeader(session: CorrectionSession) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer
        )
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(session.etudiantNom.ifEmpty { "Étudiant" },
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onPrimaryContainer)
            Text(session.epreuveTitre,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onPrimaryContainer)
            Spacer(modifier = Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                InfoChip("Statut", session.statut)
                InfoChip("À corriger", "${session.needsCorrectionCount}")
                if (session.alertes > 0) {
                    InfoChip("Alertes", "${session.alertes}")
                }
            }
        }
    }
}

@Composable
private fun InfoChip(label: String, value: String) {
    Surface(
        shape = MaterialTheme.shapes.small,
        color = MaterialTheme.colorScheme.surface
    ) {
        Column(modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)) {
            Text(label, style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun ReponseCard(
    reponse: CorrectionReponse,
    saveState: SaveState,
    onSave: (Double?, String?) -> Unit
) {
    // États locaux pour le score et le commentaire
    var scoreText by remember(reponse.id) {
        mutableStateOf(reponse.score?.toString() ?: "")
    }
    var commentaire by remember(reponse.id) {
        mutableStateOf(reponse.commentaire ?: "")
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // Numéro + type + barème
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Question ${reponse.ordre}",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold)
                Text("/ ${reponse.bareme} pts",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (reponse.type != null) {
                Text(reponse.type,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Énoncé
            if (!reponse.enonce.isNullOrBlank()) {
                Text("Énoncé :", style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(reponse.enonce,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(top = 4.dp))
                Spacer(modifier = Modifier.height(8.dp))
            }

            // Réponse de l'étudiant
            Text("Réponse de l'étudiant :", style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                reponse.contenu ?: "(aucune réponse)",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = 4.dp, bottom = 8.dp)
            )

            // Suggestion IA
            if (reponse.noteIA != null) {
                Spacer(modifier = Modifier.height(4.dp))
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.tertiaryContainer.copy(alpha = 0.5f)
                    )
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.AutoAwesome, contentDescription = null,
                                modifier = Modifier.size(16.dp),
                                tint = MaterialTheme.colorScheme.onTertiaryContainer)
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Suggestion IA",
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onTertiaryContainer)
                            Spacer(modifier = Modifier.weight(1f))
                            Text("${reponse.noteIA}/${reponse.bareme}",
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onTertiaryContainer)
                        }
                        if (!reponse.justificationIA.isNullOrBlank()) {
                            Text(reponse.justificationIA,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onTertiaryContainer,
                                modifier = Modifier.padding(top = 4.dp))
                        }
                        TextButton(onClick = { scoreText = reponse.noteIA.toString() }) {
                            Text("Appliquer la suggestion")
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Saisie du score
            OutlinedTextField(
                value = scoreText,
                onValueChange = { scoreText = it },
                label = { Text("Note (sur ${reponse.bareme})") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(8.dp))

            // Saisie du commentaire
            OutlinedTextField(
                value = commentaire,
                onValueChange = { commentaire = it },
                label = { Text("Commentaire (optionnel)") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2
            )

            Spacer(modifier = Modifier.height(8.dp))

            // Bouton sauvegarder
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (saveState is SaveState.Saved) {
                    Text("Enregistré ✓",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary)
                    Spacer(modifier = Modifier.width(8.dp))
                }
                Button(
                    onClick = {
                        val s = scoreText.trim().toDoubleOrNull()
                        val c = commentaire.trim().ifBlank { null }
                        onSave(s, c)
                    }
                ) {
                    Text("Enregistrer")
                }
            }
        }
    }
}

@Composable
private fun CorrectionBottomBar(
    session: CorrectionSession,
    finalizeState: FinalizeState,
    onFinalize: () -> Unit,
    onRetourner: () -> Unit
) {
    Surface(tonalElevation = 3.dp) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Score auto-calculé si disponible
            if (session.score != null) {
                Text("Score: ${session.score}",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold)
            }
            Spacer(modifier = Modifier.weight(1f))

            // Bouton Finaliser (visible si pas encore RETOURNEE)
            if (session.statut != "RETOURNEE") {
                if (session.statut == "SOUMISE") {
                    OutlinedButton(
                        onClick = onFinalize,
                        enabled = finalizeState !is FinalizeState.Processing
                    ) {
                        Icon(Icons.Default.CheckCircle, contentDescription = null,
                            modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Finaliser")
                    }
                }
                Button(
                    onClick = onRetourner,
                    enabled = finalizeState !is FinalizeState.Processing &&
                        (session.statut == "CORRIGEE" || session.allCorrected)
                ) {
                    Icon(Icons.Default.Send, contentDescription = null,
                        modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Retourner")
                }
            } else {
                Text("Copie retournée à l'étudiant",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Bold)
            }
        }
    }
}
