// SECT Mobile — Design System Components (Savane EdTech)
// SECT-MOBILE-NAV-PHASE-E : composants DS unifiés Android
//
// Miroir des composants web /frontend/src/components/ds/ :
// - GlassCard (glassmorphism léger)
// - KenteDivider (motif kente tricolore lime/terre/or)
// - SectStatCard (carte métrique KPI)
// - SectProgressBar (barre animée)
package com.sect.mobile.android.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.sect.mobile.android.theme.*

// ════════════════════════════════════════════════════════
// GlassCard — glassmorphism léger (backdrop blur + transparence)
// ════════════════════════════════════════════════════════

/**
 * Carte avec effet glassmorphism léger (inspiré du web GlassModal).
 * Fond semi-transparent + bordure subtile + léger blur.
 *
 * @param modifier Modifier personnalisé
 * @param content Contenu de la carte
 */
@Composable
fun GlassCard(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit
) {
    Card(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .border(
                width = 1.dp,
                color = Color.White.copy(alpha = 0.3f),
                shape = RoundedCornerShape(16.dp)
            ),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.85f)
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(content = content)
    }
}

// ════════════════════════════════════════════════════════
// KenteDivider — motif kente tricolore (lime/terre/or)
// ════════════════════════════════════════════════════════

/**
 * Séparateur avec motif kente — 3 bandes alternées vert lime / terre cuite / or.
 * Signature visuelle africaine subtile (inspiré du PDF epreuve-pdf-react.tsx).
 *
 * @param modifier Modifier personnalisé
 * @param thickness Hauteur du divider (défaut 4dp)
 */
@Composable
fun KenteDivider(
    modifier: Modifier = Modifier,
    thickness: Int = 4
) {
    Row(modifier = modifier.height(thickness.dp)) {
        // Bandes alternées : lime / terre / or / lime / terre / or
        val bands = listOf(SectLime, SectTerreCuite, SectGold)
        repeat(6) { i ->
            Box(
                modifier = Modifier
                    .weight(1f)
                    .background(bands[i % 3])
            )
        }
    }
}

// ════════════════════════════════════════════════════════
// SectStatCard — carte métrique KPI (miroir web StatCard)
// ════════════════════════════════════════════════════════

/**
 * Carte statistique avec valeur + label + icône + couleur accent.
 *
 * @param value Valeur affichée (ex: "15", "75%")
 * @param label Libellé (ex: "Épreuves", "Moyenne")
 * @param icon Icône Material (vector)
 * @param accentColor Couleur d'accent (défaut: vert lime)
 */
@Composable
fun SectStatCard(
    value: String,
    label: String,
    icon: @Composable () -> Unit,
    accentColor: Color = SectLime,
    modifier: Modifier = Modifier
) {
    GlassCard(modifier = modifier) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(accentColor.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center
            ) {
                icon()
            }
            Spacer(modifier = Modifier.width(10.dp))
            Column {
                Text(
                    value,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    label,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

// ════════════════════════════════════════════════════════
// SectProgressBar — barre de progression animée
// ════════════════════════════════════════════════════════

/**
 * Barre de progression animée avec gradient.
 *
 * @param progress Valeur 0..1
 * @param color Couleur de la barre (défaut: vert lime)
 * @param modifier Modifier personnalisé
 */
@Composable
fun SectProgressBar(
    progress: Float,
    modifier: Modifier = Modifier,
    color: Color = SectLime
) {
    val animatedProgress by animateFloatAsState(
        targetValue = progress.coerceIn(0f, 1f),
        animationSpec = tween(durationMillis = 600),
        label = "progress"
    )
    Box(
        modifier = modifier
            .height(8.dp)
            .clip(RoundedCornerShape(4.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(animatedProgress)
                .height(8.dp)
                .clip(RoundedCornerShape(4.dp))
                .background(
                    Brush.horizontalGradient(
                        listOf(color, color.copy(alpha = 0.7f))
                    )
                )
        )
    }
}

// ════════════════════════════════════════════════════════
// SectBadge — badge avec couleur sémantique
// ════════════════════════════════════════════════════════

/**
 * Badge compact avec couleur d'accent.
 *
 * @param text Texte du badge
 * @param color Couleur d'accent (défaut: vert lime)
 */
@Composable
fun SectBadge(
    text: String,
    color: Color = SectLime,
    modifier: Modifier = Modifier
) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.Bold,
        color = color,
        modifier = modifier
            .clip(RoundedCornerShape(6.dp))
            .background(color.copy(alpha = 0.15f))
            .padding(horizontal = 8.dp, vertical = 4.dp)
    )
}
