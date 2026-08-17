// SECT Mobile — ExamPrep Practice Screen (Android Compose)
// SECT-EXAMPREP-CONTRACT-F2 : Vague 2 — entraînement + génération IA
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
import com.sect.mobile.shared.domain.model.examprep.PracticeGenerationState
import com.sect.mobile.shared.presentation.examprep.practice.ExamPrepPracticeViewModel
import com.sect.mobile.android.ui.components.*
import com.sect.mobile.android.theme.*
import org.koin.androidx.compose.koinViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExamPrepPracticeScreen(
    onBack: () -> Unit,
    viewModel: ExamPrepPracticeViewModel = koinViewModel()
) {
    val state by viewModel.state.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("🎯 Entraînement") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, "Retour") }
                }
            )
        }
    ) { padding ->
        when (state.generationState) {
            is PracticeGenerationState.Idle -> ConfigContent(state, padding, viewModel)
            is PracticeGenerationState.Generating -> GeneratingContent(padding)
            is PracticeGenerationState.Ready -> QuestionsContent(state, padding, viewModel)
            is PracticeGenerationState.Failed -> ErrorContent(
                (state.generationState as PracticeGenerationState.Failed).message, padding, viewModel
            )
            is PracticeGenerationState.Timeout -> ErrorContent("Délai dépassé (60s)", padding, viewModel)
        }
    }
}

@Composable
private fun ConfigContent(
    state: com.sect.mobile.shared.presentation.examprep.practice.ExamPrepPracticeState,
    padding: PaddingValues,
    viewModel: ExamPrepPracticeViewModel
) {
    Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
        Text("Configuration", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(16.dp))

        OutlinedTextField(
            value = state.documentId ?: "",
            onValueChange = { viewModel.setDocument(it) },
            label = { Text("Document ID") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )
        Spacer(Modifier.height(12.dp))

        Text("Nombre de questions : ${state.nombreQuestions}")
        Slider(
            value = state.nombreQuestions.toFloat(),
            onValueChange = { viewModel.setQuestionCount(it.toInt()) },
            valueRange = 5f..30f,
            steps = 24
        )
        Spacer(Modifier.height(12.dp))

        Text("Difficulté")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("FACILE", "MOYEN", "DIFFICILE").forEach { diff ->
                FilterChip(
                    selected = state.difficulte == diff,
                    onClick = { viewModel.setDifficulte(diff) },
                    label = { Text(diff) }
                )
            }
        }
        Spacer(Modifier.height(24.dp))

        Button(
            onClick = { viewModel.generate() },
            modifier = Modifier.fillMaxWidth(),
            enabled = state.documentId != null,
            colors = ButtonDefaults.buttonColors(containerColor = SectLime)
        ) {
            Icon(Icons.Default.AutoAwesome, null)
            Spacer(Modifier.width(8.dp))
            Text("Générer", color = androidx.compose.ui.graphics.Color(0xFF84CC16)Dark, fontWeight = FontWeight.Bold)
        }

        // Attempts history
        if (state.attempts.isNotEmpty()) {
            Spacer(Modifier.height(24.dp))
            Text("Tentatives récentes", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            LazyColumn(modifier = Modifier.fillMaxWidth()) {
                items(state.attempts.take(10), key = { it.id }) { attempt ->
                    GlassCard {
                        Row(modifier = Modifier.padding(12.dp)) {
                            Icon(
                                if (attempt.correct) Icons.Default.CheckCircle else Icons.Default.Cancel,
                                null, tint = if (attempt.correct) SectLime else SectRed
                            )
                            Spacer(Modifier.width(8.dp))
                            Column {
                                Text("Score: ${(attempt.score * 100).toInt()}%",
                                    fontWeight = FontWeight.Medium)
                                Text("${attempt.dureeSec}s", style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun GeneratingContent(padding: PaddingValues) {
    Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator()
            Spacer(Modifier.height(16.dp))
            Text("Génération des questions...")
            Text("L'IA prépare votre entraînement", style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun QuestionsContent(
    state: com.sect.mobile.shared.presentation.examprep.practice.ExamPrepPracticeState,
    padding: PaddingValues,
    viewModel: ExamPrepPracticeViewModel
) {
    Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
        // Progress
        LinearProgressIndicator(
            progress = { state.progress },
            modifier = Modifier.fillMaxWidth()
        )
        Text("Question ${state.currentIndex + 1}/${state.questions.size}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(16.dp))

        state.currentQuestion?.let { question ->
            GlassCard {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(question.enonce, style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Medium)
                    Spacer(Modifier.height(12.dp))
                    question.propositions.forEachIndexed { index, prop ->
                        val isSelected = state.userAnswers[question.id]?.contains(prop) == true
                        OutlinedButton(
                            onClick = {
                                viewModel.answerQuestion(question.id, listOf(prop))
                            },
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                            colors = ButtonDefaults.outlinedButtonColors(
                                containerColor = if (isSelected) SectLime.copy(alpha = 0.2f) else androidx.compose.ui.graphics.Color.Transparent
                            )
                        ) { Text(prop) }
                    }
                }
            }
        }

        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(
                onClick = { viewModel.previousQuestion() },
                enabled = state.currentIndex > 0
            ) { Text("Précédent") }

            if (state.currentIndex < state.questions.size - 1) {
                Button(onClick = { viewModel.nextQuestion() }) { Text("Suivant") }
            } else {
                Button(
                    onClick = { viewModel.submitCurrentAnswer() },
                    enabled = state.allAnswered,
                    colors = ButtonDefaults.buttonColors(containerColor = SectLime)
                ) { Text("Terminer", color = androidx.compose.ui.graphics.Color(0xFF84CC16)Dark) }
            }
        }
    }
}

@Composable
private fun ErrorContent(message: String, padding: PaddingValues, viewModel: ExamPrepPracticeViewModel) {
    Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(imageVector = Icons.Default.Error, contentDescription = null, tint = SectRed, modifier = Modifier.size(48.dp))
            Spacer(Modifier.height(16.dp))
            Text(message, color = androidx.compose.ui.graphics.Color(0xFFEF4444))
            Spacer(Modifier.height(16.dp))
            Button(onClick = { viewModel.resetGeneration() }) { Text("Réessayer") }
        }
    }
}
