// SECT Mobile — Dashboard Enseignant (inspiré du frontend web)
package com.sect.mobile.android.ui.screens.dashboard

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.sect.mobile.android.ui.viewmodel.DashboardViewModel
import com.sect.mobile.android.ui.viewmodel.UiState
import com.sect.mobile.shared.domain.model.EnseignantStats

/**
 * Dashboard spécifique pour les ENSEIGNANTS
 * Inspiré du frontend web: /frontend/src/app/dashboard/enseignant/page.tsx
 * 
 * Affiche:
 * - Statistiques clés (documents, questions, épreuves, corrections en attente)
 * - Corrections en attente (copies à évaluer)
 * - Épreuves récentes avec performances
 * - Épreuves à venir (planning)
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EnseignantDashboardScreen(
    viewModel: DashboardViewModel,
    onNavigateToEpreuves: () -> Unit,
    onNavigateToCorrections: () -> Unit,
    onNavigateToMessagerie: () -> Unit,
    onNavigateToProfile: () -> Unit,
    onLogout: () -> Unit
) {
    val user by viewModel.user.collectAsState()
    val statsState by viewModel.enseignantStats.collectAsState()
    
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
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
                        "Enseignant",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                IconButton(onClick = { onNavigateToProfile() }) {
                    Icon(Icons.Default.AccountCircle, null, modifier = Modifier.size(40.dp))
                }
            }
        }

        // ── Stats principales (4 cartes) ──
        item {
            when (statsState) {
                is UiState.Success -> {
                    val stats = (statsState as UiState.Success).data
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        EnseignantStatCard(
                            title = "Épreuves",
                            value = stats.nbEpreuves.toString(),
                            icon = Icons.Default.Assessment,
                            modifier = Modifier.weight(1f)
                        )
                        EnseignantStatCard(
                            title = "Questions",
                            value = stats.nbQuestionsTotal.toString(),
                            icon = Icons.Default.QuestionAnswer,
                            modifier = Modifier.weight(1f)
                        )
                        EnseignantStatCard(
                            title = "À corriger",
                            value = stats.nbCorrectionsEnAttente.toString(),
                            icon = Icons.Default.EditNote,
                            modifier = Modifier.weight(1f)
                        )
                        EnseignantStatCard(
                            title = "Actives",
                            value = stats.nbEpreuvesActives.toString(),
                            icon = Icons.Default.Timer,
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
                is UiState.Loading -> {
                    Box(modifier = Modifier.fillMaxWidth().height(100.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
                is UiState.Error -> {
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Text(
                            "Erreur chargement stats: ${(statsState as UiState.Error).message}",
                            modifier = Modifier.padding(16.dp),
                            color = MaterialTheme.colorScheme.error
                        )
                    }
                }
            }
        }

        // ── Corrections en attente ──
        item {
            Text(
                "Corrections en attente",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(modifier = Modifier.height(8.dp))
        }

        item {
            when (statsState) {
                is UiState.Success -> {
                    val stats = (statsState as UiState.Success).data
                    if (stats.pendingCorrections.isEmpty()) {
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Column(
                                modifier = Modifier.padding(24.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Icon(
                                    Icons.Default.CheckCircle,
                                    contentDescription = null,
                                    modifier = Modifier.size(48.dp),
                                    tint = MaterialTheme.colorScheme.primary
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    "Aucune correction en attente 🎉",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    } else {
                        // `items()` (LazyListScope) n'est pas callable ici (on est dans un `item {}`)
                        // → on empile les cartes via Column + forEach
                        Column(modifier = Modifier.fillMaxWidth()) {
                            stats.pendingCorrections.take(5).forEach { correction ->
                                PendingCorrectionCard(correction, onClick = { onNavigateToCorrections() })
                            }
                        }
                    }
                }
                else -> { /* Géré par loading/error ci-dessus */ }
            }
        }

        // ── Épreuves récentes ──
        item {
            Text(
                "Épreuves récentes",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(modifier = Modifier.height(8.dp))
        }

        item {
            when (statsState) {
                is UiState.Success -> {
                    val stats = (statsState as UiState.Success).data
                    if (stats.recentEpreuves.isEmpty()) {
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Text(
                                "Aucune épreuve récente",
                                modifier = Modifier.padding(24.dp),
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    } else {
                        // `items()` (LazyListScope) n'est pas callable ici (on est dans un `item {}`)
                        // → on empile les cartes via Column + forEach
                        Column(modifier = Modifier.fillMaxWidth()) {
                            stats.recentEpreuves.take(5).forEach { epreuve ->
                                RecentEpreuveCard(epreuve, onClick = { onNavigateToEpreuves() })
                            }
                        }
                    }
                }
                else -> { /* Géré par loading/error */ }
            }
        }

        // ── Épreuves à venir ──
        item {
            Text(
                "Épreuves à venir",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(modifier = Modifier.height(8.dp))
        }

        item {
            when (statsState) {
                is UiState.Success -> {
                    val stats = (statsState as UiState.Success).data
                    if (stats.epreuvesAVenir.isEmpty()) {
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Text(
                                "Aucune épreuve planifiée",
                                modifier = Modifier.padding(24.dp),
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    } else {
                        // `items()` (LazyListScope) n'est pas callable ici (on est dans un `item {}`)
                        // → on empile les cartes via Column + forEach
                        Column(modifier = Modifier.fillMaxWidth()) {
                            stats.epreuvesAVenir.take(5).forEach { epreuve ->
                                UpcomingEpreuveCard(epreuve, onClick = { onNavigateToEpreuves() })
                            }
                        }
                    }
                }
                else -> { /* Géré par loading/error */ }
            }
        }

        // ── Bouton rafraîchir ──
        item {
            Button(
                onClick = { viewModel.refresh() },
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Default.Refresh, null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Rafraîchir")
            }
        }
    }
}

@Composable
private fun EnseignantStatCard(
    title: String,
    value: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    modifier: Modifier = Modifier
) {
    Card(modifier = modifier) {
        Column(
            modifier = Modifier.padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(icon, null, modifier = Modifier.size(24.dp), tint = MaterialTheme.colorScheme.primary)
            Spacer(modifier = Modifier.height(4.dp))
            Text(value, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text(title, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun PendingCorrectionCard(correction: com.sect.mobile.shared.domain.model.PendingCorrection, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Default.EditNote,
                    contentDescription = null,
                    modifier = Modifier.size(20.dp),
                    tint = MaterialTheme.colorScheme.secondary
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    correction.etudiantNom,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium
                )
            }
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                correction.epreuveTitre,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                "Type: ${correction.questionType}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun RecentEpreuveCard(epreuve: com.sect.mobile.shared.domain.model.RecentEpreuve, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
    ) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    epreuve.titre,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1
                )
                Text(
                    "${epreuve.nbParticipants} participants",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                epreuve.moyenne?.let { moyenne ->
                    Text(
                        "Moyenne: ${"%.1f".format(moyenne)}/20",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }
            AssistChip(
                onClick = {},
                label = { Text(epreuve.statut, style = MaterialTheme.typography.labelSmall) }
            )
        }
    }
}

@Composable
private fun UpcomingEpreuveCard(epreuve: com.sect.mobile.shared.domain.model.EpreuveAVenir, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
    ) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(
                Icons.Default.Event,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.tertiary
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    epreuve.titre,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    "${epreuve.date} · ${epreuve.duree} min",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            AssistChip(
                onClick = {},
                label = { Text(epreuve.statut, style = MaterialTheme.typography.labelSmall) }
            )
        }
    }
}
