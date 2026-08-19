// SECT Mobile — ResultatDetailScreen (Android Compose)
// SECT-MOBILE-PARITY-R2 : détail complet d'un résultat avec réponses par question.
//
// Affiche : score /20, %, statut, pénalité proctoring, alertes,
// épreuve (titre, durée, enseignant), détail par question :
//   - énoncé, type, barème
//   - réponse de l'étudiant
//   - score attribué
//   - commentaire enseignant
//   - suggestion IA (noteIA + justificationIA)
package com.sect.mobile.android.ui.screens.resultats

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.sect.mobile.android.ui.components.*
import com.sect.mobile.android.ui.viewmodel.SessionDetailUiState
import com.sect.mobile.android.ui.viewmodel.ResultatsViewModel
import com.sect.mobile.shared.domain.model.SessionResultat
import com.sect.mobile.shared.domain.model.ReponseResultat
import com.sect.mobile.shared.domain.model.EpreuveQuestionInfo
import org.koin.androidx.compose.koinViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ResultatDetailScreen(
    epreuveId: String,
    onBack: () -> Unit,
    viewModel: ResultatsViewModel = koinViewModel()
) {
    LaunchedEffect(epreuveId) { viewModel.loadSessionDetail(epreuveId) }
    val state by viewModel.sessionState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Détail du résultat") },
                navigationIcon = {
                    IconButton(onClick = { viewModel.resetSessionDetail(); onBack() }) {
                        Icon(Icons.Default.ArrowBack, "Retour")
                    }
                }
            )
        }
    ) { padding ->
        when (val s = state) {
            is SessionDetailUiState.Loading -> {
                Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            is SessionDetailUiState.Error -> {
                Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                    Text(s.message, color = MaterialTheme.colorScheme.error)
                }
            }
            is SessionDetailUiState.Success -> SessionDetailContent(s.session, padding)
            else -> {
                Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                    Text("Sélectionnez un résultat")
                }
            }
        }
    }
}

@Composable
private fun SessionDetailContent(session: SessionResultat, padding: PaddingValues) {
    val lime = androidx.compose.ui.graphics.Color(0xFF84CC16)
    val red = androidx.compose.ui.graphics.Color(0xFFEF4444)
    val gold = androidx.compose.ui.graphics.Color(0xFFD4A017)
    val tech = androidx.compose.ui.graphics.Color(0xFF06B6D4)
    val scoreColor = if (session.estReussi) lime else red
    val totalPossible = session.resultat?.totalPossible ?: session.epreuve?.noteTotal ?: 20.0

    Column(
        modifier = Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        KenteDivider(thickness = 3)

        // ── Épreuve ──
        session.epreuve?.let { epreuve ->
            GlassCard {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(epreuve.titre, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text("${epreuve.duree} min · /${epreuve.noteTotal}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    epreuve.enseignant?.let { ens ->
                        Text("Par ${ens.name}", style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }

        // ── Score principal ──
        GlassCard {
            Column(modifier = Modifier.padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Note obtenue", style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("${"%.1f".format(session.effectiveScore)} / ${"%.0f".format(totalPossible)}",
                    style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Bold, color = scoreColor)
                Text("${session.pourcentage.toInt()}%", style = MaterialTheme.typography.titleMedium, color = scoreColor)
                SectBadge(text = if (session.estReussi) "Réussi" else "À refaire", color = scoreColor)
                if (session.penalite > 0) {
                    Spacer(Modifier.height(8.dp))
                    Text("⚠️ Pénalité proctoring: -${session.penalite} pts",
                        style = MaterialTheme.typography.bodySmall, color = red)
                }
                if (session.alertes > 0) {
                    Text("🚨 ${session.alertes} alerte(s) de surveillance",
                        style = MaterialTheme.typography.bodySmall, color = red)
                }
            }
        }

        // ── Détail par question ──
        if (session.reponses.isNotEmpty()) {
            Text("Détail par question", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)

            // Associer les réponses aux questions de l'épreuve
            val questionsByQuestionId = session.epreuve?.questions?.associateBy { it.questionId } ?: emptyMap()

            session.reponses.forEachIndexed { index, reponse ->
                val questionInfo = questionsByQuestionId[reponse.questionId]
                QuestionDetailCard(
                    index = index + 1,
                    reponse = reponse,
                    questionInfo = questionInfo
                )
            }
        }

        // ── Commentaires généraux ──
        session.resultat?.commentaires?.let { comm ->
            if (comm.isNotEmpty()) {
                GlassCard {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Commentaires", fontWeight = FontWeight.Bold)
                        Text(comm, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }

        KenteDivider(thickness = 3)
    }
}

@Composable
private fun QuestionDetailCard(
    index: Int,
    reponse: ReponseResultat,
    questionInfo: EpreuveQuestionInfo?
) {
    val lime = androidx.compose.ui.graphics.Color(0xFF84CC16)
    val red = androidx.compose.ui.graphics.Color(0xFFEF4444)
    val gold = androidx.compose.ui.graphics.Color(0xFFD4A017)
    val tech = androidx.compose.ui.graphics.Color(0xFF06B6D4)

    GlassCard {
        Column(modifier = Modifier.padding(16.dp)) {
            // En-tête : numéro + barème
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Question $index", fontWeight = FontWeight.Bold)
                questionInfo?.let { qi ->
                    Text("/ ${"%.0f".format(qi.bareme)} pts",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }

            // Type de question
            questionInfo?.question?.let { q ->
                q.type.let { type ->
                    SectBadge(text = type, color = tech)
                }
                Spacer(Modifier.height(8.dp))

                // Énoncé
                if (q.enonce.isNotEmpty()) {
                    Text("Énoncé:", style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(q.enonce, style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.height(8.dp))
                }
            }

            // Réponse de l'étudiant
            Text("Votre réponse:", style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                text = reponse.contenu ?: "(aucune réponse)",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(8.dp)
            )

            // Score
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Score:", style = MaterialTheme.typography.bodyMedium)
                reponse.score?.let { score ->
                    val color = if (score > 0) lime else red
                    SectBadge(
                        text = "${"%.1f".format(score)} / ${"%.0f".format(questionInfo?.bareme ?: 0.0)} pts",
                        color = color
                    )
                } ?: Text("Non noté", style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }

            // Commentaire enseignant
            reponse.commentaire?.let { comm ->
                if (comm.isNotEmpty()) {
                    Spacer(Modifier.height(8.dp))
                    Card(
                        shape = RoundedCornerShape(8.dp),
                        colors = CardDefaults.cardColors(containerColor = gold.copy(alpha = 0.08f))
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Text("💬 Commentaire", style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold, color = gold)
                            Text(comm, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }

            // Suggestion IA
            reponse.noteIA?.let { noteIA ->
                Spacer(Modifier.height(8.dp))
                Card(
                    shape = RoundedCornerShape(8.dp),
                    colors = CardDefaults.cardColors(containerColor = tech.copy(alpha = 0.08f))
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.AutoAwesome, null, tint = tech, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("🤖 IA: ${"%.1f".format(noteIA)} pts",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold, color = tech)
                        }
                        reponse.justificationIA?.let { justif ->
                            if (justif.isNotEmpty()) {
                                Text(justif, style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
        }
    }
}
