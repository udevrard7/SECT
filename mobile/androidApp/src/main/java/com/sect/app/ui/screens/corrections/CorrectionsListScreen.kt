package com.sect.app.ui.screens.corrections

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
import com.sect.app.ui.viewmodel.CorrectionsViewModel
import com.sect.shared.domain.model.Session

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CorrectionsListScreen(
    onNavigateBack: () -> Unit,
    viewModel: CorrectionsViewModel = viewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Corrections en Attente", fontWeight = FontWeight.Bold) },
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
                is CorrectionsUiState.Loading -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
                is CorrectionsUiState.Success -> {
                    if (state.sessions.isEmpty()) {
                        EmptyCorrectionsView()
                    } else {
                        LazyColumn(
                            modifier = Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            item {
                                Card(
                                    modifier = Modifier.fillMaxWidth(),
                                    shape = RoundedCornerShape(16.dp),
                                    colors = CardDefaults.cardColors(containerColor = SectOrange.copy(alpha = 0.1f))
                                ) {
                                    Row(
                                        modifier = Modifier.padding(16.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Column {
                                            Text("Total à corriger", fontWeight = FontWeight.Bold)
                                            Text("${state.sessions.size} copies en attente", style = MaterialTheme.typography.bodySmall)
                                        }
                                        BadgeContainer(count = state.sessions.size)
                                    }
                                }
                            }
                            
                            items(state.sessions) { session ->
                                SessionCard(session, onCorrectClick = { /* Navigation vers correction */ })
                            }
                        }
                    }
                }
                is CorrectionsUiState.Error -> {
                    ErrorCorrectionsView(message = state.message, onRetry = viewModel::loadCorrections)
                }
            }
        }
    }
}

@Composable
fun SessionCard(session: Session, onCorrectClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        onClick = onCorrectClick
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(session.epreuveNom, fontWeight = FontWeight.Bold, maxLines = 1)
                Text(session.etudiantNom, style = MaterialTheme.typography.bodyMedium, color = SectBlue)
            }
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Text("Date de soumission: ${session.dateSubmission}", style = MaterialTheme.typography.bodySmall, color = Color.Gray)
            
            Spacer(modifier = Modifier.height(12.dp))
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text("Questions:", style = MaterialTheme.typography.bodySmall)
                    Text("${session.reponses?.size ?: 0} réponses", fontWeight = FontWeight.Medium)
                }
                
                Button(onClick = onCorrectClick) {
                    Text("Corriger")
                }
            }
        }
    }
}

@Composable
fun BadgeContainer(count: Int) {
    Surface(
        shape = RoundedCornerShape(20.dp),
        color = SectRed,
        modifier = Modifier.size(40.dp)
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                text = "$count",
                color = Color.White,
                fontWeight = FontWeight.Bold
            )
        }
    }
}

@Composable
fun EmptyCorrectionsView() {
    Box(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(Icons.Default.CheckCircle, contentDescription = null, modifier = Modifier.size(64.dp), tint = SectGreen)
            Spacer(modifier = Modifier.height(16.dp))
            Text("Toutes les corrections sont faites !", fontWeight = FontWeight.Bold)
            Text("Aucune copie en attente d'évaluation.", textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        }
    }
}

@Composable
fun ErrorCorrectionsView(message: String, onRetry: () -> Unit) {
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
sealed class CorrectionsUiState {
    object Loading : CorrectionsUiState()
    data class Success(val sessions: List<Session>) : CorrectionsUiState()
    data class Error(val message: String) : CorrectionsUiState()
}
