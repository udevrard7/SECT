//
//  CorrectionsViewModel.swift
//  SECT
//
//  SECT-MOBILE-NAV-PHASE-B : miroir iOS de CorrectionsViewModel (Android).
//  Liste des copies à corriger pour l'enseignant via GET /api/correction.
//
import SwiftUI
import Shared

@MainActor
class CorrectionsViewModel: ObservableObject {
    @Published var sessions: [CorrectionSession] = []
    @Published var isLoading = false
    @Published var error: String? = nil

    private let repository = KoinRepositoryProvider.shared.repository

    func loadSessions() async {
        isLoading = true
        error = nil
        do {
            // getSessionsACorriger(epreuveId: nil) → l'enseignant connecté est
            // auto-identifié côté backend via son JWT (usecase force enseignantId).
            sessions = try await repository.getSessionsACorriger(epreuveId: nil)
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    /// Nombre de copies encore à corriger (réponses sans note).
    var pendingCount: Int {
        sessions.filter { !$0.allCorrected }.count
    }
}
