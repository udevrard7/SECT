//
//  CorrectionDetailView.swift
//  SECT
//
//  SECT-MOBILE-NAV-PHASE-B : miroir iOS de CorrectionDetailScreen (Android).
//  Notation question par question + finalize + retourner.
//
import SwiftUI
import Shared

struct CorrectionDetailView: View {
    let session: CorrectionSession

    @StateObject private var viewModel = CorrectionDetailViewModel()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Group {
            if let session = viewModel.session {
                correctionContent(session: session)
            } else {
                ProgressView("Chargement...")
                    .onAppear { viewModel.configure(session: session) }
            }
        }
        .navigationTitle("Correction")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { viewModel.configure(session: session) }
    }

    // MARK: - Content

    @ViewBuilder
    private func correctionContent(session: CorrectionSession) -> some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(spacing: 16) {
                    // En-tête
                    CorrectionHeaderCard(session: session)

                    // Erreurs
                    if let error = viewModel.saveError {
                        ErrorBanner(message: error, onRetry: {})
                    }
                    if let error = viewModel.processError {
                        ErrorBanner(message: error, onRetry: {})
                    }

                    // Réponses à corriger
                    ForEach(session.reponses, id: \.id) { reponse in
                        ReponseCorrectionCard(
                            reponse: reponse,
                            isSaving: viewModel.isSaving,
                            lastSavedQuestionId: viewModel.lastSavedQuestionId,
                            onSave: { score, commentaire in
                                Task {
                                    await viewModel.saveGrade(
                                        questionId: reponse.questionId,
                                        score: score,
                                        commentaire: commentaire
                                    )
                                }
                            }
                        )
                    }
                }
                .padding()
            }

            // Bottom bar : Finaliser + Retourner
            CorrectionBottomActionBar(
                session: session,
                isProcessing: viewModel.isProcessing,
                onFinalize: { Task { await viewModel.finalize() } },
                onRetourner: {
                    Task {
                        let success = await viewModel.retourner()
                        if success { dismiss() }
                    }
                }
            )
        }
    }
}

// MARK: - Header Card

struct CorrectionHeaderCard: View {
    let session: CorrectionSession

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(session.etudiantNom.isEmpty ? "Étudiant" : session.etudiantNom)
                .font(.title3).fontWeight(.bold)
            Text(session.epreuveTitre)
                .font(.subheadline).foregroundColor(.secondary)

            HStack(spacing: 12) {
                InfoChip(label: "Statut", value: session.statut)
                InfoChip(label: "À corriger", value: "\(session.needsCorrectionCount)")
                if session.alertes > 0 {
                    InfoChip(label: "Alertes", value: "\(session.alertes)")
                }
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.sectGreen.opacity(0.1))
        .cornerRadius(12)
    }
}

struct InfoChip: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption2).foregroundColor(.secondary)
            Text(value).font(.caption).fontWeight(.semibold)
        }
        .padding(.horizontal, 10).padding(.vertical, 4)
        .background(Color(.systemBackground))
        .cornerRadius(6)
    }
}

// MARK: - Reponse Card (notation)

struct ReponseCorrectionCard: View {
    let reponse: CorrectionReponse
    let isSaving: Bool
    let lastSavedQuestionId: String?
    let onSave: (Double?, String?) -> Void

    @State private var scoreText: String = ""
    @State private var commentaire: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Question header
            HStack {
                Text("Question \(reponse.ordre)")
                    .font(.headline)
                Spacer()
                Text("/ \(String(format: "%.0f", reponse.bareme)) pts")
                    .font(.caption).foregroundColor(.secondary)
            }

            if let type = reponse.type {
                Text(type).font(.caption).foregroundColor(.secondary)
            }

            // Énoncé
            if let enonce = reponse.enonce, !enonce.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Énoncé").font(.caption).foregroundColor(.secondary)
                    Text(enonce).font(.body)
                }
            }

            // Réponse de l'étudiant
            VStack(alignment: .leading, spacing: 4) {
                Text("Réponse de l'étudiant").font(.caption).foregroundColor(.secondary)
                Text(reponse.contenu ?? "(aucune réponse)")
                    .font(.body)
                    .padding(8)
                    .background(Color(.systemGray6))
                    .cornerRadius(8)
            }

            // Suggestion IA
            if let noteIA = reponse.noteIA {
                IASuggestionCard(
                    noteIA: noteIA.doubleValue,
                    bareme: reponse.bareme,
                    justification: reponse.justificationIA,
                    onApply: { scoreText = String(format: "%.1f", noteIA.doubleValue) }
                )
            }

            // Saisie du score
            HStack {
                Text("Note:").font(.subheadline)
                TextField("Sur \(String(format: "%.0f", reponse.bareme))", text: $scoreText)
                    .keyboardType(.decimalPad)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 100)
                Spacer()
            }

            // Saisie du commentaire
            VStack(alignment: .leading, spacing: 4) {
                Text("Commentaire (optionnel)").font(.caption).foregroundColor(.secondary)
                TextField("Commentaire...", text: $commentaire, axis: .vertical)
                    .lineLimit(2...4)
                    .textFieldStyle(.roundedBorder)
            }

            // Bouton Enregistrer
            HStack {
                if lastSavedQuestionId == reponse.questionId {
                    Label("Enregistré", systemImage: "checkmark.circle.fill")
                        .font(.caption).foregroundColor(.sectGreen)
                }
                Spacer()
                Button {
                    let score = scoreText.isEmpty ? nil : Double(scoreText)
                    let comm = commentaire.trimmingCharacters(in: .whitespacesAndNewlines)
                    onSave(score, comm.isEmpty ? nil : comm)
                } label: {
                    if isSaving {
                        ProgressView().frame(width: 16, height: 16)
                    } else {
                        Text("Enregistrer")
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(isSaving)
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(12)
        .shadow(color: Color.black.opacity(0.05), radius: 2, x: 0, y: 1)
        .onAppear {
            // Pré-remplir avec le score existant
            if let score = reponse.score {
                scoreText = String(format: "%.1f", score.doubleValue)
            }
            if let comm = reponse.commentaire {
                commentaire = comm
            }
        }
    }
}

// MARK: - IA Suggestion Card

struct IASuggestionCard: View {
    let noteIA: Double
    let bareme: Double
    let justification: String?
    let onApply: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "sparkles")
                    .foregroundColor(.sectPurple)
                Text("Suggestion IA").font(.caption).fontWeight(.bold)
                    .foregroundColor(.sectPurple)
                Spacer()
                Text("\(String(format: "%.1f", noteIA))/\(String(format: "%.0f", bareme))")
                    .font(.caption).fontWeight(.bold)
                    .foregroundColor(.sectPurple)
            }
            if let justif = justification, !justif.isEmpty {
                Text(justif).font(.caption).foregroundColor(.secondary)
            }
            Button("Appliquer la suggestion", action: onApply)
                .font(.caption)
        }
        .padding(12)
        .background(Color.sectPurple.opacity(0.1))
        .cornerRadius(8)
    }
}

// MARK: - Bottom Action Bar

struct CorrectionBottomActionBar: View {
    let session: CorrectionSession
    let isProcessing: Bool
    let onFinalize: () -> Void
    let onRetourner: () -> Void

    var body: some View {
        HStack {
            if let score = session.score {
                Text("Score: \(String(format: "%.1f", score.doubleValue))")
                    .font(.subheadline).fontWeight(.bold)
            }
            Spacer()

            if session.statut != "RETOURNEE" {
                if session.statut == "SOUMISE" {
                    Button(action: onFinalize) {
                        if isProcessing { ProgressView() } else {
                            Label("Finaliser", systemImage: "checkmark.circle")
                        }
                    }
                    .buttonStyle(.bordered)
                    .disabled(isProcessing)
                }

                let canRetourner = session.statut == "CORRIGEE" || session.allCorrected
                Button(action: onRetourner) {
                    if isProcessing { ProgressView() } else {
                        Label("Retourner", systemImage: "paperplane")
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(isProcessing || !canRetourner)
            } else {
                Text("Copie retournée à l'étudiant")
                    .font(.caption).foregroundColor(.sectGreen).fontWeight(.bold)
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .shadow(color: Color.black.opacity(0.1), radius: 2, x: 0, y: -1)
    }
}
