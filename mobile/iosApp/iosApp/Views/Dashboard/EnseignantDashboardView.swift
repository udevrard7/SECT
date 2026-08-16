// SECT Mobile — iOS Dashboard Enseignant (inspiré du frontend web)
import SwiftUI
import Shared

/// Dashboard spécifique pour les ENSEIGNANTS
/// Inspiré du frontend web: /frontend/src/app/dashboard/enseignant/page.tsx
struct EnseignantDashboardView: View {
    @ObservedObject var viewModel: DashboardViewModel
    @EnvironmentObject var authVM: AuthViewModel
    
    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // ── En-tête : bienvenue ──
                welcomeHeader
                
                // ── Stats principales (4 cartes) ──
                if let stats = viewModel.enseignantStats {
                    enseignantStatsRow(stats: stats)
                } else if viewModel.isLoading {
                    ProgressView()
                        .frame(height: 100)
                } else if let error = viewModel.error {
                    ErrorBanner(message: error) {
                        Task { await viewModel.loadDashboard() }
                    }
                }
                
                // ── Corrections en attente ──
                if let stats = viewModel.enseignantStats {
                    correctionsSection(pendingCorrections: stats.pendingCorrections)
                }
                
                // ── Épreuves récentes ──
                if let stats = viewModel.enseignantStats {
                    recentEpreuvesSection(recentEpreuves: stats.recentEpreuves)
                }
                
                // ── Épreuves à venir ──
                if let stats = viewModel.enseignantStats {
                    upcomingEpreuvesSection(upcomingEpreuves: stats.epreuvesAVenir)
                }
                
                // ── Bouton rafraîchir ──
                Button(action: {
                    Task { await viewModel.loadDashboard() }
                }) {
                    Label("Rafraîchir", systemImage: "arrow.clockwise")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.sectGreen)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .padding(.horizontal)
            }
            .padding(.vertical)
        }
        .navigationTitle("Tableau de bord")
        .refreshable {
            await viewModel.loadDashboard()
        }
    }
    
    // ── MARK: - Header ──
    
    private var welcomeHeader: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("Bonjour, \(authVM.currentUser?.name.components(separatedBy: " ").first ?? "...")")
                    .font(.headline)
                Text("Enseignant")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "person.circle.fill")
                .font(.title)
                .foregroundStyle(Color.sectGreen)
        }
        .padding()
        .background(Color.sectGreen.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal)
    }
    
    // ── MARK: - Stats Row ──
    
    @ViewBuilder
    private func enseignantStatsRow(stats: EnseignantStats) -> some View {
        HStack(spacing: 12) {
            EnseignantStatItem(
                value: stats.nbEpreuves,
                label: "Épreuves",
                icon: "chart.bar.fill",
                color: Color.sectGreen
            )
            EnseignantStatItem(
                value: stats.nbQuestionsTotal,
                label: "Questions",
                icon: "questionmark.circle.fill",
                color: Color.sectBlue
            )
            EnseignantStatItem(
                value: stats.nbCorrectionsEnAttente,
                label: "À corriger",
                icon: "pencil.and.list.clipboard",
                color: Color.sectOrange
            )
            EnseignantStatItem(
                value: stats.nbEpreuvesActives,
                label: "Actives",
                icon: "timer",
                color: Color.sectPurple
            )
        }
        .padding(.horizontal)
    }
    
    // ── MARK: - Corrections Section ──
    
    @ViewBuilder
    private func correctionsSection(pendingCorrections: [PendingCorrection]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Corrections en attente")
                .font(.headline)
                .padding(.horizontal)
            
            if pendingCorrections.isEmpty {
                CardEmptyState(
                    icon: "checkmark.circle.fill",
                    title: "Aucune correction en attente 🎉",
                    color: .sectGreen
                )
            } else {
                ForEach(pendingCorrections.prefix(5), id: \.sessionId) { correction in
                    PendingCorrectionCard(correction: correction)
                }
            }
        }
    }
    
    // ── MARK: - Recent Epreuves Section ──
    
    @ViewBuilder
    private func recentEpreuvesSection(recentEpreuves: [RecentEpreuve]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Épreuves récentes")
                .font(.headline)
                .padding(.horizontal)
            
            if recentEpreuves.isEmpty {
                CardEmptyState(
                    icon: "doc.text",
                    title: "Aucune épreuve récente",
                    color: .secondary
                )
            } else {
                ForEach(recentEpreuves.prefix(5), id: \.id) { epreuve in
                    RecentEpreuveCard(epreuve: epreuve)
                }
            }
        }
    }
    
    // ── MARK: - Upcoming Epreuves Section ──
    
    @ViewBuilder
    private func upcomingEpreuvesSection(upcomingEpreuves: [EpreuveAVenir]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Épreuves à venir")
                .font(.headline)
                .padding(.horizontal)
            
            if upcomingEpreuves.isEmpty {
                CardEmptyState(
                    icon: "calendar.badge.exclamationmark",
                    title: "Aucune épreuve planifiée",
                    color: .secondary
                )
            } else {
                ForEach(upcomingEpreuves.prefix(5), id: \.id) { epreuve in
                    UpcomingEpreuveCard(epreuve: epreuve)
                }
            }
        }
    }
}

// ── MARK: - Stat Item ──

struct EnseignantStatItem: View {
    let value: Int32
    let label: String
    let icon: String
    let color: Color
    
    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(color)
            Text("\(value)")
                .font(.title2)
                .fontWeight(.bold)
                .foregroundStyle(color)
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(color.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

// ── MARK: - Pending Correction Card ──

struct PendingCorrectionCard: View {
    let correction: PendingCorrection
    
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "pencil.and.list.clipboard")
                .font(.title3)
                .foregroundStyle(Color.sectOrange)
                .frame(width: 32, height: 32)
                .background(Color.sectOrange.opacity(0.15))
                .clipShape(Circle())
            
            VStack(alignment: .leading, spacing: 4) {
                Text(correction.etudiantNom)
                    .font(.subheadline)
                    .fontWeight(.medium)
                
                Text(correction.epreuveTitre)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                
                Text("Type: \(correction.questionType)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            
            Spacer()
            
            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding()
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .padding(.horizontal)
    }
}

// ── MARK: - Recent Epreuve Card ──

struct RecentEpreuveCard: View {
    let epreuve: RecentEpreuve
    
    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(epreuve.titre)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .lineLimit(1)
                
                Text("\(epreuve.nbParticipants) participants")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                
                if let moyenne = epreuve.moyenne {
                    Text("Moyenne: \(String(format: "%.1f", moyenne))/20")
                        .font(.caption2)
                        .foregroundStyle(Color.sectBlue)
                }
            }
            
            Spacer()
            
            Badge(text: epreuve.statut, color: statutColor(epreuve.statut))
        }
        .padding()
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .padding(.horizontal)
    }
    
    private func statutColor(_ statut: String) -> Color {
        switch statut {
        case "EN_COURS": return .sectGreen
        case "PLANIFIEE": return .sectBlue
        case "TERMINEE": return .sectOrange
        case "CLOTUREE": return .sectRed
        default: return .gray
        }
    }
}

// ── MARK: - Upcoming Epreuve Card ──

struct UpcomingEpreuveCard: View {
    let epreuve: EpreuveAVenir
    
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "calendar")
                .font(.title3)
                .foregroundStyle(Color.sectPurple)
                .frame(width: 32, height: 32)
                .background(Color.sectPurple.opacity(0.15))
                .clipShape(Circle())
            
            VStack(alignment: .leading, spacing: 4) {
                Text(epreuve.titre)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .lineLimit(1)
                
                Text("\(formatDate(epreuve.date)) · \(epreuve.duree) min")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            
            Spacer()
            
            Badge(text: epreuve.statut, color: statutColor(epreuve.statut))
        }
        .padding()
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .padding(.horizontal)
    }
    
    private func statutColor(_ statut: String) -> Color {
        switch statut {
        case "EN_COURS": return .sectGreen
        case "PLANIFIEE": return .sectBlue
        case "TERMINEE": return .sectOrange
        case "CLOTUREE": return .sectRed
        default: return .gray
        }
    }
    
    private func formatDate(_ isoString: String) -> String {
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = isoFormatter.date(from: isoString) else { return isoString }
        
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "fr_FR")
        formatter.dateStyle = .short
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}

// ── MARK: - Empty State Card ──

struct CardEmptyState: View {
    let icon: String
    let title: String
    let color: Color
    
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: icon)
                .font(.largeTitle)
                .foregroundStyle(color)
            Text(title)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .padding(.horizontal)
    }
}

// ── MARK: - Badge ──

struct Badge: View {
    let text: String
    let color: Color
    
    var body: some View {
        Text(text)
            .font(.caption2)
            .fontWeight(.semibold)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color.opacity(0.15))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }
}

// ── MARK: - Error Banner ──

struct ErrorBanner: View {
    let message: String
    let onRetry: () -> Void
    
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.sectRed)
            Text(message)
                .font(.caption)
                .foregroundStyle(.sectRed)
            Spacer()
            Button("Réessayer") {
                onRetry()
            }
            .font(.caption)
            .fontWeight(.semibold)
            .foregroundStyle(.sectRed)
        }
        .padding()
        .background(Color.sectRed.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .padding(.horizontal)
    }
}

#Preview {
    NavigationStack {
        EnseignantDashboardView(viewModel: DashboardViewModel())
            .environmentObject(AuthViewModel())
    }
}
