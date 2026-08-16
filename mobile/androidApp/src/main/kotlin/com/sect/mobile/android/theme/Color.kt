// SECT Mobile — Android Theme (Material 3)
package com.sect.mobile.android.theme

import androidx.compose.ui.graphics.Color

// ── Couleurs SECT (inspirées de l'identité visuelle) ──
// Palette principale: vert émeraude (éducation Afrique) + accents

val SectGreen = Color(0xFF10B981)
val SectGreenDark = Color(0xFF059669)
val SectGreenLight = Color(0xFF34D399)

val SectOrange = Color(0xFFF97316)
val SectOrangeLight = Color(0xFFFDBA74)

val SectBlue = Color(0xFF0EA5E9)
val SectBlueDark = Color(0xFF0284C7)

val SectRed = Color(0xFFEF4444)
val SectYellow = Color(0xFFF59E0B)

val Gray50 = Color(0xFFF9FAFB)
val Gray100 = Color(0xFFF3F4F6)
val Gray200 = Color(0xFFE5E7EB)
val Gray300 = Color(0xFFD1D5DB)
val Gray400 = Color(0xFF9CA3AF)
val Gray500 = Color(0xFF6B7280)
val Gray600 = Color(0xFF4B5563)
val Gray700 = Color(0xFF374151)
val Gray800 = Color(0xFF1F2937)
val Gray900 = Color(0xFF111827)

// ── Light Color Scheme ──
val LightColorScheme = androidx.compose.material3.lightColorScheme(
    primary = SectGreen,
    onPrimary = Color.White,
    primaryContainer = SectGreenLight,
    onPrimaryContainer = Gray900,
    secondary = SectBlue,
    onSecondary = Color.White,
    secondaryContainer = SectBlue,
    onSecondaryContainer = Color.White,
    tertiary = SectOrange,
    onTertiary = Color.White,
    error = SectRed,
    onError = Color.White,
    background = Gray50,
    onBackground = Gray900,
    surface = Color.White,
    onSurface = Gray900,
    surfaceVariant = Gray100,
    onSurfaceVariant = Gray600,
    outline = Gray300,
    outlineVariant = Gray200,
)

// ── Dark Color Scheme ──
val DarkColorScheme = androidx.compose.material3.darkColorScheme(
    primary = SectGreen,
    onPrimary = Color.White,
    primaryContainer = SectGreenDark,
    onPrimaryContainer = SectGreenLight,
    secondary = SectBlue,
    onSecondary = Color.White,
    secondaryContainer = SectBlueDark,
    onSecondaryContainer = Color.White,
    tertiary = SectOrange,
    onTertiary = Color.White,
    error = SectRed,
    onError = Color.White,
    background = Gray900,
    onBackground = Gray50,
    surface = Gray800,
    onSurface = Gray50,
    surfaceVariant = Gray700,
    onSurfaceVariant = Gray300,
    outline = Gray600,
    outlineVariant = Gray700,
)
