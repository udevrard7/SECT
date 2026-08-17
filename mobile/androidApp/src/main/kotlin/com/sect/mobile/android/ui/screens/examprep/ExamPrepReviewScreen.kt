// SECT Mobile — ExamPrep Review Screen (Android Compose)
// SECT-EXAMPREP-CONTRACT-F2 : Vague 1 — révision SRS (spaced repetition)
//
// Le mobile ne calcule PAS SM-2. L'étudiant évalue sa qualité de rappel
// (0-5) et le backend met à jour l'intervalle.
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
import com.sect.mobile.shared.presentation.examprep.review.ExamPrepReviewViewModel
import com.sect.mobile.shared.presentation.examprep.review.ExamPrepReviewState
import com.sect.mobile.android.ui.components.GlassCard
import com.sect.mobile.android.ui.components.SectBadge
import com.sect.mobile.android.ui.components.SectProgressBar
import com.sect.mobile.android.theme.*
import org.koin.androidx.compose.koinViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExamPrepReviewScreen(
    onBack: () -> Unit,
    viewModel: ExamPrepReviewViewModel = koinViewModel()
) {
    val state by viewModel.state.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("🧠 Révision") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, "Retour") }
                },
                actions = {
                    FilterChip(
                        selected = state.dueOnly,
                        onClick = { viewModel.toggleDueOnly() },
                        label = { Text("Dues uniquement") }
                    )
                }
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
            state.dueItems.isEmpty() -> {
                Column(
                    modifier = Modifier.fillMaxSize().padding(padding),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Icon(Icons.Default.CheckCircle, null, modifier = Modifier.size(64.dp),
                        tint = SectLime)
                    Spacer(Modifier.height(16.dp))
                    Text("Tout est à jour !", style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold)
                    Text("Aucune carte à réviser pour le moment",
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            else -> {
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(padding),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // Stats header
                    item {
                        GlassCard {
                            Row(
                                modifier = Modifier.padding(16.dp).fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Column {
                                    Text("${state.dueItems.size} cartes à réviser",
                                        fontWeight = FontWeight.Bold)
                                    Text("Qualité : 0=oubli, 3=difficile, 5=parfait",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                Icon(Icons.Default.Psychology, null, modifier = Modifier.size(40.dp),
                                    tint = SectLime)
                            }
                        }
                    }

                    // Review items
                    items(state.dueItems, key = { it.id }) { item ->
                        ReviewItemCard(
                            item = item,
                            onMarkReviewed = { quality -> viewModel.markReviewed(item.id, quality) },
                            isLastReviewed = state.lastReviewedId == item.id
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ReviewItemCard(
    item: com.sect.mobile.shared.domain.model.examprep.ReviewItem,
    onMarkReviewed: (Int) -> Unit,
    isLastReviewed: Boolean
) {
    GlassCard {
        Column(modifier = Modifier.padding(16.dp)) {
            // SRS metadata
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                SectBadge(text = "Rép. ${item.repetitions}", color = SectNavy)
                if (item.easeFactor > 0) {
                    Text("Facilité: ${"%.1f".format(item.easeFactor)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (isLastReviewed) {
                    SectBadge(text = "✓ Révisé", color = SectLime)
                }
            }

            Spacer(Modifier.height(8.dp))

            // Progression maîtrise (basée sur repetitions)
            val masteryProgress = (item.repetitions.toFloat() / 5f).coerceIn(0f, 1f)
            SectProgressBar(progress = masteryProgress, color = SectLime)

            Spacer(Modifier.height(12.dp))

            // Boutons de qualité (SM-2 : 0-5)
            Text("Votre évaluation :", style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                QualityButton(0, "Oubli", SectRed, onMarkReviewed)
                QualityButton(2, "Difficile", SectTerreCuite, onMarkReviewed)
                QualityButton(3, "Correct", SectGold, onMarkReviewed)
                QualityButton(5, "Parfait", SectLime, onMarkReviewed)
            }
        }
    }
}

@Composable
private fun QualityButton(
    quality: Int,
    label: String,
    color: Color,
    onClick: (Int) -> Unit
) {
    OutlinedButton(
        onClick = { onClick(quality) },
        modifier = Modifier.weight(1f),
        colors = ButtonDefaults.outlinedButtonColors(
            contentColor = color
        ),
        shape = RoundedCornerShape(8.dp)
    ) {
        Text(label, style = MaterialTheme.typography.labelSmall)
    }
}

private typealias Color = androidx.compose.ui.graphics.Color
