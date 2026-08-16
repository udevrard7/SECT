// SECT Mobile — iOS Dashboard Étudiant (inspiré du frontend web)
import SwiftUI
import Shared

/// Dashboard spécifique pour les ÉTUDIANTS
/// Inspiré du frontend web: /frontend/src/app/dashboard/etudiant/page.tsx
///
/// Affiche:
/// - Statistiques clés (épreuves à venir, terminées, moyenne, meilleure note)
/// - Session en cours (si examen actif)
/// - Épreuves à venir avec détails
/// - Résultats récents avec évolution
/// - Performance par type de question
struct EtudiantDashboardView: View {
    @StateObject var viewModel = DashboardViewModel()
    @EnvironmentObject var authVM: AuthViewModel
    
    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // ── En-tête : bienvenue ──
                welcomeHeader
                
                // ── Stats principales (4 cartes) ──
                if let stats = viewModel.etudiantStats {
                    etudiantStatsRow(stats: stats)
                } else if viewModel.isLoading {
                    ProgressView()
                        .frame(height: 100)
                } else if let error = viewModel.error {
                    ErrorBanner(message: error) {
                        Task { await viewModel.loadDashboard() }
                    }
                }
                
                // ── Session en cours (alerte) ──
                if let stats = viewModel.etudiantStats,
                   let session = stats.sessionEnCours {
                    sessionEnCoursAlert(session: session)
                }
                
                // ── Épreuves à venir ──
                if let stats = viewModel.etudiantStats {
                    epreuvesAVenirSection(epreuves: stats.epreuvesAVenir)
                }
                
                // ── Résultats récents ──
                if let stats = viewModel.etudiantStats {
                    resultatsRecentsSection(resultats: stats.resultatsRecents)
                }
                
                // ── Performance par type ──
                if let stats = viewModel.etudiantStats {
                    performanceParTypeSection(performanceParType: stats.performanceParType)
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
        .task {
            await viewModel.loadDashboard()
        }
    }
    
    // ── MARK: - Header ──
    
    private var welcomeHeader: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("Bonjour, \(authVM.currentUser?.name.components(separatedBy: " ").first ?? "...")")
                    .font(.headline)
                Text("Étudiant")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "graduationcap.fill")
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
    private func etudiantStatsRow(stats: EtudiantStats) -> some View {
        HStack(spacing: 12) {
            EtudiantStatItem(
                value: stats.nbEpreuvesAVenir,
                label: "À venir",
                icon: "calendar",
                color: Color.sectBlue
            )
            EtudiantStatItem(
                value: stats.nbEpreuvesTerminees,
                label: "Terminées",
                icon: "checkmark.circle.fill",
                color: Color.sectGreen
            )
            EtudiantStatItem(
                value: Int32(stats.moyenne),
                label: "Moyenne",
                icon: "chart.line.uptrend.xyaxis",
                color: Color.sectPurple
            )
            EtudiantStatItem(
                value: Int32(stats.meilleureNote),
                label: "Meilleure",
                icon: "star.fill",
                color: Color.sectOrange
            )
        }
        .padding(.horizontal)
    }
    
    // ── MARK: - Session en Cours Alert ──
    
    @ViewBuilder
    private func sessionEnCoursAlert(session: SessionEnCours) -> some View {
        HStack(spacing: 16) {
            Image(systemName: "timer")
                .font(.title2)
                .foregroundStyle(Color.white)
                .frame(width: 40, height: 40)
                .background(Color.sectOrange)
                .clipShape(Circle())
            
            VStack(alignment: .leading, spacing: 4) {
                Text("Examen en cours")
                    .font(.headline)
                    .foregroundStyle(Color.white)
                
                Text(session.epreuveTitre)
                    .font(.subheadline)
                    .foregroundStyle(Color.white.opacity(0.9))
            }
            
            Spacer()
            
            Button(action: {
                // TODO: Navigation vers la passation
            }) {
                Text("Reprendre")
                    .font(.caption)
                    .fontWeight(.semibold)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(Color.white)
            .foregroundStyle(Color.sectOrange)
            .clipShape(Capsule())
        }
        .padding()
        .background(
            LinearGradient(
                colors: [Color.sectOrange, Color.sectOrange.opacity(0.8)],
                startPoint: .leading,
                endPoint: .trailing
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal)
    }
    
    // ── MARK: - Épreuves à Venir Section ──
    
    @ViewBuilder
    private func epreuvesAVenirSection(epreuves: [EpreuveAVenirEtudiant]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Épreuves à venir")
                .font(.headline)
                .padding(.horizontal)
            
            if epreuves.isEmpty {
                CardEmptyState(
                    icon: "calendar.badge.exclamationmark",
                    title: "Aucune épreuve à venir",
                    color: .secondary
                )
            } else {
                ForEach(epreuves.prefix(5), id: \.id) { epreuve in
                    NavigationLink {
                        // TODO: Navigation vers détail ou passation
                        EmptyView()
                    } label: {
                        EpreuveAVenirCard(epreuve: epreuve)
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal)
                }
            }
        }
    }
    
    // ── MARK: - Résultats Récents Section ──
    
    @ViewBuilder
    private func resultatsRecentsSection(resultats: [ResultatRecent]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Résultats récents")
                .font(.headline)
                .padding(.horizontal)
            
            if resultats.isEmpty {
                CardEmptyState(
                    icon: "doc.text",
                    title: "Aucun résultat disponible",
                    color: .secondary
                )
            } else {
                ForEach(resultats.prefix(5), id: \.id) { resultat in
                    NavigationLink {
                        // TODO: Navigation vers détails résultats
                        EmptyView()
                    } label: {
                        ResultatRecentCard(resultat: resultat)
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal)
                }
            }
        }
    }
    
    // ── MARK: - Performance par Type Section ──
    
    @ViewBuilder
    private func performanceParTypeSection(performanceParType: [PerformanceType]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Performance par type")
                .font(.headline)
                .padding(.horizontal)
            
            if performanceParType.isEmpty {
                CardEmptyState(
                    icon: "chart.bar.fill",
                    title: "Pas encore assez de données",
                    color: .secondary
                )
            } else {
                ForEach(performanceParType.prefix(5), id: \.type) { perf in
                    PerformanceTypeCard(performance: perf)
                        .padding(.horizontal)
                }
            }
        }
    }
}

// ── MARK: - Stat Item ──

struct EtudiantStatItem: View {
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

// ── MARK: - Epreuve à Venir Card ──

struct EpreuveAVenirCard: View {
    let epreuve: EpreuveAVenirEtudiant
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
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
            }
            
            Divider()
            
            HStack {
                Text("Prof: \(epreuve.enseignant)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                
                Spacer()
                
                Text("\(epreuve.nbQuestions) questions · \(String(format: "%.0f", epreuve.totalPoints)) pts")
                    .font(.caption2)
                    .foregroundStyle(Color.sectBlue)
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 10))
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

// ── MARK: - Résultat Récent Card ──

struct ResultatRecentCard: View {
    let resultat: ResultatRecent
    
    var body: some View {
        HStack(spacing: 12) {
            // Score badge
            VStack(spacing: 2) {
                Text(String(format: "%.0f", resultat.score))
                    .font(.title3)
                    .fontWeight(.bold)
                    .foregroundStyle(scoreColor)
                Text("/20")
                    .font(.caption2)
                    .foregroundStyle(scoreColor)
            }
            .frame(width: 50, height: 50)
            .background(scoreColor.opacity(0.15))
            .clipShape(Circle())
            
            VStack(alignment: .leading, spacing: 4) {
                Text(resultat.titre)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .lineLimit(1)
                
                Text("Prof: \(resultat.enseignant)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                
                if let detail = resultat.resultat {
                    Text("\(String(format: "%.1f", detail.scoreFinal))/\(String(format: "%.1f", detail.totalPossible))")
                        .font(.caption2)
                        .foregroundStyle(Color.sectBlue)
                }
            }
            
            Spacer()
            
            Badge(text: resultat.statut, color: statutColor(resultat.statut))
        }
        .padding()
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
    
    private var scoreColor: Color {
        if resultat.score >= 15 { return .sectGreen }
        if resultat.score >= 10 { return .sectBlue }
        return .sectRed
    }
    
    private func statutColor(_ statut: String) -> Color {
        switch statut {
        case "REUSSI": return .sectGreen
        case "ECHEC": return .sectRed
        case "EN_ATTENTE": return .sectOrange
        default: return .gray
        }
    }
}

// ── MARK: - Performance Type Card ──

struct PerformanceTypeCard: View {
    let performance: PerformanceType
    
    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(performance.type)
                    .font(.subheadline)
                    .fontWeight(.medium)
                
                Text("\(performance.nbReponses) réponses")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            
            Spacer()
            
            Text(String(format: "%.1f/20", performance.moyenne))
                .font(.title3)
                .fontWeight(.bold)
                .foregroundStyle(Color.sectPurple)
        }
        .padding()
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

#Preview {
    NavigationStack {
        EtudiantDashboardView()
            .environmentObject(AuthViewModel())
    }
}
