// SECT Mobile — Navigation adaptative (phone vs tablet)
// SECT-MOBILE-NAV-PHASE-D : NavigationBar (compact) ↔ NavigationRail (medium+)
//
// Sur téléphone (< 600dp) : NavigationBar en bas (pattern standard)
// Sur tablette (≥ 600dp) : NavigationRail à gauche (pattern Material 3)
//
// Les destinations sont définies par NavigationPolicy (shared KMP) — identiques
// sur les deux facteurs de forme, seul le composant UI change.
package com.sect.mobile.android.ui.components.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * Conteneur de navigation adaptatif.
 *
 * @param showNav visibilité (false en mode immersif / routes secondaires)
 * @param items items de navigation (4 par rôle)
 * @param currentRoute route active
 * @param onNavigate callback de navigation
 * @param content contenu principal (NavHost)
 */
@Composable
fun SectAdaptiveNavigation(
    showNav: Boolean,
    items: List<NavItem>,
    currentRoute: String,
    onNavigate: (String) -> Unit,
    content: @Composable () -> Unit
) {
    if (!showNav) {
        // Pas de navigation (mode immersif / route secondaire) — contenu plein écran
        content()
        return
    }

    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val isCompact = maxWidth < 600.dp

        if (isCompact) {
            // Téléphone : NavigationBar en bas
            Scaffold(
                bottomBar = {
                    SectBottomNavigationBar(
                        items = items,
                        currentRoute = currentRoute,
                        onNavigate = onNavigate
                    )
                }
            ) { paddingValues ->
                Box(modifier = Modifier.padding(paddingValues)) {
                    content()
                }
            }
        } else {
            // Tablette : NavigationRail à gauche
            Row(modifier = Modifier.fillMaxSize()) {
                NavigationRail(
                    containerColor = MaterialTheme.colorScheme.surface,
                    header = {
                        Text(
                            "SECT",
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.padding(vertical = 8.dp)
                        )
                    }
                ) {
                    items.forEach { item ->
                        val selected = currentRoute == item.route
                        NavigationRailItem(
                            selected = selected,
                            onClick = { onNavigate(item.route) },
                            icon = {
                                Icon(
                                    imageVector = if (selected && item.selectedIcon != null)
                                        item.selectedIcon!! else item.icon,
                                    contentDescription = item.label
                                )
                            },
                            label = { Text(item.label) },
                            colors = NavigationRailItemDefaults.colors(
                                selectedIconColor = MaterialTheme.colorScheme.primary,
                                selectedTextColor = MaterialTheme.colorScheme.primary,
                                indicatorColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f)
                            )
                        )
                    }
                }
                // Contenu principal prend le reste de l'espace
                Box(modifier = Modifier.weight(1f)) {
                    content()
                }
            }
        }
    }
}
