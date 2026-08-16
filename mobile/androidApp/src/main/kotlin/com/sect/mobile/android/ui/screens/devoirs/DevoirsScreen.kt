package com.sect.mobile.android.ui.screens.devoirs

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
import com.sect.mobile.android.ui.viewmodel.DevoirsUiState
import com.sect.mobile.android.ui.viewmodel.DevoirsViewModel
import com.sect.mobile.shared.domain.model.Devoir
import java.time.LocalDate
import java.time.format.DateTimeFormatter

@Composable
fun DevoirsScreen(
    viewModel: DevoirsViewModel,
    onDevoirClick: (String) -> Unit,
    onCreateDevoirClick: () -> Unit,
    isEnseignant: Boolean = false
) {
    val uiState by viewModel.uiState.collectAsState()
    
    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
            DevoirsHeader(
                isEnseignant = isEnseignant,
                onCreateClick = onCreateDevoirClick
            )
            
            when (val state = uiState) {
                is DevoirsUiState.Loading -> DevoirsLoading()
                is DevoirsUiState.Success -> DevoirsList(
                    devoirs = state.devoirs,
                    isLoadingMore = state.isLoadingMore,
                    onItemClick = onDevoirClick,
                    onLoadMore = { viewModel.loadMore() }
                )
                is DevoirsUiState.Error -> DevoirsError(
                    message = state.message,
                    onRetry = { viewModel.loadDevoirs(refresh = true) }
                )
            }
        }
    }
}

@Composable
private fun DevoirsHeader(isEnseignant: Boolean, onCreateClick: () -> Unit) {
    Surface(modifier = Modifier.fillMaxWidth(), tonalElevation = 2.dp) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Devoirs",
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold
                )
                if (isEnseignant) {
                    FilledIconButton(onClick = onCreateClick) {
                        Icon(Icons.Default.Add, contentDescription = "Créer un devoir")
                    }
                }
            }
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = if (isEnseignant) "Gérez les devoirs de vos étudiants" else "Consultez et soumettez vos devoirs",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun DevoirsList(
    devoirs: List<Devoir>,
    isLoadingMore: Boolean,
    onItemClick: (String) -> Unit,
    onLoadMore: () -> Unit
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        items(devoirs, key = { it.id }) { devoir ->
            DevoirCard(devoir = devoir, onClick = { onItemClick(devoir.id) })
        }
        
        if (isLoadingMore) {
            item {
                Box(
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
            }
        }
        
        if (devoirs.isEmpty()) {
            item { EmptyDevoirs() }
        }
    }
}

@Composable
private fun DevoirCard(devoir: Devoir, onClick: () -> Unit) {
    val isLate = try {
        LocalDate.parse(devoir.dateLimite, DateTimeFormatter.ISO_DATE).isBefore(LocalDate.now())
    } catch (e: Exception) { false }
    
    Card(modifier = Modifier.fillMaxWidth(), onClick = onClick) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = devoir.titre,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(modifier = Modifier.height(4.dp))
            devoir.description?.let { desc ->
                Text(
                    text = desc,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2
                )
            }
            Spacer(modifier = Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(
                    Icons.Default.CalendarToday,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp),
                    tint = if (isLate) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
                )
                Text(
                    text = "Échéance: ${devoir.dateLimite.take(10)}",
                    style = MaterialTheme.typography.labelMedium,
                    color = if (isLate) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Spacer(modifier = Modifier.height(4.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Default.AttachFile, contentDescription = null, modifier = Modifier.size(16.dp))
                Text(
                    text = "${devoir.pointsMax} points",
                    style = MaterialTheme.typography.labelMedium
                )
            }
            devoir.auteur?.let { auteur ->
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = "Par ${auteur.prenom} ${auteur.nom}",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun DevoirsLoading() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator()
            Spacer(modifier = Modifier.height(16.dp))
            Text("Chargement des devoirs...")
        }
    }
}

@Composable
private fun DevoirsError(message: String, onRetry: () -> Unit) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(32.dp)) {
            Icon(Icons.Default.ErrorOutline, contentDescription = null, modifier = Modifier.size(64.dp))
            Spacer(modifier = Modifier.height(16.dp))
            Text(text = "Erreur", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(8.dp))
            Text(text = message, style = MaterialTheme.typography.bodyMedium)
            Spacer(modifier = Modifier.height(16.dp))
            Button(onClick = onRetry) { Text("Réessayer") }
        }
    }
}

@Composable
private fun EmptyDevoirs() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(Icons.Default.Description, contentDescription = null, modifier = Modifier.size(64.dp))
            Spacer(modifier = Modifier.height(16.dp))
            Text(text = "Aucun devoir", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(8.dp))
            Text(text = "Les devoirs apparaîtront ici", style = MaterialTheme.typography.bodyMedium)
        }
    }
}
