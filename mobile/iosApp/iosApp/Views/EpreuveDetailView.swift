// SECT Mobile — iOS Epreuve Detail View (SwiftUI)
import SwiftUI
import Shared

struct EpreuveDetailView: View {
    @StateObject var viewModel = EpreuveViewModel()
    @EnvironmentObject var authVM: AuthViewModel
    let epreuveId: String

    @State private var showPassation = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if viewModel.isLoadingDetail {
                    ProgressView("Chargement…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let epreuve = viewModel.selectedEpreuve {
                    // ── Titre ──
                    VStack(alignment: .leading, spacing: 8) {
                        Text(epreuve.titre)
                            .font(.title2)
                            .fontWeight(.bold)

                        HStack(spacing: 12) {
                            StatutBadge(statut: epreuve.statut.name)
                            Text("•")
                                .foregroundStyle(.secondary)
                            Text("\(epreuve.duree) min")
                                .foregroundStyle(.secondary)
                        }
                        .font(.subheadline)
                    }
                    .padding(.horizontal)

                    // ── Description ──
                    let desc = epreuve.description ?? ""
                    if !desc.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Description")
                                .font(.headline)
                            Text(desc)
                                .font(.body)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.horizontal)
                    }

                    // ── Info Cards ──
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                        InfoCard(title: "Questions", value: "\(epreuve.questionCount ?? 0)", icon: "list.number")
                        InfoCard(title: "Points", value: String(format: "%.1f", epreuve.totalPoints ?? 0), icon: "star.fill")
                        InfoCard(title: "Session", value: epreuve.sessionExamen.name, icon: "calendar")
                        InfoCard(title: "Niveau", value: epreuve.niveau ?? "—", icon: "graduationcap")
                    }
                    .padding(.horizontal)

                    // ── Dates ──
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Planification")
                            .font(.headline)
                        HStack {
                            Image(systemName: "clock")
                                .foregroundStyle(.sectGreen)
                            Text("Début : \(formatString(epreuve.dateDebut))")
                        }
                        HStack {
                            Image(systemName: "clock.badge.checkmark")
                                .foregroundStyle(.sectBlue)
                            Text("Fin : \(formatString(epreuve.dateFin))")
                        }
                    }
                    .font(.subheadline)
                    .padding(.horizontal)

                    // ── Enseignant ──
                    if let enseignant = epreuve.enseignant {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Enseignant")
                                .font(.headline)
                            HStack(spacing: 12) {
                                Image(systemName: "person.circle.fill")
                                    .font(.title2)
                                    .foregroundStyle(.sectGreen)
                                VStack(alignment: .leading) {
                                    Text(enseignant.name)
                                        .fontWeight(.medium)
                                    Text(enseignant.email)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                        .padding(.horizontal)
                    }

                    // ── Options ──
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Options")
                            .font(.headline)
                        OptionRow(label: "Mélange des questions", value: epreuve.melangeQuestions)
                        OptionRow(label: "Mélange des propositions", value: epreuve.melangePropositions)
                        OptionRow(label: "Blocage retour", value: epreuve.blocageRetour)
                        OptionRow(label: "Proctoring", value: epreuve.proctoringActif)
                    }
                    .padding(.horizontal)

                    // ── Start Button ──
                    if canStartEpreuve(epreuve) {
                        Button {
                            showPassation = true
                        } label: {
                            HStack {
                                Image(systemName: "play.fill")
                                Text("Commencer l'épreuve")
                                    .fontWeight(.semibold)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(Color.sectGreen)
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                        .padding(.horizontal)
                        .padding(.top, 8)
                    }
                } else if let error = viewModel.error {
                    ErrorBanner(message: error) {
                        Task { await viewModel.loadDetail(id: epreuveId) }
                    }
                }
            }
            .padding(.vertical)
        }
        .navigationTitle("Détail")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(isPresented: $showPassation) {
            PassationView(epreuveId: epreuveId)
        }
        .task {
            await viewModel.loadDetail(id: epreuveId)
        }
    }

    // ── Helpers ──

    private func canStartEpreuve(_ epreuve: Epreuve) -> Bool {
        let statut = epreuve.statut.name
        return statut == "EN_COURS" || statut == "PLANIFIEE"
    }

    private func formatString(_ instant: String) -> String {
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = isoFormatter.date(from: instant) ?? Date()
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        formatter.locale = Locale(identifier: "fr_FR")
        return formatter.string(from: date)
    }
}

// ── Sub-Views ──

struct StatutBadge: View {
    let statut: String
    var body: some View {
        Text(statut)
            .font(.caption)
            .fontWeight(.semibold)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(colorForStatut(statut).opacity(0.15))
            .foregroundStyle(colorForStatut(statut))
            .clipShape(Capsule())
    }
    private func colorForStatut(_ s: String) -> Color {
        switch s {
        case "EN_COURS": return .sectGreen
        case "PLANIFIEE": return .sectBlue
        case "TERMINEE": return .sectOrange
        case "CLOTUREE": return .sectRed
        default: return .gray
        }
    }
}

struct InfoCard: View {
    let title: String
    let value: String
    let icon: String
    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(.sectGreen)
            Text(value)
                .font(.headline)
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

struct OptionRow: View {
    let label: String
    let value: Bool
    var body: some View {
        HStack {
            Text(label)
            Spacer()
            Image(systemName: value ? "checkmark.circle.fill" : "xmark.circle")
                .foregroundStyle(value ? .sectGreen : .gray)
        }
        .font(.subheadline)
    }
}
