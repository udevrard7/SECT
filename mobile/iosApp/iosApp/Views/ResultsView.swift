// SECT Mobile — iOS Results View (SwiftUI)
import SwiftUI
import Shared

struct ResultsView: View {
    let session: SessionPassation?

    @State private var showDetail = false

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                if let session = session {
                    // ── Score Card ──
                    scoreCard(session: session)

                    // ── Session Info ──
                    sessionInfoCard(session: session)

                    // ── Per-Question Detail ──
                    if let reponses = session.reponses, !reponses.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Détail par question")
                                .font(.headline)
                                .padding(.horizontal)

                            ForEach(reponses, id: \.id) { reponse in
                                ReponseRow(reponse: reponse)
                            }
                        }
                    }
                } else {
                    ContentUnavailableView(
                        "Aucun résultat",
                        systemImage: "chart.bar",
                        description: Text("Les résultats seront disponibles après la correction.")
                    )
                }
            }
            .padding(.vertical)
        }
        .navigationTitle("Résultats")
        .navigationBarTitleDisplayMode(.inline)
    }

    // ── Score Card ──

    @ViewBuilder
    private func scoreCard(session: SessionPassation) -> some View {
        VStack(spacing: 12) {
            Text("Note obtenue")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            if let note = session.note {
                let penalite = session.penaliteProctoring?.doubleValue ?? 0.0
                let noteFinale = max(0.0, note.doubleValue - penalite)

                ZStack {
                    Circle()
                        .stroke(Color(.systemGray5), lineWidth: 10)
                        .frame(width: 140, height: 140)
                    Circle()
                        .trim(from: 0, to: min(1.0, noteFinale / 20.0))
                        .stroke(scoreColor(noteFinale), style: StrokeStyle(lineWidth: 10, lineCap: .round))
                        .frame(width: 140, height: 140)
                        .rotationEffect(.degrees(-90))
                    VStack(spacing: 2) {
                        Text(String(format: "%.1f", noteFinale))
                            .font(.system(size: 36, weight: .bold, design: .rounded))
                        Text("/ 20")
                            .font(.headline)
                            .foregroundStyle(.secondary)
                    }
                }

                if penalite > 0 {
                    HStack(spacing: 4) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(.sectOrange)
                        Text("Pénalité proctoring : -\(String(format: "%.1f", penalite)) pts")
                            .font(.caption)
                            .foregroundStyle(.sectOrange)
                    }
                }
            } else {
                VStack(spacing: 8) {
                    Image(systemName: "hourglass")
                        .font(.largeTitle)
                        .foregroundStyle(.sectBlue)
                    Text("En attente de correction")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .frame(height: 140)
            }
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal)
    }

    // ── Session Info ──

    @ViewBuilder
    private func sessionInfoCard(session: SessionPassation) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Informations")
                .font(.headline)

            HStack {
                Label("Statut", systemImage: "info.circle")
                Spacer()
                Text(session.statut.name)
                    .foregroundStyle(.secondary)
            }

            if let debut = session.dateDebut {
                HStack {
                    Label("Début", systemImage: "clock")
                    Spacer()
                    Text(formatString(debut))
                        .foregroundStyle(.secondary)
                }
            }

            if let soumission = session.dateSoumission {
                HStack {
                    Label("Soumission", systemImage: "checkmark.circle")
                    Spacer()
                    Text(formatString(soumission))
                        .foregroundStyle(.secondary)
                }
            }

            if session.proctoringAlerts > 0 {
                HStack {
                    Label("Alertes proctoring", systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.sectOrange)
                    Spacer()
                    Text("\(session.proctoringAlerts)")
                        .foregroundStyle(.sectOrange)
                }
            }
        }
        .font(.subheadline)
        .padding()
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal)
    }

    // ── Helpers ──

    private func scoreColor(_ note: Double) -> Color {
        if note >= 10 { return .sectGreen }
        if note >= 8 { return .sectOrange }
        return .sectRed
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

// ── Réponse Row ──

struct ReponseRow: View {
    let reponse: Reponse

    var body: some View {
        HStack(spacing: 12) {
            // Score circle
            ZStack {
                Circle()
                    .fill(noteColor.opacity(0.15))
                if let note = reponse.note {
                    Text(String(format: "%.1f", note))
                        .font(.caption)
                        .fontWeight(.bold)
                        .foregroundStyle(noteColor)
                } else {
                    Image(systemName: "questionmark")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(width: 36, height: 36)

            VStack(alignment: .leading, spacing: 2) {
                Text("Question \(reponse.questionId)")
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .lineLimit(1)

                if let contenu = reponse.contenu, !contenu.isEmpty {
                    Text(contenu)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }

                if let feedback = reponse.feedbackAi, !feedback.isEmpty {
                    HStack(spacing: 4) {
                        Image(systemName: "sparkles")
                            .foregroundStyle(.sectPurple)
                        Text(feedback)
                            .foregroundStyle(.sectPurple)
                    }
                    .font(.caption)
                    .lineLimit(2)
                }
            }

            Spacer()

            if let noteAi = reponse.noteAi {
                Text("IA: \(String(format: "%.1f", noteAi))")
                    .font(.caption2)
                    .foregroundStyle(.sectPurple)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 6)
    }

    private var noteColor: Color {
        guard let note = reponse.note else { return .gray }
        if note.doubleValue >= (reponse.note?.doubleValue ?? 0) / 2.0 { return .sectGreen }
        return .sectRed
    }
}
