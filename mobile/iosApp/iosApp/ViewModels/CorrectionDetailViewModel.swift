//
//  CorrectionDetailViewModel.swift
//  SECT
//
//  SECT-MOBILE-NAV-PHASE-B : miroir iOS de CorrectionDetailViewModel (Android).
//  Gère la notation question par question + finalize + retourner.
//
//  Contrairement à Android (qui utilise CorrectionSessionHolder singleton),
//  iOS passe la CorrectionSession directement au ViewModel via `configure(session:)`.
//  C'est plus idiomatique SwiftUI (pas d'état global partagé).
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

    private let repository = KoinRepositoryProvider.shared.repository

    /// Initialise le VM avec la session sélectionnée (depuis la liste).
    func configure(session: CorrectionSession) {
        self.session = session
    }

    /// Sauve la note d'une question (PATCH /api/correction/{sessionId}/ai-grade).
    /// Met à jour la session localement pour un feedback immédiat.
    func saveGrade(questionId: String, score: Double?, commentaire: String?) async {
        guard let current = session else { return }
        isSaving = true
        saveError = nil
        do {
            // Kotlin Double? → KotlinDouble? en Swift
            let scoreKotlin: KotlinDouble? = score.map { KotlinDouble(double: $0) }
            try await repository.saveGrade(
                sessionId: current.id,
                questionId: questionId,
                score: scoreKotlin,
                commentaire: commentaire
            )
            // Update locale de la réponse
            let updatedReponses = current.reponses.map { r -> CorrectionReponse in
                if r.questionId == questionId {
                    return r.copy(score: scoreKotlin, commentaire: commentaire)
                }
                return r
            }
            let allCorrected = updatedReponses.allSatisfy { $0.score != nil }
            session = current.copy(
                reponses: updatedReponses,
                allCorrected: allCorrected,
                needsCorrectionCount: updatedReponses.filter { $0.score == nil }.count
            )
            lastSavedQuestionId = questionId
        } catch {
            self.saveError = error.localizedDescription
        }
        isSaving = false
    }

    /// Finalise la correction (PATCH .../ai-grade { finalizeAll: true }).
    func finalize() async {
        guard let current = session else { return }
        isProcessing = true
        processError = nil
        do {
            try await repository.finalizeCorrectionSession(sessionId: current.id)
            session = current.copy(statut: "CORRIGEE")
        } catch {
            self.processError = error.localizedDescription
        }
        isProcessing = false
    }

    /// Retourne la copie à l'étudiant (POST .../retourner).
    func retourner() async -> Bool {
        guard let current = session else { return false }
        isProcessing = true
        processError = nil
        do {
            try await repository.retournerCorrectionSession(sessionId: current.id)
            session = current.copy(statut: "RETOURNEE")
            isProcessing = false
            return true
        } catch {
            self.processError = error.localizedDescription
            isProcessing = false
            return false
        }
    }
}
