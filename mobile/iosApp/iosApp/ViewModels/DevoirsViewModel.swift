//
//  DevoirsViewModel.swift
//  SECT
//
//  SECT-MOBILE-NAV-PHASE-B : miroir iOS de DevoirsViewModel (Android).
//  Liste les devoirs avec pagination (étudiant) + création (enseignant).
//
import SwiftUI
import Shared

@MainActor
class DevoirsViewModel: ObservableObject {
    @Published var devoirs: [Devoir] = []
    @Published var isLoading = false
    @Published var isLoadingMore = false
    @Published var error: String? = nil

    // SECT-MOBILE-PARITY-T1 : état de création
    @Published var isCreating = false
    @Published var createError: String? = nil
    @Published var createdDevoir: Devoir? = nil

    private let repository = KoinRepositoryProvider.shared.repository
    private var currentPage: Int32 = 1
    private let pageSize: Int32 = 20

    var hasMorePages: Bool {
        // Si la dernière page a ramené pageSize items, il y a probablement plus
        return devoirs.count >= Int(currentPage * pageSize)
    }

    func loadDevoirs(refresh: Bool = false) async {
        if refresh {
            currentPage = 1
        }
        isLoading = true
        error = nil
        do {
            let result = try await repository.listDevoirs(
                search: nil,
                statut: nil,
                page: currentPage,
                limit: pageSize
            )
            if refresh || currentPage == 1 {
                devoirs = result
            } else {
                devoirs.append(contentsOf: result)
            }
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    func loadMore() async {
        guard hasMorePages, !isLoadingMore else { return }
        isLoadingMore = true
        currentPage += 1
        do {
            let result = try await repository.listDevoirs(
                search: nil,
                statut: nil,
                page: currentPage,
                limit: pageSize
            )
            devoirs.append(contentsOf: result)
        } catch {
            self.error = error.localizedDescription
            currentPage -= 1
        }
        isLoadingMore = false
    }

    // MARK: - SECT-MOBILE-PARITY-T1 : Création de devoir (enseignant)

    /// Crée un devoir via repository.createDevoir(input:).
    /// Retourne true si succès, false si erreur (createError est alors rempli).
    func createDevoir(_ input: CreateDevoirInput) async -> Bool {
        isCreating = true
        createError = nil
        createdDevoir = nil
        do {
            let created = try await repository.createDevoir(input: input)
            createdDevoir = created
            // Rafraîchir la liste
            await loadDevoirs(refresh: true)
            isCreating = false
            return true
        } catch {
            createError = error.localizedDescription
            isCreating = false
            return false
        }
    }

    /// Remet l'état de création à zéro (à appeler quand on quitte le form).
    func resetCreateState() {
        createdDevoir = nil
        createError = nil
        isCreating = false
    }
}
