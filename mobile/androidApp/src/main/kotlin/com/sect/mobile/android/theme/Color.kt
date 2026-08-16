// SECT Mobile — Android Theme (Material 3) — "Savane EdTech"
// SECT-MOBILE-NAV-PHASE-E : alignement sur la palette du web (globals.css)
//
// Palette "Savane EdTech" (frontend/src/app/globals.css) :
// - Primary   : Vert lime #84CC16 (engagement, croissance, savane)
// - Secondary : Terre cuite #C2410C (terre d'Afrique de l'Ouest)
// - Sidebar   : Bleu nuit #2C3E50 (profondeur, sérieux académique)
// - Gold      : #D4A017 (récompenses, soleil africain)
// - Tech      : #06B6D4 cyan (IA, technologie)
// - Fond      : #F0F2F5 gris très clair
//
// Statut sémantique :
// - success : vert lime   - warning : orange soleil   - info : bleu nuit
// - danger  : rouge
//
// Tiers gamification : bronze / silver / gold / platinum / xp
package com.sect.mobile.android.theme

import androidx.compose.ui.graphics.Color

// ════════════════════════════════════════════════════════
// Palette "Savane EdTech" (alignée sur /frontend/src/app/globals.css)
// ════════════════════════════════════════════════════════

// Primary — Vert lime #84CC16 (engagement, croissance, savane)
val SectLime = Color(0xFF84CC16)
val SectLimeDark = Color(0xFF3F6212)   // primary-text : vert foncé pour texte sur fond clair (7:1 AA)
val SectLimeLight = Color(0xFFA3E635)

// Secondary — Terre cuite #C2410C (terre d'Afrique de l'Ouest)
val SectTerreCuite = Color(0xFFC2410C)
val SectTerreCuiteLight = Color(0xFFFED7AA)

// Navy — Bleu nuit #2C3E50 (profondeur, sérieux académique)
val SectNavy = Color(0xFF2C3E50)
val SectNavyLight = Color(0xFF34495E)

// Gold — Or africain #D4A017 (soleil, récompenses)
val SectGold = Color(0xFFD4A017)
val SectGoldLight = Color(0xFFFBBF24)

// Tech — Cyan #06B6D4 (IA, technologie)
val SectTech = Color(0xFF06B6D4)

// ════════════════════════════════════════════════════════
// Statut sémantique
// ════════════════════════════════════════════════════════

val SectSuccess = SectLime           // vert lime = succès/croissance
val SectSuccessText = SectLimeDark   // vert foncé pour texte
val SectWarning = Color(0xFFF5A623)  // orange soleil
val SectInfo = SectNavy              // bleu nuit info
val SectDanger = Color(0xFFD0021B)   // rouge
val SectError = Color(0xFFEF4444)    // rouge error (shadcn)

// ════════════════════════════════════════════════════════
// Tiers gamification (palette africaine)
// ════════════════════════════════════════════════════════

val SectBronze = Color(0xFF92400E)   // terre brune
val SectSilver = Color(0xFF94A3B8)   // argent
val SectPlatinum = Color(0xFFE5E7EB) // platine
val SectXp = SectLime                // XP = vert lime croissance

// ════════════════════════════════════════════════════════
// Neutres (gris)
// ════════════════════════════════════════════════════════

val SavaneBg = Color(0xFFF0F2F5)     // fond gris très clair
val SavaneCard = Color(0xFFFFFFFF)   // carte blanche
val SavaneBorder = Color(0xFFE0E0E0) // bordure
val SavaneMuted = Color(0xFF6B7280)  // texte secondaire

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

// ════════════════════════════════════════════════════════
// Alias rétrocompatibles (anciens noms utilisés dans le code)
// ════════════════════════════════════════════════════════

@Deprecated("Utiliser SectLime", ReplaceWith("SectLime"))
val SectGreen = SectLime

@Deprecated("Utiliser SectLimeDark", ReplaceWith("SectLimeDark"))
val SectGreenDark = SectLimeDark

@Deprecated("Utiliser SectLimeLight", ReplaceWith("SectLimeLight"))
val SectGreenLight = SectLimeLight

val SectOrange = SectTerreCuite
val SectOrangeLight = SectTerreCuiteLight
val SectBlue = SectTech
val SectBlueDark = Color(0xFF0284C7)
val SectPurple = Color(0xFF9558EC)
val SectRed = SectError
val SectYellow = SectGold

// ════════════════════════════════════════════════════════
// Color Schemes — "Savane EdTech" (light + dark)
// ════════════════════════════════════════════════════════

val LightColorScheme = androidx.compose.material3.lightColorScheme(
    primary = SectLime,
    onPrimary = SectLimeDark,            // texte sombre sur vert lime (contraste 8:1)
    primaryContainer = SectLimeLight,
    onPrimaryContainer = Gray900,
    secondary = SectTerreCuite,
    onSecondary = Color.White,
    secondaryContainer = SectTerreCuiteLight,
    onSecondaryContainer = Color.White,
    tertiary = SectGold,
    onTertiary = Gray900,
    error = SectError,
    onError = Color.White,
    background = SavaneBg,
    onBackground = SectNavy,
    surface = SavaneCard,
    onSurface = SectNavy,
    surfaceVariant = Gray100,
    onSurfaceVariant = SavaneMuted,
    outline = Gray300,
    outlineVariant = SavaneBorder,
)

val DarkColorScheme = androidx.compose.material3.darkColorScheme(
    primary = SectLime,
    onPrimary = SectLimeDark,
    primaryContainer = SectLimeDark,
    onPrimaryContainer = SectLimeLight,
    secondary = SectTerreCuite,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFF7C2D12),
    onSecondaryContainer = SectTerreCuiteLight,
    tertiary = SectGold,
    onTertiary = Gray900,
    error = SectError,
    onError = Color.White,
    background = Color(0xFF1A1A1A),
    onBackground = Gray50,
    surface = Color(0xFF242424),
    onSurface = Gray50,
    surfaceVariant = Gray700,
    onSurfaceVariant = Gray300,
    outline = Gray600,
    outlineVariant = Gray700,
)
