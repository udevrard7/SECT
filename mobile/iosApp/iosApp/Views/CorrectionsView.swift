//
//  CorrectionsView.swift
//  SECT
//
//  SECT-MOBILE-NAV-PHASE-B : miroir iOS de CorrectionsScreen (Android).
//  Liste des copies à corriger pour l'enseignant.
//
import SwiftUI
import Shared

struct CorrectionsView: View {
    @EnvironmentObject var viewModel: CorrectionsViewModel

    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                CorrectionsSummary(pending: viewModel.pendingCount)

                if viewModel.isLoading {
                    loadingView
                } else if let error = viewModel.error {
                    errorView(message: error)
                } else if viewModel.sessions.isEmpty {
                    emptyStateView
                } else {
                    sessionsList
                }
            }
            .navigationTitle("Corrections")
            .task { await viewModel.loadSessions() }
        }
    }

    // MARK: - Summary

    private func CorrectionsSummary(pending: Int) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("Copies en attente").font(.headline)
                Text("\(pending) session(s) à corriger")
                    .font(.subheadline).foregroundColor(.secondary)
            }
            Spacer()
            Image(systemName: "checkmark.square")
                .font(.system(size: 32)).foregroundColor(.sectOrange)
        }
        .padding()
        .background(Color.sectOrange.opacity(0.1))
    }

    // MARK: - List

    private var sessionsList: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(viewModel.sessions, id: \.id) { session in
                    NavigationLink(destination: CorrectionDetailView(session: session)) {
                        SessionCorrectionCard(session: session)
                    }
                    .buttonStyle(PlainButtonStyle())
                }
            }
            .padding()
        }
        .refreshable { await viewModel.loadSessions() }
    }

    // MARK: - States

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView().scaleEffect(1.5)
            Text("Chargement des copies...").foregroundColor(.gray)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func errorView(message: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 40)).foregroundColor(.sectOrange)
            Text("Erreur de chargement").font(.headline)
            Text(message).font(.subheadline).foregroundColor(.gray)
                .multilineTextAlignment(.center).padding(.horizontal)
            Button("Réessayer") {
                Task { await viewModel.loadSessions() }
            }
            .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var emptyStateView: some View {
        VStack(spacing: 16) {
            Image(systemName: "checkmark.circle")
                .font(.system(size: 50)).foregroundColor(.gray.opacity(0.5))
            Text("Aucune copie à corriger").font(.headline).foregroundColor(.gray)
            Text("Toutes les soumissions ont été évaluées")
                .font(.subheadline).foregroundColor(.gray)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Session Correction Card

struct SessionCorrectionCard: View {
    let session: CorrectionSession

    private var badgeText: String {
        switch session.statut {
        case "SOUMISE": return "À corriger"
        case "CORRIGEE": return "Corrigé"
        case "RETOURNEE": return "Retourné"
        default: return session.statut
        }
    }

    private var badgeColor: Color {
        switch session.statut {
        case "SOUMISE": return .sectOrange
        case "CORRIGEE": return .sectGreen
        case "RETOURNEE": return .sectBlue
        default: return .gray
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Étudiant + statut
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(session.etudiantNom.isEmpty ? "Étudiant" : session.etudiantNom)
                        .font(.headline)
                    Text(session.epreuveTitre.isEmpty ? "Épreuve" : session.epreuveTitre)
                        .font(.subheadline).foregroundColor(.secondary).lineLimit(1)
                }
                Spacer()
                Text(badgeText)
                    .font(.caption).fontWeight(.bold)
                    .padding(.horizontal, 10).padding(.vertical, 4)
                    .background(badgeColor.opacity(0.2))
                    .foregroundColor(badgeColor)
                    .cornerRadius(8)
            }

            // Indicateurs
            HStack(spacing: 16) {
                if session.needsCorrectionCount > 0 {
                    Label {
                        Text("\(session.needsCorrectionCount) à corriger")
                    } icon: {
                        Image(systemName: "pencil")
                    }
                    .font(.caption).foregroundColor(.sectOrange)
                } else {
                    Label {
                        Text("Tout corrigé")
                    } icon: {
                        Image(systemName: "checkmark.circle")
                    }
                    .font(.caption).foregroundColor(.sectGreen)
                }

                if session.alertes > 0 {
                    Label {
                        Text("\(session.alertes) alerte(s)")
                    } icon: {
                        Image(systemName: "warning")
                    }
                    .font(.caption).foregroundColor(.sectRed)
                }

                Spacer()

                if let score = session.score {
                    Text("Score: \(String(format: "%.1f", score.doubleValue))")
                        .font(.caption).fontWeight(.semibold)
                        .foregroundColor(.sectGreen)
                }
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(12)
        .shadow(color: Color.black.opacity(0.05), radius: 4, x: 0, y: 2)
    }
}
