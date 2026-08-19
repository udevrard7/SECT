// SECT Mobile — Formulaire de création de devoir (enseignant)
// SECT-MOBILE-PARITY-T1 : ferme le workflow "Créer devoir" (POST /api/devoirs).
//
// Champs requis backend : titre, uniteEnseignementId, dateLimite (RFC3339).
// Rôle : ENSEIGNANT uniquement. Statut forcé à BROUILLON côté backend.
package com.sect.mobile.android.ui.screens.devoirs

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
import com.sect.mobile.android.ui.viewmodel.CreateDevoirState
import com.sect.mobile.android.ui.viewmodel.DevoirsViewModel
import com.sect.mobile.shared.domain.model.CreateDevoirInput
import org.koin.androidx.compose.koinViewModel
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * Écran de création de devoir.
 *
 * @param onSuccess Callback appelé après création réussie (généralement popBackStack).
 * @param onBack Callback d'annulation.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DevoirFormScreen(
    onSuccess: () -> Unit,
    onBack: () -> Unit,
    viewModel: DevoirsViewModel = koinViewModel()
) {
    // ── État du formulaire ──
    var titre by rememberSaveable { mutableStateOf("") }
    var description by rememberSaveable { mutableStateOf("") }
    var consignes by rememberSaveable { mutableStateOf("") }
    var uniteEnseignementId by rememberSaveable { mutableStateOf("") }
    var noteMax by rememberSaveable { mutableStateOf("20") }
    var typeSeance by rememberSaveable { mutableStateOf("TD") }
    var soumissionGroupe by rememberSaveable { mutableStateOf(false) }

    // Date limite (millis epoch — convertie en RFC3339 à la soumission)
    var dateLimiteMillis by rememberSaveable {
        mutableStateOf(System.currentTimeMillis() + 7 * 24 * 3600_000L) // +7 jours par défaut
    }

    // Surveille l'état de création pour auto-fermer sur succès
    val createState by viewModel.createState.collectAsState()
    LaunchedEffect(createState) {
        if (createState is CreateDevoirState.Success) {
            viewModel.resetCreateState()
            onSuccess()
        }
    }
    DisposableEffect(Unit) {
        onDispose {
            if (createState is CreateDevoirState.Error || createState is CreateDevoirState.Loading) {
                viewModel.resetCreateState()
            }
        }
    }

    val isLoading = createState is CreateDevoirState.Loading
    val errorMessage = (createState as? CreateDevoirState.Error)?.message

    val typeSeanceOptions = listOf("TD", "TP", "COURS")

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Nouveau devoir", fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    IconButton(onClick = onBack, enabled = !isLoading) {
                        Icon(Icons.Default.Close, contentDescription = "Annuler")
                    }
                },
                actions = {
                    TextButton(
                        onClick = {
                            submitDevoir(
                                viewModel, titre, description, consignes,
                                uniteEnseignementId, noteMax, typeSeance,
                                dateLimiteMillis, soumissionGroupe
                            )
                        },
                        enabled = !isLoading && titre.isNotBlank() && uniteEnseignementId.isNotBlank()
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
                label = { Text("Titre du devoir *") },
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
                value = consignes,
                onValueChange = { consignes = it },
                label = { Text("Consignes détaillées (optionnel)") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 3,
                maxLines = 6,
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

            // ── Planification ──
            SectionTitle("Échéance et notation")
            DatePickerField(
                label = "Date limite *",
                selectedMillis = dateLimiteMillis,
                onDateSelected = { dateLimiteMillis = it },
                enabled = !isLoading
            )
            OutlinedTextField(
                value = noteMax,
                onValueChange = { noteMax = it.filter { c -> c.isDigit() || c == '.' } },
                label = { Text("Note maximale") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                enabled = !isLoading
            )

            // Type de séance (segmented)
            Text("Type de séance", style = MaterialTheme.typography.bodyLarge)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                typeSeanceOptions.forEach { option ->
                    FilterChip(
                        selected = typeSeance == option,
                        onClick = { typeSeance = option },
                        label = { Text(option) },
                        enabled = !isLoading
                    )
                }
            }

            ToggleRow(
                label = "Soumission en groupe",
                checked = soumissionGroupe,
                onCheckedChange = { soumissionGroupe = it },
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
 * Construit le CreateDevoirInput et déclenche la création via le ViewModel.
 * La date limite est convertie en RFC3339 (23:59:00Z le jour choisi).
 * enseignantId est laissé null → le backend utilise l'ID du caller.
 */
private fun submitDevoir(
    viewModel: DevoirsViewModel,
    titre: String,
    description: String,
    consignes: String,
    uniteEnseignementId: String,
    noteMax: String,
    typeSeance: String,
    dateLimiteMillis: Long,
    soumissionGroupe: Boolean
) {
    val dateLimiteRfc3339 = Instant.ofEpochMilli(dateLimiteMillis)
        .atZone(ZoneId.systemDefault())
        .toLocalDate()
        .atTime(23, 59)
        .atZone(ZoneId.systemDefault())
        .toInstant()
        .toString()

    val note = noteMax.toDoubleOrNull() ?: 20.0

    val input = CreateDevoirInput(
        titre = titre.trim(),
        uniteEnseignementId = uniteEnseignementId.trim(),
        dateLimite = dateLimiteRfc3339,
        description = description.trim().ifBlank { null },
        consignes = consignes.trim().ifBlank { null },
        enseignantId = null,        // null → backend utilise l'ID du caller
        typeSeance = typeSeance,
        noteMax = note,
        soumissionGroupe = soumissionGroupe
    )
    viewModel.createDevoir(input)
}
