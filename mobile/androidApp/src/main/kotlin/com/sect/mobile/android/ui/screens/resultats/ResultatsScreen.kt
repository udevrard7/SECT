package com.sect.mobile.android.ui.screens.resultats

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.sect.mobile.android.ui.viewmodel.ResultatsUiState
import com.sect.mobile.android.ui.viewmodel.ResultatsViewModel
import com.sect.mobile.shared.domain.model.EtudiantStats
import com.sect.mobile.shared.domain.model.Resultat

/**
 * Écran Résultats pour les étudiants.
 * Liste des résultats d'épreuves avec statistiques détaillées.
 *
 * NOTE SECT-MOBILE-CI-FIX-1 : aligné sur le modèle domain Resultat (score: Double
 * interprété comme un pourcentage 0-100, epreuveNom, dateCompletion: String) et
 * EtudiantStats (moyenne, nbEpreuvesTerminees, meilleureNote).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ResultatsScreen(
    onBackClick: () -> Unit,
    onResultClick: (String) -> Unit,
    viewModel: ResultatsViewModel = viewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Mes Résultats") },
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
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            when (val state = uiState) {
                is ResultatsUiState.Loading -> {
                    CircularProgressIndicator(
                        modifier = Modifier.align(Alignment.Center)
                    )
                }
                is ResultatsUiState.Success -> {
                    if (state.resultats.isEmpty()) {
                        EmptyResultatsState(modifier = Modifier.align(Alignment.Center))
                    } else {
                        ResultatsList(
                            resultats = state.resultats,
                            stats = state.stats,
                            onResultClick = onResultClick,
                            modifier = Modifier.fillMaxSize()
                        )
                    }
                }
                is ResultatsUiState.Error -> {
                    ErrorResultatsState(
                        message = state.message,
                        onRetry = viewModel::loadResultats,
                        modifier = Modifier.align(Alignment.Center)
                    )
                }
            }
        }
    }
}

@Composable
private fun ResultatsList(
    resultats: List<Resultat>,
    stats: EtudiantStats?,
    onResultClick: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    LazyColumn(
        modifier = modifier.padding(horizontal = 16.dp),
        contentPadding = PaddingValues(vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // En-tête avec statistiques globales
        if (stats != null) {
            item {
                StatsHeader(stats = stats)
                Spacer(modifier = Modifier.height(16.dp))
            }
        }

        items(resultats, key = { it.id }) { resultat ->
            ResultatCard(
                resultat = resultat,
                onClick = { onResultClick(resultat.epreuveId) }
            )
        }
    }
}

@Composable
private fun StatsHeader(stats: EtudiantStats) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Text(
                text = "Statistiques Générales",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onPrimaryContainer
            )

            Spacer(modifier = Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                StatItem(
                    label = "Moyenne",
                    value = "%.1f".format(stats.moyenne),
                    color = MaterialTheme.colorScheme.primary
                )
                StatItem(
                    label = "Terminées",
                    value = stats.nbEpreuvesTerminees.toString(),
                    color = MaterialTheme.colorScheme.secondary
                )
                StatItem(
                    label = "Meilleure",
                    value = "%.1f/20".format(stats.meilleureNote),
                    color = MaterialTheme.colorScheme.tertiary
                )
            }
        }
    }
}

@Composable
private fun StatItem(
    label: String,
    value: String,
    color: Color
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = value,
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            color = color
        )
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = color.copy(alpha = 0.8f)
        )
    }
}

@Composable
private fun ResultatCard(
    resultat: Resultat,
    onClick: () -> Unit
) {
    // Score interprété comme un pourcentage 0-100
    val pourcentage = resultat.score.coerceIn(0.0, 100.0)
    val estReussi = pourcentage >= 50.0
    val scoreColor = when {
        pourcentage >= 80 -> MaterialTheme.colorScheme.primary
        pourcentage >= 60 -> MaterialTheme.colorScheme.secondary
        pourcentage >= 50 -> MaterialTheme.colorScheme.tertiary
        else -> MaterialTheme.colorScheme.error
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            // En-tête : Titre épreuve + badge réussite
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = resultat.epreuveNom,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f)
                )

                Badge(
                    containerColor = if (estReussi) {
                        MaterialTheme.colorScheme.primaryContainer
                    } else {
                        MaterialTheme.colorScheme.errorContainer
                    },
                    contentColor = if (estReussi) {
                        MaterialTheme.colorScheme.onPrimaryContainer
                    } else {
                        MaterialTheme.colorScheme.onErrorContainer
                    }
                ) {
                    Text(if (estReussi) "Réussi" else "À refaire")
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Score et date
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "Score: %.1f/20".format(pourcentage / 5.0),
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = scoreColor
                    )
                    Text(
                        text = "${pourcentage.toInt()}%",
                        style = MaterialTheme.typography.bodyMedium,
                        color = scoreColor
                    )
                }

                Text(
                    text = resultat.dateCompletion.take(10),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Barre de progression
            LinearProgressIndicator(
                progress = { (pourcentage / 100f).toFloat() },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(8.dp),
                color = scoreColor,
                trackColor = scoreColor.copy(alpha = 0.2f)
            )
        }
    }
}

@Composable
private fun EmptyResultatsState(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            imageVector = Icons.Default.Info,
            contentDescription = null,
            modifier = Modifier.size(64.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "Aucun résultat disponible",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "Commencez par passer des épreuves pour voir vos résultats ici",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
            textAlign = TextAlign.Center
        )
    }
}

@Composable
private fun ErrorResultatsState(
    message: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            imageVector = Icons.Default.Error,
            contentDescription = null,
            modifier = Modifier.size(64.dp),
            tint = MaterialTheme.colorScheme.error
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "Erreur de chargement",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.error
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(16.dp))
        Button(onClick = onRetry) {
            Text("Réessayer")
        }
    }
}
