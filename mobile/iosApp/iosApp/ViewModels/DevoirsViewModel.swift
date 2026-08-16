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
}
