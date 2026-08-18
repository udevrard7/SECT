//
//  DevoirsView.swift
//  SECT
//
//  SECT-MOBILE-NAV-PHASE-B : miroir iOS de DevoirsScreen (Android).
//  Liste des devoirs avec pagination + création (enseignant).
//
import SwiftUI
import Shared

struct DevoirsView: View {
    @EnvironmentObject var viewModel: DevoirsViewModel
    @EnvironmentObject var authViewModel: AuthViewModel

    private var isEnseignant: Bool {
        authViewModel.currentUser?.role == .enseignant
    }

    var body: some View {
        VStack(spacing: 0) {
            DevoirsHeader(isEnseignant: isEnseignant)

            if viewModel.isLoading {
                loadingView
            } else if let error = viewModel.error {
                errorView(message: error)
            } else if viewModel.devoirs.isEmpty {
                emptyStateView
            } else {
                devoirsList
            }
        }
        .task { await viewModel.loadDevoirs(refresh: true) }
    }

    // MARK: - Header

    private func DevoirsHeader(isEnseignant: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("Devoirs")
                    .font(.title2).fontWeight(.bold)
                Spacer()
                if isEnseignant {
                    Button(action: { /* TODO: create devoir */ }) {
                        Image(systemName: "plus.circle.fill")
                            .font(.title2)
                            .foregroundColor(.sectGreen)
                    }
                }
            }
            Text(isEnseignant ? "Gérez les devoirs de vos étudiants"
                              : "Consultez et soumettez vos devoirs")
                .font(.subheadline).foregroundColor(.secondary)
        }
        .padding().background(Color(.systemBackground))
    }

    // MARK: - List

    private var devoirsList: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(viewModel.devoirs, id: \.id) { devoir in
                    NavigationLink(destination: DevoirDetailView(devoirId: devoir.id)) {
                        DevoirCard(devoir: devoir)
                    }
                    .buttonStyle(PlainButtonStyle())
                }
                if viewModel.isLoadingMore {
                    ProgressView().padding()
                }
                if viewModel.hasMorePages {
                    Button("Charger plus") {
                        Task { await viewModel.loadMore() }
                    }
                    .padding()
                }
            }
            .padding()
        }
        .refreshable { await viewModel.loadDevoirs(refresh: true) }
    }

    // MARK: - States

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView().scaleEffect(1.5)
            Text("Chargement des devoirs...").foregroundColor(.gray)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func errorView(message: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 40)).foregroundColor(.sectOrange)
            Text("Erreur").font(.headline)
            Text(message).font(.subheadline).foregroundColor(.gray)
                .multilineTextAlignment(.center).padding(.horizontal)
            Button("Réessayer") {
                Task { await viewModel.loadDevoirs(refresh: true) }
            }
            .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var emptyStateView: some View {
        VStack(spacing: 16) {
            Image(systemName: "doc.text")
                .font(.system(size: 50)).foregroundColor(.gray.opacity(0.5))
            Text("Aucun devoir").font(.headline).foregroundColor(.gray)
            Text("Les devoirs apparaîtront ici")
                .font(.subheadline).foregroundColor(.gray)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Devoir Card

struct DevoirCard: View {
    let devoir: Devoir

    private var isLate: Bool {
        let dateStr = String(devoir.dateLimite.prefix(10))
        guard let date = ISO8601DateFormatter().date(from: dateStr) else { return false }
        return date < Date()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(devoir.titre)
                .font(.headline).lineLimit(2)

            // description est un mot-clé Swift (NSObject.description) — accès direct
            if !devoir.description.isEmpty {
                Text(devoir.description).font(.subheadline).foregroundColor(.secondary).lineLimit(2)
            }

            HStack(spacing: 16) {
                Label {
                    Text("Échéance: \(String(devoir.dateLimite.prefix(10)))")
                } icon: {
                    Image(systemName: "calendar")
                }
                .font(.caption)
                .foregroundColor(isLate ? .sectRed : .secondary)

                Label {
                    Text("\(devoir.pointsMax) points")
                } icon: {
                    Image(systemName: "star")
                }
                .font(.caption).foregroundColor(.secondary)
            }

            if let auteur = devoir.auteur {
                Text("Par \(auteur.prenom) \(auteur.nom)")
                    .font(.caption).foregroundColor(.secondary)
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(12)
        .shadow(color: Color.black.opacity(0.05), radius: 4, x: 0, y: 2)
    }
}
