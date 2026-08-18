// SECT Mobile — ResultatDetailScreen (Android Compose)
// SECT-MOBILE-PARITY-R1 : détail d'un résultat étudiant par epreuveId.
//
// Utilise GET /api/resultats?epreuveId=X (backend existant).
// Affiche le score final, le statut et les commentaires.
// Le ResultatDetail du domaine KMP est un objet simple (scoreFinal, totalPossible,
// commentaires) — les réponses détaillées par question sont dans le domaine Session
// (non exposé ici pour l'instant, futur R2).
package com.sect.mobile.android.ui.screens.resultats

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.sect.mobile.android.ui.components.*
import com.sect.mobile.android.ui.viewmodel.ResultatDetailUiState
import com.sect.mobile.android.ui.viewmodel.ResultatsViewModel
import com.sect.mobile.shared.domain.model.ResultatDetail
import org.koin.androidx.compose.koinViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ResultatDetailScreen(
    epreuveId: String,
    onBack: () -> Unit,
    viewModel: ResultatsViewModel = koinViewModel()
) {
    LaunchedEffect(epreuveId) { viewModel.loadResultatDetail(epreuveId) }
    val state by viewModel.detailState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Détail du résultat") },
                navigationIcon = {
                    IconButton(onClick = { viewModel.resetDetail(); onBack() }) {
                        Icon(Icons.Default.ArrowBack, "Retour")
                    }
                }
            )
        }
    ) { padding ->
        when (val s = state) {
            is ResultatDetailUiState.Loading -> {
                Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            is ResultatDetailUiState.Error -> {
                Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                    Text(s.message, color = MaterialTheme.colorScheme.error)
                }
            }
            is ResultatDetailUiState.Success -> ResultatDetailContent(s.detail, padding)
            else -> {
                Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                    Text("Sélectionnez un résultat")
                }
            }
        }
    }
}

@Composable
private fun ResultatDetailContent(detail: ResultatDetail, padding: PaddingValues) {
    val scoreFinal = detail.scoreFinal
    val totalPossible = if (detail.totalPossible > 0) detail.totalPossible else 20.0
    val pourcentage = (scoreFinal / totalPossible) * 100.0
    val estReussi = pourcentage >= 50.0
    val scoreColor = if (estReussi) androidx.compose.ui.graphics.Color(0xFF84CC16)
                     else androidx.compose.ui.graphics.Color(0xFFEF4444)

    Column(
        modifier = Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        KenteDivider(thickness = 3)

        // Score principal
        GlassCard {
            Column(modifier = Modifier.padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Note obtenue", style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("${"%.1f".format(scoreFinal)} / ${"%.0f".format(totalPossible)}",
                    style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Bold, color = scoreColor)
                Text("${pourcentage.toInt()}%", style = MaterialTheme.typography.titleMedium, color = scoreColor)
                SectBadge(
                    text = if (estReussi) "Réussi" else "À refaire",
                    color = scoreColor
                )
            }
        }

        // Commentaires
        detail.commentaires?.let { comm ->
            if (comm.isNotEmpty()) {
                GlassCard {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Commentaires", fontWeight = FontWeight.Bold)
                        Text(comm, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }

        // Dates
        detail.dateCorrection?.let { date ->
            Text("Corrigé le ${date.take(10)}", style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        detail.dateRetour?.let { date ->
            Text("Retourné le ${date.take(10)}", style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        KenteDivider(thickness = 3)
    }
}
