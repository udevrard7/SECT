// SECT Mobile — Dashboard Étudiant (inspiré du frontend web)
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
import com.sect.mobile.shared.domain.model.EtudiantStats

/**
 * Dashboard spécifique pour les ÉTUDIANTS
 * Inspiré du frontend web: /frontend/src/app/dashboard/etudiant/page.tsx
 * 
 * Affiche:
 * - Statistiques clés (épreuves à venir, terminées, moyenne, meilleure note)
 * - Session en cours (si examen actif)
 * - Épreuves à venir avec détails
 * - Résultats récents avec évolution
 * - Performance par type de question
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EtudiantDashboardScreen(
    viewModel: DashboardViewModel,
    onNavigateToEpreuves: () -> Unit,
    onNavigateToResultats: () -> Unit,
    onNavigateToMessagerie: () -> Unit,
    onNavigateToProfile: () -> Unit,
    onStartSession: (String) -> Unit
) {
    val user by viewModel.user.collectAsState()
    val statsState by viewModel.etudiantStats.collectAsState()
    
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
                        "Étudiant",
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
                        EtudiantStatCard(
                            title = "À venir",
                            value = stats.nbEpreuvesAVenir.toString(),
                            icon = Icons.Default.Event,
                            modifier = Modifier.weight(1f)
                        )
                        EtudiantStatCard(
                            title = "Terminées",
                            value = stats.nbEpreuvesTerminees.toString(),
                            icon = Icons.Default.CheckCircle,
                            modifier = Modifier.weight(1f)
                        )
                        EtudiantStatCard(
                            title = "Moyenne",
                            value = "%.1f".format(stats.moyenne),
                            icon = Icons.Default.TrendingUp,
                            modifier = Modifier.weight(1f)
                        )
                        EtudiantStatCard(
                            title = "Meilleure",
                            value = "%.1f".format(stats.meilleureNote),
                            icon = Icons.Default.Star,
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

        // ── Session en cours (alerte) ──
        item {
            when (statsState) {
                is UiState.Success -> {
                    val stats = (statsState as UiState.Success).data
                    stats.sessionEnCours?.let { session ->
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.primaryContainer
                            )
                        ) {
                            Row(
                                modifier = Modifier.padding(16.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    Icons.Default.Timer,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.onPrimaryContainer,
                                    modifier = Modifier.size(32.dp)
                                )
                                Spacer(modifier = Modifier.width(12.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        "Examen en cours",
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.onPrimaryContainer
                                    )
                                    Text(
                                        session.epreuveTitre,
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onPrimaryContainer
                                    )
                                }
                                Button(onClick = { onStartSession(session.id) }) {
                                    Text("Reprendre")
                                }
                            }
                        }
                    }
                }
                else -> { /* Pas de session en cours */ }
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
                    } else {
                        // `items()` (LazyListScope) n'est pas callable ici (on est dans un `item {}`)
                        // → on empile les cartes via Column + forEach
                        Column(modifier = Modifier.fillMaxWidth()) {
                            stats.epreuvesAVenir.take(5).forEach { epreuve ->
                                EpreuveAVenirCard(epreuve, onClick = { onStartSession(epreuve.id) })
                            }
                        }
                    }
                }
                else -> { /* Géré par loading/error */ }
            }
        }

        // ── Résultats récents ──
        item {
            Text(
                "Résultats récents",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(modifier = Modifier.height(8.dp))
        }

        item {
            when (statsState) {
                is UiState.Success -> {
                    val stats = (statsState as UiState.Success).data
                    if (stats.resultatsRecents.isEmpty()) {
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Text(
                                "Aucun résultat disponible",
                                modifier = Modifier.padding(24.dp),
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    } else {
                        // `items()` (LazyListScope) n'est pas callable ici (on est dans un `item {}`)
                        // → on empile les cartes via Column + forEach
                        Column(modifier = Modifier.fillMaxWidth()) {
                            stats.resultatsRecents.take(5).forEach { resultat ->
                                ResultatRecentCard(resultat, onClick = { onNavigateToResultats() })
                            }
                        }
                    }
                }
                else -> { /* Géré par loading/error */ }
            }
        }

        // ── Performance par type ──
        item {
            Text(
                "Performance par type",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(modifier = Modifier.height(8.dp))
        }

        item {
            when (statsState) {
                is UiState.Success -> {
                    val stats = (statsState as UiState.Success).data
                    if (stats.performanceParType.isEmpty()) {
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Text(
                                "Pas encore assez de données",
                                modifier = Modifier.padding(24.dp),
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    } else {
                        // `items()` (LazyListScope) n'est pas callable ici (on est dans un `item {}`)
                        // → on empile les cartes via Column + forEach
                        Column(modifier = Modifier.fillMaxWidth()) {
                            stats.performanceParType.take(5).forEach { perf ->
                                PerformanceTypeCard(perf)
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
private fun EtudiantStatCard(
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
private fun EpreuveAVenirCard(
    epreuve: com.sect.mobile.shared.domain.model.EpreuveAVenirEtudiant,
    onClick: () -> Unit
) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
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
            }
            Spacer(modifier = Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    "Prof: ${epreuve.enseignant}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    "${epreuve.nbQuestions} questions · ${epreuve.totalPoints} pts",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary
                )
            }
        }
    }
}

@Composable
private fun ResultatRecentCard(
    resultat: com.sect.mobile.shared.domain.model.ResultatRecent,
    onClick: () -> Unit
) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
    ) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            val scoreColor = when {
                resultat.score >= 15 -> MaterialTheme.colorScheme.primary
                resultat.score >= 10 -> MaterialTheme.colorScheme.secondary
                else -> MaterialTheme.colorScheme.error
            }
            
            Column(
                modifier = Modifier
                    .size(48.dp)
                    .padding(4.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Text(
                    "%.0f".format(resultat.score),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = scoreColor
                )
            }
            
            Spacer(modifier = Modifier.width(12.dp))
            
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    resultat.titre,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1
                )
                Text(
                    "Prof: ${resultat.enseignant}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                resultat.resultat?.let { detail ->
                    Text(
                        "${detail.scoreFinal}/${detail.totalPossible}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }
            
            AssistChip(
                onClick = {},
                label = { Text(resultat.statut, style = MaterialTheme.typography.labelSmall) }
            )
        }
    }
}

@Composable
private fun PerformanceTypeCard(perf: com.sect.mobile.shared.domain.model.PerformanceType) {
    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(
            modifier = Modifier.padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    perf.type,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    "${perf.nbReponses} réponses",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Text(
                "%.1f/20".format(perf.moyenne),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary
            )
        }
    }
}
