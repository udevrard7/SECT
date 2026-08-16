// SECT Mobile — Écran Liste des Épreuves
package com.sect.mobile.android.ui.screens.epreuves

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.sect.mobile.android.ui.components.EpreuveCard
import com.sect.mobile.android.ui.viewmodel.EpreuveViewModel
import com.sect.mobile.android.ui.viewmodel.UiState

/**
 * Écran de liste des épreuves avec recherche et filtres
 * Inspiré du frontend web: /frontend/src/app/epreuves/page.tsx
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EpreuvesScreen(
    viewModel: EpreuveViewModel,
    onEpreuveClick: (String) -> Unit,
    onBack: () -> Unit = {}
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
            leadingIcon = { Icon(Icons.Default.Search, null) }
        )

        // Filtres par statut
        ScrollableTabRow(selectedTabIndex = 0) {
            viewModel.statutOptions.forEachIndexed { index, (_, label) ->
                Tab(
                    selected = false, 
                    onClick = { viewModel.onStatutFilterChanged(viewModel.statutOptions[index].first) },
                    text = { Text(label) }
                )
            }
        }

        // Liste
        when (val state = epreuves) {
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
                val list = state.data
                if (list.isEmpty()) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text("Aucune épreuve trouvée", style = MaterialTheme.typography.bodyMedium)
                    }
                } else {
                    LazyColumn(modifier = Modifier.fillMaxSize()) {
                        items(list.size, key = { list[it].id }) { index ->
                            val epreuve = list[index]
                            EpreuveCard(
                                titre = epreuve.titre,
                                statut = epreuve.statut.name,
                                duree = epreuve.duree,
                                dateDebut = epreuve.dateDebut.toString(),
                                nbQuestions = epreuve.questionCount,
                                onClick = { onEpreuveClick(epreuve.id) }
                            )
                        }
                    }
                }
            }
        }
    }
}
