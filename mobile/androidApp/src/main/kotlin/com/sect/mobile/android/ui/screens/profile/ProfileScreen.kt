// SECT Mobile — Écran Profil Utilisateur
package com.sect.mobile.android.ui.screens.profile

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.sect.mobile.android.ui.viewmodel.ProfileViewModel
import com.sect.mobile.android.ui.viewmodel.UiState

/**
 * Écran de profil utilisateur avec informations et paramètres
 * Inspiré du frontend web: /frontend/src/app/profile/page.tsx
 */
@Composable
fun ProfileScreen(
    viewModel: ProfileViewModel,
    onBack: () -> Unit = {}
) {
    val userState by viewModel.user.collectAsState()

    when (val state = userState) {
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
            val user = state.data
            LazyColumn(modifier = Modifier.fillMaxSize().padding(16.dp)) {
                // ── En-tête profil ──
                item {
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(
                            modifier = Modifier.padding(24.dp), 
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Icon(
                                Icons.Default.AccountCircle, 
                                null, 
                                modifier = Modifier.size(80.dp),
                                tint = MaterialTheme.colorScheme.primary
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            Text(
                                user.name, 
                                style = MaterialTheme.typography.headlineMedium, 
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                user.email, 
                                style = MaterialTheme.typography.bodyMedium, 
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            AssistChip(
                                onClick = {}, 
                                label = { Text(user.role.name) },
                                leadingIcon = {
                                    Icon(
                                        Icons.Default.AccountCircle, 
                                        null, 
                                        modifier = Modifier.size(16.dp)
                                    )
                                }
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(24.dp))
                }

                // ── Informations personnelles ──
                item {
                    Text(
                        "Informations", 
                        style = MaterialTheme.typography.titleMedium, 
                        fontWeight = FontWeight.SemiBold
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                }
                
                item {
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            user.etablissement?.let { InfoRow("Établissement", it.nom) }
                            user.filiere?.let { InfoRow("Filière", it.nom) }
                            user.matricule?.let { InfoRow("Matricule", it) }
                            InfoRow("Rôle", user.role.name)
                        }
                    }
                    Spacer(modifier = Modifier.height(24.dp))
                }

                // ── Paramètres ──
                item {
                    Text(
                        "Paramètres", 
                        style = MaterialTheme.typography.titleMedium, 
                        fontWeight = FontWeight.SemiBold
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                }
                
                item {
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                "SECT Mobile v1.0.0", 
                                style = MaterialTheme.typography.bodySmall, 
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Text(
                                "Système d'Évaluation Casse-Tête", 
                                style = MaterialTheme.typography.bodySmall, 
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(24.dp))
                }
            }
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp), 
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            label, 
            style = MaterialTheme.typography.bodyMedium, 
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            value, 
            style = MaterialTheme.typography.bodyMedium, 
            fontWeight = FontWeight.Medium,
            maxLines = 1
        )
    }
}
