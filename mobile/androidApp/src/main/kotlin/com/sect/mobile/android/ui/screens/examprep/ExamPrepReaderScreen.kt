// SECT Mobile — ExamPrep Reader Screen (Android Compose)
// SECT-EXAMPREP-CONTRACT-F2 : Vague 1 — lecteur de cours + hub pédagogique
//
// L'étudiant peut sélectionner du texte → créer flashcard ou demander à l'IA.
package com.sect.mobile.android.ui.screens.examprep

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextSelection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.sect.mobile.shared.presentation.examprep.reader.ExamPrepReaderViewModel
import com.sect.mobile.shared.domain.model.examprep.QAState
import com.sect.mobile.android.ui.components.GlassCard
import com.sect.mobile.android.ui.components.SectBadge
import com.sect.mobile.android.theme.*
import org.koin.androidx.compose.koinViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExamPrepReaderScreen(
    documentId: String,
    onBack: () -> Unit,
    viewModel: ExamPrepReaderViewModel = koinViewModel()
) {
    LaunchedEffect(documentId) { viewModel.loadDocument(documentId) }
    val state by viewModel.state.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(state.document?.nomFichier ?: "Lecture", maxLines = 1) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, "Retour") }
                },
                actions = {
                    IconButton(onClick = { viewModel.showFlashcardDialog() }) {
                        Icon(Icons.Default.Style, "Flashcard", tint = SectLime)
                    }
                    IconButton(onClick = { viewModel.showQADialog() }) {
                        Icon(Icons.Default.AutoAwesome, "Q&A", tint = SectTech)
                    }
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
            state.document != null -> {
                Column(
                    modifier = Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp)
                ) {
                    // Métadonnées
                    state.document!!.uniteEnseignement?.let { ue ->
                        SectBadge(text = "${ue.code} · ${ue.nom}", color = SectNavy)
                        Spacer(Modifier.height(8.dp))
                    }

                    // Contenu du cours
                    Text(
                        text = state.document!!.contenuTexte,
                        style = MaterialTheme.typography.bodyLarge,
                        modifier = Modifier.fillMaxWidth()
                    )

                    Spacer(Modifier.height(24.dp))

                    // Actions rapides
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { viewModel.showFlashcardDialog() }) {
                            Icon(Icons.Default.Style, null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Flashcard")
                        }
                        OutlinedButton(onClick = { viewModel.showQADialog() }) {
                            Icon(Icons.Default.AutoAwesome, null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Q&A IA")
                        }
                    }
                }
            }
        }
    }

    // Dialog Flashcard
    if (state.showFlashcardDialog) {
        FlashcardDialog(
            selectedText = state.selectedText.ifBlank { "Sélectionnez du texte dans le cours..." },
            onTextChange = { viewModel.onTextSelected(it) },
            onCreate = { viewModel.createFlashcardFromSelection(documentId) },
            onDismiss = { viewModel.hideFlashcardDialog() },
            isCreated = state.flashcardCreated
        )
    }

    // Dialog Q&A
    if (state.showQADialog) {
        QADialog(
            qaState = state.qaState,
            onAsk = { question -> viewModel.askQuestion(documentId, question) },
            onDismiss = { viewModel.hideQADialog() }
        )
    }
}

@Composable
private fun FlashcardDialog(
    selectedText: String,
    onTextChange: (String) -> Unit,
    onCreate: () -> Unit,
    onDismiss: () -> Unit,
    isCreated: Boolean
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Créer une flashcard") },
        text = {
            Column {
                Text("Texte sélectionné (max 4000 caractères) :", style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = selectedText,
                    onValueChange = onTextChange,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 100, max = 200),
                    maxLines = 5
                )
                if (isCreated) {
                    Spacer(Modifier.height(8.dp))
                    Text("✅ Flashcard créée + SRS mis à jour", color = SectLime, fontWeight = FontWeight.Bold)
                }
            }
        },
        confirmButton = {
            Button(onClick = onCreate, enabled = selectedText.isNotBlank() && !isCreated) {
                Text("Créer")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Fermer") } }
    )
}

@Composable
private fun QADialog(
    qaState: QAState,
    onAsk: (String) -> Unit,
    onDismiss: () -> Unit
) {
    var question by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("🤖 Q&A IA") },
        text = {
            Column {
                Text("Posez une question sur ce cours :", style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = question,
                    onValueChange = { question = it },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                Spacer(Modifier.height(12.dp))

                when (qaState) {
                    is QAState.Loading -> {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(modifier = Modifier.size(20.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("L'IA réfléchit...")
                        }
                    }
                    is QAState.Success -> {
                        GlassCard {
                            Text(qaState.response.response, style = MaterialTheme.typography.bodyMedium)
                            Spacer(Modifier.height(4.dp))
                            Text("Modèle : ${qaState.response.model}",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    is QAState.Error -> {
                        Text(qaState.message, color = SectRed)
                    }
                    else -> {}
                }
            }
        },
        confirmButton = {
            Button(onClick = { onAsk(question) }, enabled = question.isNotBlank() && qaState !is QAState.Loading) {
                Text("Demander")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Fermer") } }
    )
}
