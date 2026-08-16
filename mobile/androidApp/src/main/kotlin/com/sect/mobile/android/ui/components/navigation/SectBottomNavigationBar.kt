// SECT Mobile — Bottom Navigation refactorisée avec support RBAC
// Inspiré du frontend web: navigation conditionnelle selon le rôle
package com.sect.mobile.android.ui.components.navigation

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sect.mobile.android.ui.components.SectGreen
import com.sect.mobile.android.ui.components.SectBlue
import com.sect.mobile.android.ui.components.SectOrange
import com.sect.mobile.android.ui.components.SectPurple

/**
 * Élément de navigation avec badge pour notifications
 */
data class NavItem(
    val route: String,
    val label: String,
    val icon: ImageVector,
    val selectedIcon: ImageVector? = null,
    val badgeCount: Int? = null,
    val badgeColor: (MaterialTheme.ColorScheme) -> Color = { it.primary }
)

/**
 * Bottom Navigation Bar refactorisée avec:
 * - Support des badges (notifications, corrections en attente, etc.)
 * - Animation fluide entre les états
 * - Design cohérent avec le frontend web
 * - Configuration dynamique selon le rôle (Étudiant vs Enseignant)
 */
@Composable
fun SectBottomNavigationBar(
    items: List<NavItem>,
    currentRoute: String,
    onNavigate: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    NavigationBar(
        modifier = modifier,
        containerColor = MaterialTheme.colorScheme.surface,
        tonalElevation = 8.dp
    ) {
        items.forEach { item ->
            val selected = currentRoute == item.route
            
            // Animation de sélection
            val scale by animateFloatAsState(
                targetValue = if (selected) 1.0f else 0.95f,
                label = "iconScale"
            )
            
            NavigationBarItem(
                selected = selected,
                onClick = { onNavigate(item.route) },
                icon = {
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier.scale(scale)
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center
                        ) {
                            Icon(
                                imageVector = if (selected && item.selectedIcon != null) 
                                    item.selectedIcon else item.icon,
                                contentDescription = item.label,
                                tint = if (selected) MaterialTheme.colorScheme.primary 
                                     else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(24.dp)
                            )
                            
                            // Badge pour notifications
                            item.badgeCount?.let { count ->
                                if (count > 0) {
                                    Spacer(modifier = Modifier.height(2.dp))
                                    Surface(
                                        shape = MaterialTheme.shapes.small,
                                        color = item.badgeColor(MaterialTheme.colorScheme),
                                        modifier = Modifier.size(16.dp)
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Text(
                                                text = if (count > 9) "9+" else "$count",
                                                fontSize = 8.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = MaterialTheme.colorScheme.onPrimary,
                                                maxLines = 1
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                label = {
                    Text(
                        text = item.label,
                        fontSize = 12.sp,
                        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                        color = if (selected) MaterialTheme.colorScheme.primary 
                              else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = MaterialTheme.colorScheme.primary,
                    unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                    selectedTextColor = MaterialTheme.colorScheme.primary,
                    unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
                    indicatorColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f)
                )
            )
        }
    }
}

/**
 * Configuration de navigation pour ÉTUDIANT
 * Routes: Dashboard | Épreuves | Résultats | Messagerie | Profil
 */
val studentNavItems = listOf(
    NavItem(
        route = "dashboard",
        label = "Accueil",
        icon = androidx.compose.material.icons.Icons.Filled.Dashboard,
        selectedIcon = androidx.compose.material.icons.Icons.Rounded.Dashboard
    ),
    NavItem(
        route = "epreuves",
        label = "Épreuves",
        icon = androidx.compose.material.icons.Icons.Filled.Book,
        selectedIcon = androidx.compose.material.icons.Icons.Rounded.Book
    ),
    NavItem(
        route = "resultats",
        label = "Résultats",
        icon = androidx.compose.material.icons.Icons.Filled.Assessment,
        selectedIcon = androidx.compose.material.icons.Icons.Rounded.Assessment,
        badgeCount = null // À dynamiser avec nouveaux résultats
    ),
    NavItem(
        route = "messagerie",
        label = "Messages",
        icon = androidx.compose.material.icons.Icons.Filled.Chat,
        selectedIcon = androidx.compose.material.icons.Icons.Rounded.Chat,
        badgeCount = null, // À dynamiser avec messages non lus
        badgeColor = { SectOrange }
    ),
    NavItem(
        route = "profile",
        label = "Profil",
        icon = androidx.compose.material.icons.Icons.Filled.Person,
        selectedIcon = androidx.compose.material.icons.Icons.Rounded.Person
    )
)

/**
 * Configuration de navigation pour ENSEIGNANT
 * Routes: Dashboard | Épreuves | Corrections | Messagerie | Profil
 */
val enseignantNavItems = listOf(
    NavItem(
        route = "dashboard",
        label = "Accueil",
        icon = androidx.compose.material.icons.Icons.Filled.Dashboard,
        selectedIcon = androidx.compose.material.icons.Icons.Rounded.Dashboard
    ),
    NavItem(
        route = "epreuves",
        label = "Épreuves",
        icon = androidx.compose.material.icons.Icons.Filled.Book,
        selectedIcon = androidx.compose.material.icons.Icons.Rounded.Book
    ),
    NavItem(
        route = "corrections",
        label = "Corrections",
        icon = androidx.compose.material.icons.Icons.Filled.EditNote,
        selectedIcon = androidx.compose.material.icons.Icons.Rounded.EditNote,
        badgeCount = null, // À dynamiser avec corrections en attente
        badgeColor = { SectRed }
    ),
    NavItem(
        route = "messagerie",
        label = "Messages",
        icon = androidx.compose.material.icons.Icons.Filled.Chat,
        selectedIcon = androidx.compose.material.icons.Icons.Rounded.Chat,
        badgeCount = null, // À dynamiser avec messages non lus
        badgeColor = { SectOrange }
    ),
    NavItem(
        route = "profile",
        label = "Profil",
        icon = androidx.compose.material.icons.Icons.Filled.Person,
        selectedIcon = androidx.compose.material.icons.Icons.Rounded.Person
    )
)

/**
 * Helper pour obtenir la configuration de navigation selon le rôle
 */
fun getNavItemsForRole(isEnseignant: Boolean): List<NavItem> {
    return if (isEnseignant) enseignantNavItems else studentNavItems
}
