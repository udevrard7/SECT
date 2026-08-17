// SECT Mobile — ExamPrep écrans Vagues 3-4 (Android Compose)
// SECT-EXAMPREP-CONTRACT-F2 : Progress, Q&A, Flashcards, Audio, Planning, Help
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
import com.sect.mobile.android.ui.components.*
import com.sect.mobile.android.theme.*
import org.koin.androidx.compose.koinViewModel

// ════════════════════════════════════════════════════════
// VAGUE 3 — PROGRESS
// ════════════════════════════════════════════════════════

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExamPrepProgressScreen(
    onBack: () -> Unit,
    viewModel: com.sect.mobile.shared.presentation.examprep.progress.ExamPrepProgressViewModel = koinViewModel()
) {
    val state by viewModel.state.collectAsState()
    Scaffold(
        topBar = { TopAppBar(title = { Text("📊 Progression") }, navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, "Retour") } }) }
    ) { padding ->
        when {
            state.isLoading -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            state.dashboard == null -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { Text("Aucune donnée") }
            else -> LazyColumn(modifier = Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                item { KenteDivider(thickness = 3) }
                item {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        SectStatCard(value = "${state.averageScorePercent}%", label = "Score moyen", icon = { Icon(Icons.Default.TrendingUp, null, tint = SectLime) }, modifier = Modifier.weight(1f))
                        SectStatCard(value = "${state.successRate}%", label = "Réussite", icon = { Icon(Icons.Default.CheckCircle, null, tint = SectGold) }, modifier = Modifier.weight(1f))
                        SectStatCard(value = state.revisionTimeFormatted, label = "Temps", icon = { Icon(Icons.Default.Schedule, null, tint = SectNavy) }, modifier = Modifier.weight(1f))
                    }
                }
                item {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        SectStatCard(value = "${state.totalAttempts}", label = "Tentatives", icon = { Icon(Icons.Default.Quiz, null, tint = SectTerreCuite) }, modifier = Modifier.weight(1f))
                        SectStatCard(value = "${state.masteredItems}", label = "Maîtrisés", icon = { Icon(Icons.Default.School, null, tint = SectLime) }, modifier = Modifier.weight(1f))
                        SectStatCard(value = "${state.dueToday}", label = "Dus", icon = { Icon(Icons.Default.Notifications, null, tint = SectGold) }, modifier = Modifier.weight(1f))
                    }
                }
                if (state.sortedWeaknesses.isNotEmpty()) {
                    item { Text("⚠️ Lacunes", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
                    items(state.sortedWeaknesses, key = { it.chapterId }) { w ->
                        Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp), colors = CardDefaults.cardColors(containerColor = SectTerreCuite.copy(alpha = 0.08f))) {
                            Column(Modifier.padding(12.dp)) {
                                Text(w.titre, fontWeight = FontWeight.Medium)
                                SectProgressBar(progress = w.avgScore.toFloat(), color = androidx.compose.ui.graphics.Color(0xFFEF4444))
                                Text("${(w.avgScore * 100).toInt()}% · ${w.attempts} tentatives", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
        }
    }
}

// ════════════════════════════════════════════════════════
// VAGUE 3 — Q&A
// ════════════════════════════════════════════════════════

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExamPrepQaScreen(
    onBack: () -> Unit,
    viewModel: com.sect.mobile.shared.presentation.examprep.qa.ExamPrepQaViewModel = koinViewModel()
) {
    val state by viewModel.state.collectAsState()
    Scaffold(
        topBar = { TopAppBar(title = { Text("🤖 Q&A IA") }, navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, "Retour") } }) }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
            OutlinedTextField(
                value = state.currentQuestion,
                onValueChange = { viewModel.onQuestionChange(it) },
                label = { Text("Votre question") },
                modifier = Modifier.fillMaxWidth(),
                maxLines = 3
            )
            Spacer(Modifier.height(8.dp))
            Button(
                onClick = { viewModel.ask() },
                enabled = state.currentQuestion.isNotBlank() && state.qaState !is com.sect.mobile.shared.domain.model.examprep.QAState.Loading,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = SectTech)
            ) { Text("Demander à l'IA", color = androidx.compose.ui.graphics.Color.White) }

            Spacer(Modifier.height(16.dp))
            when (val qa = state.qaState) {
                is com.sect.mobile.shared.domain.model.examprep.QAState.Loading -> {
                    Row(verticalAlignment = Alignment.CenterVertically) { CircularProgressIndicator(); Spacer(Modifier.width(8.dp)); Text("L'IA réfléchit...") }
                }
                is com.sect.mobile.shared.domain.model.examprep.QAState.Success -> {
                    GlassCard {
                        Column {
                            Text(qa.response.response, style = MaterialTheme.typography.bodyMedium)
                            Text("Modèle: ${qa.response.model}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                is com.sect.mobile.shared.domain.model.examprep.QAState.Error -> Text(qa.message, color = SectRed)
                else -> {}
            }
            // History
            if (state.history.isNotEmpty()) {
                Spacer(Modifier.height(16.dp))
                Text("Historique", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                LazyColumn {
                    items(state.history.take(10)) { item ->
                        GlassCard {
                            Column {
                                Text("Q: ${item.question}", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodySmall)
                                Text(item.response.response.take(200) + "...", style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
            }
        }
    }
}

// ════════════════════════════════════════════════════════
// VAGUE 3 — FLASHCARDS
// ════════════════════════════════════════════════════════

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExamPrepFlashcardsScreen(
    onBack: () -> Unit,
    viewModel: com.sect.mobile.shared.presentation.examprep.flashcards.ExamPrepFlashcardsViewModel = koinViewModel()
) {
    val state by viewModel.state.collectAsState()
    Scaffold(
        topBar = { TopAppBar(title = { Text("🃏 Flashcards") }, navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, "Retour") } }) }
    ) { padding ->
        when {
            state.isLoading -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            state.flashcards.isEmpty() -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Default.Style, null, modifier = Modifier.size(64.dp), tint = SectLime)
                    Text("Aucune flashcard", style = MaterialTheme.typography.titleMedium)
                    Text("Créez-en depuis le lecteur de cours", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            else -> LazyColumn(modifier = Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items(state.flashcards, key = { it.id }) { card ->
                    var flipped by remember(card.id) { mutableStateOf(false) }
                    GlassCard {
                        Column(modifier = Modifier.padding(16.dp).fillMaxWidth()) {
                            Text(if (flipped) card.verso else card.recto, style = if (flipped) MaterialTheme.typography.bodyLarge else MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            Spacer(Modifier.height(8.dp))
                            TextButton(onClick = { flipped = !flipped }) { Text(if (flipped) "Voir recto" else "Voir verso") }
                            IconButton(onClick = { viewModel.delete(card.id) }) { Icon(Icons.Default.Delete, "Supprimer", tint = SectRed) }
                        }
                    }
                }
            }
        }
    }
}

// ════════════════════════════════════════════════════════
// VAGUE 4 — AUDIO
// ════════════════════════════════════════════════════════

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExamPrepAudioScreen(
    documentId: String,
    onBack: () -> Unit,
    viewModel: com.sect.mobile.shared.presentation.examprep.audio.ExamPrepAudioViewModel = koinViewModel()
) {
    LaunchedEffect(documentId) { viewModel.loadAudios(documentId) }
    val state by viewModel.state.collectAsState()
    Scaffold(
        topBar = { TopAppBar(title = { Text("🎧 Audio") }, navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, "Retour") } }) }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
            Button(onClick = { viewModel.generate(documentId) }, enabled = state.generationState is com.sect.mobile.shared.domain.model.examprep.AudioGenerationState.Idle, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = SectTech)) {
                Icon(Icons.Default.Mic, null); Spacer(Modifier.width(8.dp)); Text("Générer podcast", color = androidx.compose.ui.graphics.Color.White)
            }
            when (val gs = state.generationState) {
                is com.sect.mobile.shared.domain.model.examprep.AudioGenerationState.Generating -> { Spacer(Modifier.height(16.dp)); CircularProgressIndicator(); Text("Génération en cours...") }
                is com.sect.mobile.shared.domain.model.examprep.AudioGenerationState.Failed -> { Text(gs.message, color = SectRed) }
                else -> {}
            }
            Spacer(Modifier.height(16.dp))
            LazyColumn {
                items(state.audios, key = { it.id }) { audio ->
                    GlassCard {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Text(audio.script.take(100) + "...", style = MaterialTheme.typography.bodySmall)
                            Text("${audio.durationSec}s · ${audio.status}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Row {
                                if (audio.status == "PRET" && audio.audioUrl != null) {
                                    TextButton(onClick = { viewModel.play(audio) }) { Text("▶ Lecture") }
                                }
                                TextButton(onClick = { viewModel.delete(audio.id) }) { Text("Supprimer", color = SectRed) }
                            }
                        }
                    }
                }
            }
        }
    }
}

// ════════════════════════════════════════════════════════
// VAGUE 4 — PLANNING
// ════════════════════════════════════════════════════════

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExamPrepPlanningScreen(
    onBack: () -> Unit,
    viewModel: com.sect.mobile.shared.presentation.examprep.planning.ExamPrepPlanningViewModel = koinViewModel()
) {
    val state by viewModel.state.collectAsState()
    Scaffold(
        topBar = { TopAppBar(title = { Text("📅 Planning") }, navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, "Retour") } }) }
    ) { padding ->
        when {
            state.isLoading -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            state.sessions.isEmpty() -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { Text("Aucune session") }
            else -> LazyColumn(modifier = Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                item { Text("À venir", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
                items(state.upcoming, key = { it.id }) { session ->
                    GlassCard {
                        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Event, null, tint = SectGold)
                            Spacer(Modifier.width(12.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(session.type.replaceFirstChar { it.uppercase() }, fontWeight = FontWeight.Medium)
                                Text(session.dateDebut.take(16), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            if (session.statut != "TERMINEE") {
                                TextButton(onClick = { viewModel.markCompleted(session.id) }) { Text("Terminer", color = SectLime) }
                            }
                        }
                    }
                }
            }
        }
    }
}

// ════════════════════════════════════════════════════════
// VAGUE 4 — HELP
// ════════════════════════════════════════════════════════

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExamPrepHelpScreen(
    onBack: () -> Unit,
    viewModel: com.sect.mobile.shared.presentation.examprep.help.ExamPrepHelpViewModel = koinViewModel()
) {
    val state by viewModel.state.collectAsState()
    Scaffold(
        topBar = { TopAppBar(title = { Text("👨‍🏫 Aide") }, navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, "Retour") } }) }
    ) { padding ->
        when {
            state.isLoadingThreads -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            state.threads.isEmpty() -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Aucune discussion")
                    Text("Posez une question à votre enseignant", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            else -> LazyColumn(modifier = Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items(state.threads, key = { it.id }) { thread ->
                    GlassCard {
                        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(if (thread.statut == "OUVERT") Icons.Default.QuestionAnswer else Icons.Default.CheckCircle, null, tint = if (thread.statut == "OUVERT") SectLime else SectNavy)
                            Spacer(Modifier.width(12.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(thread.sujet, fontWeight = FontWeight.Medium, maxLines = 2)
                                Text(thread.statut, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
        }
    }
}
