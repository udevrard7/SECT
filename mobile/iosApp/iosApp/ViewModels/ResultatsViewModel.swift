//
//  ResultatsViewModel.swift
//  SECT
//
//  SECT-MOBILE-NAV-PHASE-C : miroir iOS de ResultatsViewModel (Android).
//  Liste des résultats de l'étudiant connecté via GET /api/resultats.
//
import SwiftUI
import Shared

@MainActor
class ResultatsViewModel: ObservableObject {
    @Published var resultats: [Resultat] = []
    @Published var stats: EtudiantStats? = nil
    @Published var isLoading = false
    @Published var error: String? = nil

    private let repository = KoinRepositoryProvider.shared.repository

    func loadResultats() async {
        isLoading = true
        error = nil
        do {
            resultats = try await repository.getResultatsEtudiant()
            // Stats optionnelles (ne pas crasher si elles échouent)
            stats = try? await repository.getStatsEtudiant()
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    /// Moyenne calculée localement (fallback si stats indisponibles).
    var moyenneCalculee: Double? {
        guard !resultats.isEmpty else { return nil }
        let total = resultats.reduce(0.0) { $0 + $1.score }
        return total / Double(resultats.count)
    }

    /// Nombre de réussites (score >= 50%).
    var reussites: Int {
        resultats.filter { $0.score >= 50.0 }.count
    }
}
