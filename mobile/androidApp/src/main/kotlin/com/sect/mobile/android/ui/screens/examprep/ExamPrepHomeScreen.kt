// SECT Mobile — ExamPrep Home Screen (Android Compose)
// SECT-EXAMPREP-CONTRACT-F2 : Vague 1 — cœur de Prépa
//
// Écran d'accueil du module ExamPrep : agrège Dashboard + SRS du jour +
// Lacunes + Sessions. C'est la destination principale "📚 Prépa examens".
package com.sect.mobile.android.ui.screens.examprep

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.sect.mobile.shared.presentation.examprep.home.ExamPrepHomeViewModel
import com.sect.mobile.shared.presentation.examprep.home.ExamPrepHomeState
import com.sect.mobile.android.ui.components.*
import com.sect.mobile.android.theme.*
import org.koin.androidx.compose.koinViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExamPrepHomeScreen(
    onNavigateToDocuments: () -> Unit,
    onNavigateToReview: () -> Unit,
    onNavigateToPlanning: () -> Unit,
    viewModel: ExamPrepHomeViewModel = koinViewModel()
) {
    val state by viewModel.state.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Prépa Examens", fontWeight = FontWeight.Bold) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        }
    ) { padding ->
        when {
            state.isLoading -> {
                Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            state.error != null -> {
                Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                    Text(state.error!!, color = MaterialTheme.colorScheme.error)
                }
            }
            else -> ExamPrepHomeContent(
                state = state,
                padding = padding,
                onNavigateToDocuments = onNavigateToDocuments,
                onNavigateToReview = onNavigateToReview,
                onNavigateToPlanning = onNavigateToPlanning
            )
        }
    }
}

@Composable
private fun ExamPrepHomeContent(
    state: ExamPrepHomeState,
    padding: PaddingValues,
    onNavigateToDocuments: () -> Unit,
    onNavigateToReview: () -> Unit,
    onNavigateToPlanning: () -> Unit
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(padding),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // ── Bandeau kente (signature africaine) ──
        item { KenteDivider(thickness = 3) }

        // ── Aujourd'hui : SRS + sessions ──
        item {
            Text("🎯 Aujourd'hui", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                SectStatCard(
                    value = "${state.cardsDueToday}",
                    label = "Cartes à revoir",
                    icon = { Icon(imageVector = Icons.Default.School, contentDescription = null, tint = SectLime) },
                    modifier = Modifier.weight(1f)
                )
                SectStatCard(
                    value = "${state.upcomingSessionsCount}",
                    label = "Sessions prévues",
                    icon = { Icon(imageVector = Icons.Default.Event, contentDescription = null, tint = SectGold) },
                    modifier = Modifier.weight(1f)
                )
            }
        }

        // Bouton "Commencer ma révision"
        if (state.cardsDueToday > 0) {
            item {
                Button(
                    onClick = onNavigateToReview,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = SectLime)
                ) {
                    Icon(Icons.Default.PlayArrow, null)
                    Spacer(Modifier.width(8.dp))
                    Text("Commencer ma révision", color = SectLimeDark, fontWeight = FontWeight.Bold)
                }
            }
        }

        // ── Mes cours ──
        item {
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("📖 Mes cours", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                TextButton(onClick = onNavigateToDocuments) {
                    Text("Voir tout", color = SectLime)
                }
            }
        }

        items(state.documents.take(5)) { doc ->
            GlassCard(modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.Description, null, tint = SectNavy, modifier = Modifier.size(32.dp))
                    Spacer(Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(doc.nomFichier, fontWeight = FontWeight.Medium, maxLines = 1)
                        doc.uniteEnseignement?.let {
                            Text("${it.code} · ${it.nom}", style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }

        // ── À renforcer (lacunes) ──
        if (state.weakChapters.isNotEmpty()) {
            item {
                Spacer(Modifier.height(8.dp))
                Text("⚠️ À renforcer", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            }

            items(state.weakChapters) { weakness ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = SectTerreCuite.copy(alpha = 0.08f))
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text(weakness.titre, fontWeight = FontWeight.Medium)
                        val weaknessColor: androidx.compose.ui.graphics.Color =
                            if (weakness.avgScore < 0.4) SectRed else SectGold
                        SectProgressBar(
                            progress = weakness.avgScore.toFloat(),
                            color = weaknessColor
                        )
                        Text("${(weakness.avgScore * 100).toInt()}% · ${weakness.attempts} tentatives",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }

        // ── Sessions à venir ──
        if (state.upcomingSessions.isNotEmpty()) {
            item {
                Spacer(Modifier.height(8.dp))
                Text("📅 Sessions à venir", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            }

            items(state.upcomingSessions) { session ->
                GlassCard(modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.Schedule, null, tint = SectGold)
                        Spacer(Modifier.width(8.dp))
                        Column {
                            Text(session.type.replaceFirstChar { it.uppercase() }, fontWeight = FontWeight.Medium)
                            Text(session.dateDebut.take(16), style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }

        // Bandeau kente en bas
        item { Spacer(Modifier.height(8.dp)); KenteDivider(thickness = 3) }
    }
}
