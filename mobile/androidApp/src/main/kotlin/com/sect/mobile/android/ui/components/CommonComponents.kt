// SECT Mobile — Composants UI de base (Design System)
// Inspiré du /frontend/src/components/ui et /frontend/src/components/ds
package com.sect.mobile.android.ui.components

import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Error
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// ══════════════════════════════════════════════════
// COULEURS DE LA MARQUE (inspirées du frontend)
// ══════════════════════════════════════════════════

val SectGreen = Color(0xFF10B981)
val SectBlue = Color(0xFF3B82F6)
val SectOrange = Color(0xFFF59E0B)
val SectPurple = Color(0xFF8B5CF6)
val SectRed = Color(0xFFEF4444)

// ══════════════════════════════════════════════════
// STAT CARD — Inspiré de /frontend/src/components/ds/stat-card.tsx
// ══════════════════════════════════════════════════

@Composable
fun StatCard(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    color: Color = SectGreen
) {
    Card(
        modifier = modifier.height(80.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = color.copy(alpha = 0.1f))
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(12.dp),
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = value,
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                color = color
            )
            Text(
                text = label,
                fontSize = 12.sp,
                color = Color.Gray
            )
        }
    }
}

// ══════════════════════════════════════════════════
// WELCOME CARD — Inspiré du dashboard frontend
// ══════════════════════════════════════════════════

@Composable
fun WelcomeCard(
    userName: String?,
    role: String,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = SectGreen.copy(alpha = 0.1f))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Bonjour, ${userName?.split(" ")?.firstOrNull() ?: "..."}",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = role,
                    fontSize = 14.sp,
                    color = Color.Gray
                )
            }
            Icon(
                imageVector = Icons.Filled.AccountCircle,
                contentDescription = null,
                tint = SectGreen,
                modifier = Modifier.size(48.dp)
            )
        }
    }
}

// ══════════════════════════════════════════════════
// EPREUVE CARD — Inspiré des cartes épreuves frontend
// ══════════════════════════════════════════════════

@Composable
fun EpreuveCard(
    titre: String,
    statut: String,
    duree: Int,
    dateDebut: String,
    nbQuestions: Int? = null,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val statutColor = when (statut) {
        "EN_COURS" -> SectGreen
        "PLANIFIEE" -> SectBlue
        "TERMINEE" -> SectOrange
        "CLOTUREE" -> SectRed
        else -> Color.Gray
    }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        shape = RoundedCornerShape(10.dp),
        onClick = onClick
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp)
        ) {
            // Titre
            Text(
                text = titre,
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 2
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            // Badges et infos
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Badge statut
                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = statutColor.copy(alpha = 0.15f)
                ) {
                    Text(
                        text = statut.replace("_", " "),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = statutColor,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                    )
                }
                
                // Durée
                Text(
                    text = "$duree min",
                    fontSize = 12.sp,
                    color = Color.Gray
                )
                
                // Questions
                if (nbQuestions != null) {
                    Text(
                        text = "$nbQuestions Q",
                        fontSize = 12.sp,
                        color = Color.Gray
                    )
                }
            }
            
            // Date
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "Début: $dateDebut",
                fontSize = 12.sp,
                color = Color.Gray
            )
        }
    }
}

// ══════════════════════════════════════════════════
// LOADING SKELETON — Inspiré de PulseSkeleton frontend
// ══════════════════════════════════════════════════

@Composable
fun SkeletonRectangle(
    modifier: Modifier = Modifier,
    height: Int = 16
) {
    val transition = rememberInfiniteTransition(label = "skeleton")
    val alpha by transition.animateFloat(
        initialValue = 0.3f,
        targetValue = 0.7f,
        animationSpec = infiniteRepeatable(
            animation = tween(800),
            repeatMode = RepeatMode.Reverse
        ),
        label = "skeletonAlpha"
    )
    Box(
        modifier = modifier
            .height(height.dp)
            .background(Color.LightGray.copy(alpha = alpha), RoundedCornerShape(4.dp))
    )
}

// ══════════════════════════════════════════════════
// ERROR STATE — Inspiré de /frontend/src/components/shared/error-state.tsx
// ══════════════════════════════════════════════════

@Composable
fun ErrorState(
    message: String,
    onRetry: (() -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            imageVector = Icons.Filled.Error,
            contentDescription = null,
            tint = SectRed,
            modifier = Modifier.size(48.dp)
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = message,
            color = SectRed,
            fontSize = 14.sp
        )
        if (onRetry != null) {
            Spacer(modifier = Modifier.height(16.dp))
            Button(onClick = onRetry) {
                Text("Réessayer")
            }
        }
    }
}

// ══════════════════════════════════════════════════
// EMPTY STATE — Pour les listes vides
// ══════════════════════════════════════════════════

@Composable
fun EmptyState(
    icon: ImageVector,
    title: String,
    description: String,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = Color.Gray,
            modifier = Modifier.size(48.dp)
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = title,
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold,
            color = Color.DarkGray
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = description,
            fontSize = 14.sp,
            color = Color.Gray
        )
    }
}
