// SECT Mobile — iOS Dashboard ViewModel
import SwiftUI
import Shared

@MainActor
class DashboardViewModel: ObservableObject {
    @Published var user: User? = nil
    @Published var upcomingEpreuves: [Epreuve] = []
    @Published var totalEpreuves: Int = 0
    @Published var enCours: Int = 0
    @Published var planifiees: Int = 0
    @Published var isLoading = false
    @Published var error: String? = nil

    private let repository = KoinRepositoryProvider.shared.repository

    func loadDashboard() async {
        isLoading = true
        error = nil
        do {
            // Load current user profile
            user = try await repository.getCurrentUser()

            // Load epreuves by different statuts in parallel
            async let enCoursList = try await repository.listEpreuves(search: nil, statut: "EN_COURS", filiereId: nil, page: 1, limit: 20)
            async let planifieesList = try await repository.listEpreuves(search: nil, statut: "PLANIFIEE", filiereId: nil, page: 1, limit: 20)
            async let allList = try await repository.listEpreuves(search: nil, statut: nil, filiereId: nil, page: 1, limit: 100)

            let enCoursResult = try await enCoursList
            let planifieesResult = try await planifieesList
            let allResult = try await allList

            enCours = enCoursResult.count
            planifiees = planifieesResult.count
            totalEpreuves = allResult.count

            // Upcoming = planifiees + en_cours, sorted by dateDebut (String comparison ISO 8601)
            upcomingEpreuves = (planifieesResult + enCoursResult).sorted { e1, e2 in
                e1.dateDebut < e2.dateDebut
            }
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    func refresh() async {
        await loadDashboard()
    }
}
