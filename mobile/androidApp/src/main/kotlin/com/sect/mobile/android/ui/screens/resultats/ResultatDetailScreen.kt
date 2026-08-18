// SECT Mobile — ResultatDetailScreen (Android Compose)
// SECT-MOBILE-PARITY-R1 : détail d'un résultat étudiant par epreuveId.
//
// Affiche : score final, pourcentage, statut, date, pénalité proctoring,
// détail par question (réponse, score, commentaire, suggestion IA).
package com.sect.mobile.android.ui.screens.resultats

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
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
import com.sect.mobile.shared.domain.model.ResultatReponse
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
    Column(
        modifier = Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        KenteDivider(thickness = 3)

        // Épreuve
        detail.epreuve?.let { epreuve ->
            GlassCard {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(epreuve.titre, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text("${epreuve.duree} min · /${epreuve.noteTotal}", style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    epreuve.enseignant?.let { Text("Par ${it.name}", style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
            }
        }

        // Score principal
        GlassCard {
            Column(modifier = Modifier.padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Note obtenue", style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                val scoreColor = if (detail.estReussi) androidx.compose.ui.graphics.Color(0xFF84CC16)
                                 else androidx.compose.ui.graphics.Color(0xFFEF4444)
                Text("${"%.1f".format(detail.scoreOn20)} / ${detail.epreuve?.noteTotal ?: 20.0}",
                    style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Bold, color = scoreColor)
                Text("${detail.pourcentage.toInt()}%", style = MaterialTheme.typography.titleMedium, color = scoreColor)
                SectBadge(
                    text = if (detail.estReussi) "Réussi" else "À refaire",
                    color = scoreColor
                )
                if (detail.penalite > 0) {
                    Spacer(Modifier.height(8.dp))
                    Text("⚠️ Pénalité proctoring: -${detail.penalite} pts",
                        style = MaterialTheme.typography.bodySmall, color = androidx.compose.ui.graphics.Color(0xFFEF4444))
                }
                if (detail.alertes > 0) {
                    Text("🚨 ${detail.alertes} alerte(s) de surveillance",
                        style = MaterialTheme.typography.bodySmall, color = androidx.compose.ui.graphics.Color(0xFFEF4444))
                }
            }
        }

        // Détail par question
        if (detail.reponses.isNotEmpty()) {
            Text("Détail par question", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            detail.reponses.forEachIndexed { index, reponse ->
                ReponseDetailCard(index + 1, reponse)
            }
        }

        // Commentaires généraux
        detail.resultat?.commentaires?.let { comm ->
            if (comm.isNotEmpty()) {
                GlassCard {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Commentaires", fontWeight = FontWeight.Bold)
                        Text(comm, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }

        KenteDivider(thickness = 3)
    }
}

@Composable
private fun ReponseDetailCard(index: Int, reponse: ResultatReponse) {
    GlassCard {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Question $index", fontWeight = FontWeight.Bold)
                reponse.score?.let { score ->
                    SectBadge(
                        text = "${"%.1f".format(score)} pts",
                        color = if (score > 0) androidx.compose.ui.graphics.Color(0xFF84CC16)
                                else androidx.compose.ui.graphics.Color(0xFFEF4444)
                    )
                } ?: Text("Non noté", style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }

            Spacer(Modifier.height(8.dp))

            reponse.contenu?.let { contenu ->
                Text("Votre réponse:", style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(contenu, style = MaterialTheme.typography.bodyMedium)
            }

            reponse.commentaire?.let { comm ->
                if (comm.isNotEmpty()) {
                    Spacer(Modifier.height(4.dp))
                    Text("Commentaire: $comm", style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }

            // Suggestion IA
            reponse.noteIA?.let { noteIA ->
                Spacer(Modifier.height(8.dp))
                Card(
                    shape = RoundedCornerShape(8.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = androidx.compose.ui.graphics.Color(0xFF06B6D4).copy(alpha = 0.08f)
                    )
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.AutoAwesome, null, tint = androidx.compose.ui.graphics.Color(0xFF06B6D4),
                                modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("IA: ${"%.1f".format(noteIA)} pts", style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold, color = androidx.compose.ui.graphics.Color(0xFF06B6D4))
                        }
                        reponse.justificationIA?.let { justif ->
                            if (justif.isNotEmpty()) {
                                Text(justif, style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
        }
    }
}
