package com.sect.app.ui.screens.results

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.sect.app.ui.theme.SectGreen
import com.sect.app.ui.theme.SectRed
import com.sect.app.ui.theme.SectOrange
import com.sect.app.ui.theme.SectBlue
import com.sect.app.ui.viewmodel.ResultsViewModel
import com.sect.shared.domain.model.Resultat

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ResultsListScreen(
    onNavigateBack: () -> Unit,
    viewModel: ResultsViewModel = viewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Mes Résultats", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Retour")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    titleContentColor = MaterialTheme.colorScheme.onSurface
                )
            )
        }
    ) { paddingValues ->
        Box(modifier = Modifier.padding(paddingValues)) {
            when (val state = uiState) {
                is ResultsUiState.Loading -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
                is ResultsUiState.Success -> {
                    if (state.resultats.isEmpty()) {
                        EmptyResultsView()
                    } else {
                        LazyColumn(
                            modifier = Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            // Résumé global
                            item {
                                GlobalStatsCard(state.resultats)
                            }
                            
                            items(state.resultats) { resultat ->
                                ResultatCard(resultat)
                            }
                        }
                    }
                }
                is ResultsUiState.Error -> {
                    ErrorResultsView(message = state.message, onRetry = viewModel::loadResults)
                }
            }
        }
    }
}

@Composable
fun GlobalStatsCard(resultats: List<Resultat>) {
    val moyenne = if (resultats.isEmpty()) 0f else resultats.map { it.score }.average().toFloat()
    val total = resultats.size
    val reussite = resultats.count { it.statut == "VALIDE" }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = SectBlue.copy(alpha = 0.1f))
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Text("Performance Globale", fontWeight = FontWeight.Bold, fontSize = MaterialTheme.typography.titleMedium.fontSize)
            Spacer(modifier = Modifier.height(16.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                StatItem(label = "Moyenne", value = "${"%.1f".format(moyenne)}%", color = SectBlue)
                StatItem(label = "Épreuves", value = "$total", color = SectGreen)
                StatItem(label = "Réussite", value = "$reussite/$total", color = SectOrange)
            }
        }
    }
}

@Composable
fun StatItem(label: String, value: String, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, fontWeight = FontWeight.Bold, fontSize = MaterialTheme.typography.titleLarge.fontSize, color = color)
        Text(label, fontSize = MaterialTheme.typography.bodySmall.fontSize, color = Color.Gray)
    }
}

@Composable
fun ResultatCard(resultat: Resultat) {
    val statusColor = when (resultat.statut) {
        "VALIDE" -> SectGreen
        "ECHEC" -> SectRed
        else -> SectOrange
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        onClick = { /* Navigation vers détail */ }
    ) {
        Row(
            modifier = Modifier.padding(16.dp).fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(resultat.epreuveNom, fontWeight = FontWeight.Bold, maxLines = 1)
                Spacer(modifier = Modifier.height(4.dp))
                Text("Date: ${resultat.dateCompletion}", style = MaterialTheme.typography.bodySmall, color = Color.Gray)
                Spacer(modifier = Modifier.height(4.dp))
                Text("Score: ${"%.1f".format(resultat.score)}%", fontWeight = FontWeight.Medium)
            }
            
            BadgeContainer(status = resultat.statut, color = statusColor)
        }
    }
}

@Composable
fun BadgeContainer(status: String, color: Color) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = color.copy(alpha = 0.15f),
        modifier = Modifier.padding(4.dp)
    ) {
        Text(
            text = status,
            color = color,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
        )
    }
}

@Composable
fun EmptyResultsView() {
    Box(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(Icons.Default.Info, contentDescription = null, modifier = Modifier.size(64.dp), tint = Color.Gray)
            Spacer(modifier = Modifier.height(16.dp))
            Text("Aucun résultat disponible", fontWeight = FontWeight.Bold)
            Text("Passez vos premières épreuves pour voir vos résultats ici.", textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        }
    }
}

@Composable
fun ErrorResultsView(message: String, onRetry: () -> Unit) {
    Box(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(Icons.Default.Error, contentDescription = null, modifier = Modifier.size(64.dp), tint = SectRed)
            Spacer(modifier = Modifier.height(16.dp))
            Text("Erreur de chargement", fontWeight = FontWeight.Bold)
            Text(message, textAlign = androidx.compose.ui.text.style.TextAlign.Center, color = Color.Gray)
            Spacer(modifier = Modifier.height(16.dp))
            Button(onClick = onRetry) {
                Text("Réessayer")
            }
        }
    }
}

// UI States
sealed class ResultsUiState {
    object Loading : ResultsUiState()
    data class Success(val resultats: List<Resultat>) : ResultsUiState()
    data class Error(val message: String) : ResultsUiState()
}
