// SECT Mobile — Formulaire de création d'épreuve (enseignant)
// SECT-MOBILE-PARITY-T1 : ferme le workflow "Créer épreuve" (POST /api/epreuves).
//
// Champs requis backend : enseignantId, titre, duree(>0), dateDebut, dateFin, uniteEnseignementId.
// Statut forcé à BROUILLON côté backend. La publication se fait via PATCH ultérieur.
package com.sect.mobile.android.ui.screens.epreuves

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.sect.mobile.android.ui.components.KenteDivider
import com.sect.mobile.android.ui.viewmodel.EpreuveViewModel
import com.sect.mobile.android.ui.viewmodel.UiState
import com.sect.mobile.shared.domain.model.CreateEpreuveInput
import org.koin.androidx.compose.koinViewModel
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * Écran de création d'épreuve.
 *
 * @param enseignantId ID de l'enseignant connecté (requis par le backend).
 * @param onSuccess Callback appelé après création réussie (généralement popBackStack).
 * @param onBack Callback d'annulation.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EpreuveFormScreen(
    enseignantId: String,
    onSuccess: () -> Unit,
    onBack: () -> Unit,
    viewModel: EpreuveViewModel = koinViewModel()
) {
    // ── État du formulaire ──
    var titre by rememberSaveable { mutableStateOf("") }
    var description by rememberSaveable { mutableStateOf("") }
    var duree by rememberSaveable { mutableIntStateOf(60) }
    var uniteEnseignementId by rememberSaveable { mutableStateOf("") }
    var noteTotal by rememberSaveable { mutableStateOf("20") }

    // Dates (millis epoch — converties en ISO à la soumission)
    var dateDebutMillis by rememberSaveable { mutableStateOf(System.currentTimeMillis()) }
    var dateFinMillis by rememberSaveable {
        mutableStateOf(System.currentTimeMillis() + 2 * 3600_000L) // +2h par défaut
    }

    // Options d'examen
    var melangeQuestions by rememberSaveable { mutableStateOf(false) }
    var melangePropositions by rememberSaveable { mutableStateOf(false) }
    var blocageRetour by rememberSaveable { mutableStateOf(true) }

    // Surveille l'état de création pour auto-fermer sur succès
    val createState by viewModel.createState.collectAsState()
    LaunchedEffect(createState) {
        if (createState is UiState.Success) {
            viewModel.resetCreateState()
            onSuccess()
        }
    }
    // Reset au moment de quitter l'écran (si on revient sans succès)
    DisposableEffect(Unit) {
        onDispose {
            if (createState is UiState.Error || createState is UiState.Loading) {
                viewModel.resetCreateState()
            }
        }
    }

    val isLoading = createState is UiState.Loading
    val errorMessage = (createState as? UiState.Error)?.message

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Nouvelle épreuve", fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    IconButton(onClick = onBack, enabled = !isLoading) {
                        Icon(Icons.Default.Close, contentDescription = "Annuler")
                    }
                },
                actions = {
                    TextButton(
                        onClick = { submitEpreuve(viewModel, enseignantId, titre, description, duree, uniteEnseignementId, noteTotal, dateDebutMillis, dateFinMillis, melangeQuestions, melangePropositions, blocageRetour) },
                        enabled = !isLoading && titre.isNotBlank() && uniteEnseignementId.isNotBlank() && duree > 0 && enseignantId.isNotBlank()
                    ) {
                        if (isLoading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp
                            )
                        } else {
                            Text("Créer", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            KenteDivider()

            // ── Informations générales ──
            SectionTitle("Informations générales")
            OutlinedTextField(
                value = titre,
                onValueChange = { titre = it },
                label = { Text("Titre de l'épreuve *") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                enabled = !isLoading
            )
            OutlinedTextField(
                value = description,
                onValueChange = { description = it },
                label = { Text("Description (optionnel)") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2,
                maxLines = 4,
                enabled = !isLoading
            )
            OutlinedTextField(
                value = uniteEnseignementId,
                onValueChange = { uniteEnseignementId = it },
                label = { Text("ID Unité d'Enseignement *") },
                placeholder = { Text("ex: ue-abc123") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                enabled = !isLoading
            )

            HorizontalDivider()

            // ── Durée et planification ──
            SectionTitle("Durée et planification")
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Durée : ", style = MaterialTheme.typography.bodyLarge)
                Text("$duree min", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Spacer(Modifier.width(8.dp))
                FilledIconButton(onClick = { if (duree > 5) duree -= 5 }, enabled = !isLoading) {
                    Text("−")
                }
                Spacer(Modifier.width(8.dp))
                FilledIconButton(onClick = { if (duree < 300) duree += 5 }, enabled = !isLoading) {
                    Text("+")
                }
            }
            DatePickerField(
                label = "Date de début *",
                selectedMillis = dateDebutMillis,
                onDateSelected = { dateDebutMillis = it },
                enabled = !isLoading
            )
            DatePickerField(
                label = "Date de fin *",
                selectedMillis = dateFinMillis,
                onDateSelected = { dateFinMillis = it },
                enabled = !isLoading
            )
            OutlinedTextField(
                value = noteTotal,
                onValueChange = { noteTotal = it.filter { c -> c.isDigit() || c == '.' } },
                label = { Text("Note totale / 20") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                enabled = !isLoading
            )

            HorizontalDivider()

            // ── Options d'examen ──
            SectionTitle("Options d'examen")
            ToggleRow(
                label = "Mélanger les questions",
                checked = melangeQuestions,
                onCheckedChange = { melangeQuestions = it },
                enabled = !isLoading
            )
            ToggleRow(
                label = "Mélanger les propositions",
                checked = melangePropositions,
                onCheckedChange = { melangePropositions = it },
                enabled = !isLoading
            )
            ToggleRow(
                label = "Bloquer le retour en arrière",
                checked = blocageRetour,
                onCheckedChange = { blocageRetour = it },
                enabled = !isLoading
            )

            // ── Message d'erreur ──
            errorMessage?.let { msg ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer
                    )
                ) {
                    Text(
                        text = msg,
                        modifier = Modifier.padding(16.dp),
                        color = MaterialTheme.colorScheme.onErrorContainer,
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }

            Spacer(Modifier.height(24.dp))
        }
    }
}

// ── Helpers ──

@Composable
private fun SectionTitle(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.primary
    )
}

@Composable
private fun ToggleRow(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    enabled: Boolean
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(label, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
        Switch(checked = checked, onCheckedChange = onCheckedChange, enabled = enabled)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DatePickerField(
    label: String,
    selectedMillis: Long,
    onDateSelected: (Long) -> Unit,
    enabled: Boolean
) {
    var showPicker by remember { mutableStateOf(false) }
    val dateText = remember(selectedMillis) {
        LocalDate.ofInstant(
            Instant.ofEpochMilli(selectedMillis),
            ZoneId.systemDefault()
        ).format(DateTimeFormatter.ofPattern("dd/MM/yyyy"))
    }

    OutlinedTextField(
        value = dateText,
        onValueChange = {},
        label = { Text(label) },
        modifier = Modifier.fillMaxWidth(),
        readOnly = true,
        enabled = enabled,
        trailingIcon = {
            TextButton(onClick = { showPicker = true }, enabled = enabled) {
                Text("Choisir")
            }
        }
    )

    if (showPicker) {
        val state = rememberDatePickerState(initialSelectedDateMillis = selectedMillis)
        DatePickerDialog(
            onDismissRequest = { showPicker = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { onDateSelected(it) }
                    showPicker = false
                }) { Text("OK") }
            },
            dismissButton = {
                TextButton(onClick = { showPicker = false }) { Text("Annuler") }
            }
        ) {
            DatePicker(state = state)
        }
    }
}

/**
 * Construit le CreateEpreuveInput et déclenche la création via le ViewModel.
 * Les dates millis sont converties en ISO8601 (avec heure par défaut 08:00 / 23:59).
 */
private fun submitEpreuve(
    viewModel: EpreuveViewModel,
    enseignantId: String,
    titre: String,
    description: String,
    duree: Int,
    uniteEnseignementId: String,
    noteTotal: String,
    dateDebutMillis: Long,
    dateFinMillis: Long,
    melangeQuestions: Boolean,
    melangePropositions: Boolean,
    blocageRetour: Boolean
) {
    val debutIso = Instant.ofEpochMilli(dateDebutMillis)
        .atZone(ZoneId.systemDefault())
        .toLocalDate()
        .atTime(8, 0)
        .atZone(ZoneId.systemDefault())
        .toInstant()
        .toString()

    val finIso = Instant.ofEpochMilli(dateFinMillis)
        .atZone(ZoneId.systemDefault())
        .toLocalDate()
        .atTime(23, 59)
        .atZone(ZoneId.systemDefault())
        .toInstant()
        .toString()

    val note = noteTotal.toDoubleOrNull() ?: 20.0

    val input = CreateEpreuveInput(
        enseignantId = enseignantId,
        titre = titre.trim(),
        duree = duree,
        dateDebut = debutIso,
        dateFin = finIso,
        uniteEnseignementId = uniteEnseignementId.trim(),
        description = description.trim().ifBlank { null },
        melangeQuestions = melangeQuestions,
        melangePropositions = melangePropositions,
        blocageRetour = blocageRetour,
        noteTotal = note,
        sessionExamen = null,       // null → "NORMALE" via mapper
        generationMode = null       // null → "MANUELLE" via mapper
    )
    viewModel.createEpreuve(input)
}
