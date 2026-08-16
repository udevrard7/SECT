//
//  CorrectionDetailViewModel.swift
//  SECT
//
//  SECT-MOBILE-NAV-PHASE-B : miroir iOS de CorrectionDetailViewModel (Android).
//  Gère la notation question par question + finalize + retourner.
//
//  NOTE : KMP data class copy() ne préserve pas les default args en Swift.
//  Au lieu de copy(), on utilise un statut local simple (statutLocal + lastSavedQuestionId)
//  pour le feedback UI. La session originale reste immuable.
//
import SwiftUI
import Shared

@MainActor
class CorrectionDetailViewModel: ObservableObject {
    @Published var session: CorrectionSession? = nil
    @Published var isSaving = false
    @Published var isProcessing = false
    @Published var saveError: String? = nil
    @Published var processError: String? = nil
    @Published var lastSavedQuestionId: String? = nil
    /// Statut local mis à jour après finalize/retourner ( évite copy() )
    @Published var statutLocal: String? = nil

    private let repository = KoinRepositoryProvider.shared.repository

    /// Initialise le VM avec la session sélectionnée (depuis la liste).
    func configure(session: CorrectionSession) {
        self.session = session
        self.statutLocal = session.statut
    }

    /// Statut effectif (local si mis à jour, sinon original).
    var effectiveStatut: String {
        statutLocal ?? session?.statut ?? ""
    }

    /// Sauve la note d'une question (PATCH /api/correction/{sessionId}/ai-grade).
    func saveGrade(questionId: String, score: Double?, commentaire: String?) async {
        guard let current = session else { return }
        isSaving = true
        saveError = nil
        do {
            let scoreKotlin: KotlinDouble? = score.map { KotlinDouble(double: $0) }
            try await repository.saveGrade(
                sessionId: current.id,
                questionId: questionId,
                score: scoreKotlin,
                commentaire: commentaire
            )
            lastSavedQuestionId = questionId
        } catch {
            self.saveError = error.localizedDescription
        }
        isSaving = false
    }

    /// Finalise la correction (PATCH .../ai-grade { finalizeAll: true }).
    func finalize() async {
        guard session != nil else { return }
        isProcessing = true
        processError = nil
        do {
            try await repository.finalizeCorrectionSession(sessionId: session!.id)
            statutLocal = "CORRIGEE"
        } catch {
            self.processError = error.localizedDescription
        }
        isProcessing = false
    }

    /// Retourne la copie à l'étudiant (POST .../retourner).
    func retourner() async -> Bool {
        guard session != nil else { return false }
        isProcessing = true
        processError = nil
        do {
            try await repository.retournerCorrectionSession(sessionId: session!.id)
            statutLocal = "RETOURNEE"
            isProcessing = false
            return true
        } catch {
            self.processError = error.localizedDescription
            isProcessing = false
            return false
        }
    }
}
