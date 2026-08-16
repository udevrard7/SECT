//
//  SectDesignSystem.swift
//  SECT
//
//  SECT-MOBILE-NAV-PHASE-E : composants DS unifiés iOS (Savane EdTech)
//  Miroir de /frontend/src/components/ds/ + android SectDesignSystem.kt
//
import SwiftUI
import Shared

// ════════════════════════════════════════════════════════
// GlassCard — glassmorphism léger
// ════════════════════════════════════════════════════════

struct GlassCard<Content: View>: View {
    let content: () -> Content

    init(@ViewBuilder content: @escaping () -> Content) {
        self.content = content
    }

    var body: some View {
        content()
            .padding()
            .background(Color.savaneCard.opacity(0.85))
            .background(.ultraThinMaterial)
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(Color.white.opacity(0.3), lineWidth: 1)
            )
            .cornerRadius(16)
            .shadow(color: Color.black.opacity(0.05), radius: 8, x: 0, y: 2)
    }
}

// ════════════════════════════════════════════════════════
// KenteDivider — motif kente tricolore (lime/terre/or)
// ════════════════════════════════════════════════════════

struct KenteDivider: View {
    var height: CGFloat = 4

    private let bands: [Color] = [.sectLime, .sectTerreCuite, .sectGold]

    var body: some View {
        HStack(spacing: 0) {
            ForEach(0..<6, id: \.self) { i in
                Rectangle()
                    .fill(bands[i % 3])
                    .frame(height: height)
            }
        }
    }
}

// ════════════════════════════════════════════════════════
// SectStatCard — carte métrique KPI
// ════════════════════════════════════════════════════════

struct SectStatCard: View {
    let value: String
    let label: String
    let icon: String
    let accentColor: Color

    init(value: String, label: String, icon: String, accentColor: Color = .sectLime) {
        self.value = value
        self.label = label
        self.icon = icon
        self.accentColor = accentColor
    }

    var body: some View {
        HStack(spacing: 10) {
            // Icône dans un cercle coloré
            Image(systemName: icon)
                .font(.title3)
                .foregroundColor(accentColor)
                .frame(width: 40, height: 40)
                .background(accentColor.opacity(0.15))
                .cornerRadius(10)

            VStack(alignment: .leading, spacing: 2) {
                Text(value)
                    .font(.title3).fontWeight(.bold)
                Text(label)
                    .font(.caption).foregroundColor(.secondary)
            }
            Spacer()
        }
        .padding(12)
        .background(Color.savaneCard.opacity(0.85))
        .background(.ultraThinMaterial)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.white.opacity(0.3), lineWidth: 1)
        )
        .cornerRadius(12)
    }
}

// ════════════════════════════════════════════════════════
// SectProgressBar — barre animée avec gradient
// ════════════════════════════════════════════════════════

struct SectProgressBar: View {
    let progress: Double
    var color: Color = .sectLime

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                // Fond
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.savaneBorder)
                    .frame(height: 8)
                // Remplissage animé
                RoundedRectangle(cornerRadius: 4)
                    .fill(
                        LinearGradient(
                            colors: [color, color.opacity(0.7)],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .frame(width: geo.size.width * CGFloat(progress), height: 8)
                    .animation(.easeInOut(duration: 0.6), value: progress)
            }
        }
        .frame(height: 8)
    }
}

// ════════════════════════════════════════════════════════
// SectBadge — badge compact
// ════════════════════════════════════════════════════════

struct SectBadge: View {
    let text: String
    var color: Color = .sectLime

    var body: some View {
        Text(text)
            .font(.caption).fontWeight(.bold)
            .foregroundColor(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color.opacity(0.15))
            .cornerRadius(6)
    }
}
