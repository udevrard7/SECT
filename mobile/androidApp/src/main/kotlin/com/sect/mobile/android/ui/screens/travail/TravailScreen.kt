package com.sect.mobile.android.ui.screens.travail

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Book
import androidx.compose.material.icons.filled.Description
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.sect.mobile.android.ui.screens.EpreuvesScreen
import com.sect.mobile.android.ui.screens.devoirs.DevoirsScreen
import com.sect.mobile.android.ui.viewmodel.DevoirsViewModel
import com.sect.mobile.android.ui.viewmodel.EpreuveViewModel
import org.koin.androidx.compose.koinViewModel

/**
 * Écran "Travail" — conteneur regroupant Épreuves + Devoirs.
 *
 * SECT-MOBILE-NAV-PHASE-A : la bottom bar a maintenant 4 onglets (au lieu de 5),
 * "Travail" consolide le contenu académique pour éviter l'inflation d'onglets.
 *
 * Structure :
 *   ┌─────────────────────────────────┐
 *   │ Travail                      [+]│  ← TopBar (création enseignant)
 *   ├─────────────────────────────────┤
 *   │ [ Épreuves ] [ Devoirs ]        │  ← TabRow
 *   ├─────────────────────────────────┤
 *   │                                 │
 *   │   (contenu de l'onglet actif)   │
 *   │                                 │
 *   └─────────────────────────────────┘
 *
 * L'onglet actif est préservé via rememberSaveable (survit aux rotations).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TravailScreen(
    isEnseignant: Boolean,
    onNavigateToEpreuveDetail: (String) -> Unit,
    onNavigateToDevoirDetail: (String) -> Unit,
    onCreateEpreuve: () -> Unit = {},
    onCreateDevoir: () -> Unit = {}
) {
    var selectedTab by rememberSaveable { mutableIntStateOf(0) }
    val tabs = listOf("Épreuves" to Icons.Default.Book, "Devoirs" to Icons.Default.Description)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Travail") },
                actions = {
                    if (isEnseignant) {
                        IconButton(onClick = {
                            if (selectedTab == 0) onCreateEpreuve() else onCreateDevoir()
                        }) {
                            Icon(Icons.Default.Add, contentDescription = "Créer")
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        }
    ) { paddingValues ->
        Column(modifier = Modifier.fillMaxSize().padding(paddingValues)) {
            TabRow(selectedTabIndex = selectedTab) {
                tabs.forEachIndexed { index, (title, icon) ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        text = { Text(title) },
                        icon = { Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp)) }
                    )
                }
            }

            when (selectedTab) {
                0 -> {
                    val epreuveVM: EpreuveViewModel = koinViewModel()
                    EpreuvesScreen(
                        viewModel = epreuveVM,
                        onEpreuveClick = onNavigateToEpreuveDetail,
                        onBack = { /* Pas de back dans un onglet primaire */ }
                    )
                }
                1 -> {
                    val devoirsVM: DevoirsViewModel = koinViewModel()
                    DevoirsScreen(
                        viewModel = devoirsVM,
                        onDevoirClick = onNavigateToDevoirDetail,
                        onCreateDevoirClick = onCreateDevoir,
                        isEnseignant = isEnseignant
                    )
                }
            }
        }
    }
}
