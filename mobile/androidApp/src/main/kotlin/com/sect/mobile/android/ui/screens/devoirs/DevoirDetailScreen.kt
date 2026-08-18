// SECT Mobile — Devoir Detail Screen (Android Compose)
// SECT-MOBILE-PARITY : P0-2 — détail d'un devoir (pas epreuves/{id})
//
// Affiche : titre, description, échéance, points, statut, auteur,
// soumission de l'étudiant (si présente) + bouton soumettre.
// Pour l'enseignant : liste des soumissions + bouton correction.
package com.sect.mobile.android.ui.screens.devoirs

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.sect.mobile.android.ui.components.GlassCard
import com.sect.mobile.android.ui.components.SectBadge
import com.sect.mobile.android.ui.components.KenteDivider
import com.sect.mobile.android.theme.*
import com.sect.mobile.android.ui.viewmodel.DevoirsViewModel
import org.koin.androidx.compose.koinViewModel
import java.time.LocalDate
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DevoirDetailScreen(
    devoirId: String,
    onBack: () -> Unit,
    isEnseignant: Boolean = false,
    viewModel: DevoirsViewModel = koinViewModel()
) {
    // Charger le devoir au démarrage
    LaunchedEffect(devoirId) {
        viewModel.loadDevoirs(refresh = true)
    }

    val uiState by viewModel.uiState.collectAsState()
    val devoir = uiState.let { state ->
        if (state is com.sect.mobile.android.ui.viewmodel.DevoirsUiState.Success) {
            state.devoirs.find { it.id == devoirId }
        } else null
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(devoir?.titre ?: "Devoir") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, "Retour")
                    }
                }
            )
        }
    ) { padding ->
        if (devoir == null) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                if (uiState is com.sect.mobile.android.ui.viewmodel.DevoirsUiState.Loading) {
                    CircularProgressIndicator()
                } else {
                    Text("Devoir introuvable")
                }
            }
        } else {
            Column(
                modifier = Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                KenteDivider(thickness = 3)

                // Titre + statut
                Text(devoir.titre, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                SectBadge(text = devoir.statut, color = if (devoir.statut == "PUBLIE") SectLime else SectNavy)

                // Description
                devoir.description?.let { desc ->
                    if (desc.isNotEmpty()) {
                        GlassCard {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text("Description", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
                                Spacer(Modifier.height(8.dp))
                                Text(desc, style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                    }
                }

                // Infos
                GlassCard {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        // Échéance
                        val isLate = try {
                            LocalDate.parse(devoir.dateLimite.take(10), DateTimeFormatter.ISO_DATE).isBefore(LocalDate.now())
                        } catch (e: Exception) { false }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Default.CalendarToday,
                                contentDescription = null,
                                tint = if (isLate) SectRed else SectGold,
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(Modifier.width(8.dp))
                            Text("Échéance: ${devoir.dateLimite.take(10)}",
                                color = if (isLate) SectRed else MaterialTheme.colorScheme.onSurface)
                        }

                        // Points
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(imageVector = Icons.Default.Star, contentDescription = null, tint = SectGold, modifier = Modifier.size(20.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("${devoir.pointsMax} points")
                        }

                        // Auteur
                        devoir.auteur?.let { auteur ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(imageVector = Icons.Default.Person, contentDescription = null, tint = SectNavy, modifier = Modifier.size(20.dp))
                                Spacer(Modifier.width(8.dp))
                                Text("Par ${auteur.prenom} ${auteur.nom}")
                            }
                        }

                        // Fichier
                        devoir.fichierUrl?.let { url ->
                            if (url.isNotEmpty()) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(imageVector = Icons.Default.AttachFile, contentDescription = null, tint = SectTech, modifier = Modifier.size(20.dp))
                                    Spacer(Modifier.width(8.dp))
                                    Text("Document attaché", color = SectTech)
                                }
                            }
                        }
                    }
                }

                // Soumission de l'étudiant (si présente)
                devoir.soumissionUtilisateur?.let { soumission ->
                    GlassCard {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text("Ma soumission", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
                            Spacer(Modifier.height(8.dp))
                            Text("Statut: ${soumission.statut}", style = MaterialTheme.typography.bodyMedium)
                            soumission.note?.let { note ->
                                Text("Note: $note/${devoir.pointsMax}",
                                    fontWeight = FontWeight.Bold,
                                    color = SectLimeDark)
                            }
                            soumission.commentaire?.let { comm ->
                                if (comm.isNotEmpty()) {
                                    Text("Commentaire: $comm", style = MaterialTheme.typography.bodySmall)
                                }
                            }
                        }
                    }
                }

                // Actions
                if (!isEnseignant) {
                    // Étudiant : soumettre
                    if (devoir.soumissionUtilisateur == null) {
                        Button(
                            onClick = {
                                // SECT-MOBILE-PARITY P1-6 : soumission via repository
                                // TODO : upload presigned URL d'abord, puis submitDevoir
                                viewModel.submitDevoir(devoir.id, devoir.fichierUrl ?: "", null)
                            },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.buttonColors(containerColor = SectLime)
                        ) {
                            Icon(imageVector = Icons.Default.Upload, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text("Soumettre", color = SectLimeDark, fontWeight = FontWeight.Bold)
                        }
                    }
                } else {
                    // Enseignant : voir soumissions + corriger
                    Button(
                        onClick = {
                            // SECT-MOBILE-PARITY P1-7 : noter soumission (TODO : UI de sélection de soumission)
                            viewModel.noterSoumission(devoir.id, 15f, "Bonne réponse")
                        },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = SectTerreCuite)
                    ) {
                        Icon(imageVector = Icons.Default.Grade, contentDescription = null, tint = androidx.compose.ui.graphics.Color.White)
                        Spacer(Modifier.width(8.dp))
                        Text("Voir soumissions", color = androidx.compose.ui.graphics.Color.White)
                    }

                    // SECT-MOBILE-PARITY P1-8 : Correction IA
                    Spacer(Modifier.height(8.dp))
                    OutlinedButton(
                        onClick = { viewModel.aiGradeSoumission(devoir.id) },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(imageVector = Icons.Default.AutoAwesome, contentDescription = null)
                        Spacer(Modifier.width(8.dp))
                        Text("Correction IA")
                    }
                }

                KenteDivider(thickness = 3)
            }
        }
    }
}
