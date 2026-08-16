//
//  ResultatsView.swift
//  SECT
//
//  SECT-MOBILE-NAV-PHASE-C : liste des résultats de l'étudiant.
//  Miroir iOS de ResultatsScreen (Android).
//
//  NOTE : ne pas confondre avec ResultsView.swift (existant) qui affiche
//  le résultat d'UNE passation juste après soumission. Ce fichier liste
//  TOUS les résultats de l'étudiant (onglet "Résultats" de la bottom bar).
//
import SwiftUI
import Shared

struct ResultatsView: View {
    @EnvironmentObject var viewModel: ResultatsViewModel

    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                if viewModel.isLoading {
                    loadingView
                } else if let error = viewModel.error {
                    errorView(message: error)
                } else if viewModel.resultats.isEmpty {
                    emptyStateView
                } else {
                    resultatsList
                }
            }
            .navigationTitle("Mes Résultats")
            .task { await viewModel.loadResultats() }
        }
    }

    // MARK: - List

    private var resultatsList: some View {
        ScrollView {
            LazyVStack(spacing: 16) {
                // En-tête stats
                if let stats = viewModel.stats {
                    StatsHeader(stats: stats)
                } else if let moyenne = viewModel.moyenneCalculee {
                    StatsHeaderFallback(moyenne: moyenne, reussites: viewModel.reussites, total: viewModel.resultats.count)
                }

                // Cartes de résultats
                ForEach(viewModel.resultats, id: \.id) { resultat in
                    ResultatCard(resultat: resultat)
                }
            }
            .padding()
        }
        .refreshable { await viewModel.loadResultats() }
    }

    // MARK: - States

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView().scaleEffect(1.5)
            Text("Chargement des résultats...").foregroundColor(.gray)
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
                Task { await viewModel.loadResultats() }
            }
            .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var emptyStateView: some View {
        VStack(spacing: 16) {
            Image(systemName: "chart.bar")
                .font(.system(size: 50)).foregroundColor(.gray.opacity(0.5))
            Text("Aucun résultat disponible").font(.headline).foregroundColor(.gray)
            Text("Commencez par passer des épreuves pour voir vos résultats ici")
                .font(.subheadline).foregroundColor(.gray)
                .multilineTextAlignment(.center).padding(.horizontal)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Stats Header

struct StatsHeader: View {
    let stats: EtudiantStats

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Statistiques Générales")
                .font(.headline).fontWeight(.bold)

            HStack {
                StatItem(value: String(format: "%.1f", stats.moyenne),
                        label: "Moyenne",
                        color: .sectGreen)
                Divider().frame(height: 40)
                StatItem(value: "\(stats.nbEpreuvesTerminees)",
                        label: "Terminées",
                        color: .sectBlue)
                Divider().frame(height: 40)
                StatItem(value: String(format: "%.1f", stats.meilleureNote),
                        label: "Meilleure",
                        color: .sectOrange)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.sectGreen.opacity(0.1))
        .cornerRadius(12)
    }
}

struct StatsHeaderFallback: View {
    let moyenne: Double
    let reussites: Int
    let total: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Statistiques Générales")
                .font(.headline).fontWeight(.bold)

            HStack {
                StatItem(value: String(format: "%.1f", moyenne),
                        label: "Moyenne",
                        color: .sectGreen)
                Divider().frame(height: 40)
                StatItem(value: "\(total)",
                        label: "Épreuves",
                        color: .sectBlue)
                Divider().frame(height: 40)
                StatItem(value: "\(reussites)/\(total)",
                        label: "Réussite",
                        color: .sectOrange)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.sectGreen.opacity(0.1))
        .cornerRadius(12)
    }
}

struct StatItem: View {
    let value: String
    let label: String
    let color: Color

    var body: some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.title3).fontWeight(.bold)
                .foregroundColor(color)
            Text(label)
                .font(.caption).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Resultat Card

struct ResultatCard: View {
    let resultat: Resultat

    private var pourcentage: Double {
        min(100.0, max(0.0, resultat.score))
    }

    private var estReussi: Bool {
        pourcentage >= 50.0
    }

    private var scoreColor: Color {
        if pourcentage >= 80 { return .sectGreen }
        if pourcentage >= 60 { return .sectBlue }
        if pourcentage >= 50 { return .sectOrange }
        return .sectRed
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Én-tête : titre épreuve + badge réussite
            HStack {
                Text(resultat.epreuveNom)
                    .font(.headline).lineLimit(2)
                Spacer()
                Text(estReussi ? "Réussi" : "À refaire")
                    .font(.caption).fontWeight(.bold)
                    .padding(.horizontal, 10).padding(.vertical, 4)
                    .background(estReussi ? Color.sectGreen.opacity(0.2) : Color.sectRed.opacity(0.2))
                    .foregroundColor(estReussi ? .sectGreen : .sectRed)
                    .cornerRadius(8)
            }

            // Score + date
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Score: \(String(format: "%.1f", pourcentage / 5.0))/20")
                        .font(.body).fontWeight(.semibold)
                        .foregroundColor(scoreColor)
                    Text("\(Int(pourcentage))%")
                        .font(.caption).foregroundColor(scoreColor)
                }
                Spacer()
                Text(String(resultat.dateCompletion.prefix(10)))
                    .font(.caption).foregroundColor(.secondary)
            }

            // Barre de progression
            ProgressView(value: pourcentage, total: 100.0)
                .tint(scoreColor)
                .scaleEffect(x: 1, y: 1.5, anchor: .center)
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(12)
        .shadow(color: Color.black.opacity(0.05), radius: 4, x: 0, y: 2)
    }
}
