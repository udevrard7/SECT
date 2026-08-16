// SECT Mobile — iOS Epreuve ViewModel
import SwiftUI
import Shared

@MainActor
class EpreuveViewModel: ObservableObject {
    @Published var epreuves: [Epreuve] = []
    @Published var selectedEpreuve: Epreuve? = nil
    @Published var searchQuery: String = ""
    @Published var statutFilter: String? = nil
    @Published var currentPage: Int32 = 1
    @Published var totalItems: Int = 0
    @Published var isLoading = false
    @Published var isLoadingDetail = false
    @Published var error: String? = nil

    private let repository = KoinRepositoryProvider.shared.repository
    private let pageSize: Int32 = 20

    func loadEpreuves() async {
        isLoading = true
        error = nil
        do {
            let result = try await repository.listEpreuves(
                search: searchQuery.isEmpty ? nil : searchQuery,
                statut: statutFilter,
                filiereId: nil,
                page: Int32(currentPage),
                limit: Int32(pageSize)
            )
            epreuves = result
            totalItems = result.count
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    func loadDetail(id: String) async {
        isLoadingDetail = true
        error = nil
        do {
            selectedEpreuve = try await repository.getEpreuve(id: id)
        } catch {
            self.error = error.localizedDescription
        }
        isLoadingDetail = false
    }

    func search() async {
        currentPage = 1
        await loadEpreuves()
    }

    func filterByStatut(_ statut: String?) async {
        statutFilter = statut
        currentPage = 1
        await loadEpreuves()
    }

    func loadNextPage() async {
        currentPage += 1
        isLoading = true
        do {
            let result = try await repository.listEpreuves(
                search: searchQuery.isEmpty ? nil : searchQuery,
                statut: statutFilter,
                filiereId: nil,
                page: Int32(currentPage),
                limit: Int32(pageSize)
            )
            epreuves.append(contentsOf: result)
        } catch {
            self.error = error.localizedDescription
            currentPage -= 1
        }
        isLoading = false
    }

    var hasMorePages: Bool {
        return epreuves.count < totalItems
    }
}
