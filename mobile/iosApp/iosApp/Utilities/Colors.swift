// SECT Mobile — iOS Color Extensions — "Savane EdTech"
// SECT-MOBILE-NAV-PHASE-E : alignement sur la palette du web (globals.css)
//
// Palette "Savane EdTech" (frontend/src/app/globals.css) :
// - Primary   : Vert lime #84CC16 (engagement, croissance, savane)
// - Secondary : Terre cuite #C2410C (terre d'Afrique de l'Ouest)
// - Sidebar   : Bleu nuit #2C3E50 (profondeur, sérieux académique)
// - Gold      : #D4A017 (récompenses, soleil africain)
// - Tech      : #06B6D4 cyan (IA, technologie)
// - Fond      : #F0F2F5 gris très clair
import SwiftUI

extension Color {
    // ── Primary : Vert lime #84CC16 ──
    static let sectLime = Color(red: 0.518, green: 0.800, blue: 0.086)       // #84CC16
    static let sectLimeDark = Color(red: 0.247, green: 0.384, blue: 0.071)   // #3F6212
    static let sectLimeLight = Color(red: 0.639, green: 0.902, blue: 0.208)  // #A3E635

    // ── Secondary : Terre cuite #C2410C ──
    static let sectTerreCuite = Color(red: 0.760, green: 0.255, blue: 0.047) // #C2410C
    static let sectTerreCuiteLight = Color(red: 0.996, green: 0.843, blue: 0.667) // #FED7AA

    // ── Navy : Bleu nuit #2C3E50 ──
    static let sectNavy = Color(red: 0.173, green: 0.243, blue: 0.314)       // #2C3E50

    // ── Gold : Or africain #D4A017 ──
    static let sectGold = Color(red: 0.831, green: 0.627, blue: 0.090)       // #D4A017

    // ── Tech : Cyan #06B6D4 ──
    static let sectTech = Color(red: 0.024, green: 0.714, blue: 0.831)       // #06B6D4

    // ── Statut sémantique ──
    static let sectSuccess = sectLime
    static let sectWarning = Color(red: 0.961, green: 0.651, blue: 0.137)   // #F5A623
    static let sectInfo = sectNavy
    static let sectDanger = Color(red: 0.816, green: 0.008, blue: 0.106)    // #D0021B

    // ── Tiers gamification ──
    static let sectBronze = Color(red: 0.573, green: 0.251, blue: 0.055)    // #92400E
    static let sectSilver = Color(red: 0.580, green: 0.639, blue: 0.722)    // #94A3B8
    static let sectPlatinum = Color(red: 0.898, green: 0.906, blue: 0.922)  // #E5E7EB

    // ── Neutres ──
    static let savaneBg = Color(red: 0.941, green: 0.945, blue: 0.961)       // #F0F2F5
    static let savaneCard = Color.white
    static let savaneBorder = Color(red: 0.878, green: 0.878, blue: 0.878)  // #E0E0E0
    static let savaneMuted = Color(red: 0.420, green: 0.439, blue: 0.490)   // #6B7280

    // ── Alias rétrocompatibles (anciens noms) ──
    //sectGreen → sectLime, sectOrange → sectTerreCuite, etc.
    static let sectGreen = sectLime
    static let sectGreenDark = sectLimeDark
    static let sectOrange = sectTerreCuite
    static let sectBlue = sectTech
    static let sectPurple = Color(red: 0.580, green: 0.345, blue: 0.925)    // #9558EC (conservé)
    static let sectRed = Color(red: 0.937, green: 0.267, blue: 0.267)       // #EF4444 (conservé)
}

// Extension ShapeStyle pour permettre .foregroundStyle(.sectLime)
extension ShapeStyle where Self == Color {
    static var sectLime: Color { .init(.sectLime) }
    static var sectLimeDark: Color { .init(.sectLimeDark) }
    static var sectLimeLight: Color { .init(.sectLimeLight) }
    static var sectTerreCuite: Color { .init(.sectTerreCuite) }
    static var sectNavy: Color { .init(.sectNavy) }
    static var sectGold: Color { .init(.sectGold) }
    static var sectTech: Color { .init(.sectTech) }
    static var sectSuccess: Color { .init(.sectSuccess) }
    static var sectWarning: Color { .init(.sectWarning) }
    static var sectInfo: Color { .init(.sectInfo) }
    static var sectDanger: Color { .init(.sectDanger) }
    static var savaneBg: Color { .init(.savaneBg) }
    static var savaneCard: Color { .init(.savaneCard) }
    static var savaneMuted: Color { .init(.savaneMuted) }

    // Alias rétrocompatibles
    static var sectGreen: Color { .init(.sectGreen) }
    static var sectGreenDark: Color { .init(.sectGreenDark) }
    static var sectOrange: Color { .init(.sectOrange) }
    static var sectBlue: Color { .init(.sectBlue) }
    static var sectPurple: Color { .init(.sectPurple) }
    static var sectRed: Color { .init(.sectRed) }
}
