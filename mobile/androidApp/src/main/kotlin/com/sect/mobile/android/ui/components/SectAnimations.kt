// SECT Mobile — Animations et transitions (Savane EdTech)
// SECT-MOBILE-NAV-PHASE-E : micro-interactions et transitions fluides
package com.sect.mobile.android.ui.components

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer

// ════════════════════════════════════════════════════════
// Animations utilitaires
// ════════════════════════════════════════════════════════

/**
 * Animation de fondu entrant pour les écrans.
 */
@Composable
fun fadeInTransition(): EnterTransition {
    return fadeIn(animationSpec = tween(300)) + slideInHorizontally(
        initialOffsetX = { it / 20 },
        animationSpec = tween(300)
    )
}

/**
 * Animation de fondu sortant.
 */
@Composable
fun fadeOutTransition(): ExitTransition {
    return fadeOut(animationSpec = tween(200)) + slideOutHorizontally(
        targetOffsetX = { -it / 20 },
        animationSpec = tween(200)
    )
}

/**
 * Pulsation subtile (pour badges, notifications).
 */
@Composable
fun Modifier.pulseAnimation(enabled: Boolean = true): Modifier {
    if (!enabled) return this
    val transition = rememberInfiniteTransition(label = "pulse")
    val scale by transition.animateFloat(
        initialValue = 1f,
        targetValue = 1.1f,
        animationSpec = infiniteRepeatable(
            animation = tween(800, easing = EaseInOut),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulseScale"
    )
    return this.graphicsLayer { scaleX = scale; scaleY = scale }
}

/**
 * Animation de rebond pour les succès.
 */
@Composable
fun Modifier.bounceOnAppear(): Modifier {
    val transition = rememberInfiniteTransition(label = "bounce")
    val scale by transition.animateFloat(
        initialValue = 1f,
        targetValue = 1.05f,
        animationSpec = infiniteRepeatable(
            animation = tween(1000, easing = EaseOutBack),
            repeatMode = RepeatMode.Reverse
        ),
        label = "bounceScale"
    )
    return this.graphicsLayer { scaleX = scale; scaleY = scale }
}
