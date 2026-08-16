// SECT Mobile — iOS Dashboard ViewModel (RBAC: Enseignant/Étudiant)
import SwiftUI
import Shared

@MainActor
class DashboardViewModel: ObservableObject {
    @Published var user: User? = nil
    
    // Stats enrichies selon le rôle
    @Published var enseignantStats: EnseignantStats? = nil
    @Published var etudiantStats: EtudiantStats? = nil
    
    // Legacy (pour compatibilité)
    @Published var upcomingEpreuves: [Epreuve] = []
    @Published var totalEpreuves: Int = 0
    @Published var enCours: Int = 0
    @Published var planifiees: Int = 0
    
    @Published var isLoading = false
    @Published var error: String? = nil
    
    private let repository = KoinRepositoryProvider.shared.repository
    
    var isEnseignant: Bool {
        user?.role == .enseignant
    }
    
    var isEtudiant: Bool {
        user?.role == .etudiant
    }
    
    func loadDashboard() async {
        isLoading = true
        error = nil
        do {
            // Load current user profile
            user = try await repository.getCurrentUser()
            
            // Charger les stats selon le rôle
            if isEnseignant {
                try await loadEnseignantStats()
            } else if isEtudiant {
                try await loadEtudiantStats()
            }
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }
    
    // MARK: - Stats Enseignant
    
    private func loadEnseignantStats() async throws {
        let stats = try await repository.getStatsEnseignant()
        enseignantStats = stats
        
        // Compatibilité legacy
        totalEpreuves = Int(stats.nbEpreuves)
        enCours = Int(stats.nbEpreuvesActives)
        planifiees = stats.epreuvesAVenir.count
        
        upcomingEpreuves = stats.epreuvesAVenir.map { epreuve in
            Epreuve(
                id: epreuve.id,
                titre: epreuve.titre,
                description: "",
                statut: StatutEpreuve(rawValue: epreuve.statut) ?? .planifiee,
                dateDebut: epreuve.date,
                dateFin: epreuve.dateFin,
                duree: epreuve.duree,
                nbQuestions: 0,
                totalPoints: 0.0,
                filiereId: "",
                enseignantId: "",
                createdAt: "",
                updatedAt: ""
            )
        }
    }
    
    // MARK: - Stats Étudiant
    
    private func loadEtudiantStats() async throws {
        let stats = try await repository.getStatsEtudiant()
        etudiantStats = stats
        
        // Compatibilité legacy
        totalEpreuves = Int(stats.nbEpreuvesTerminees + stats.nbEpreuvesAVenir)
        enCours = stats.sessionEnCours != nil ? 1 : 0
        planifiees = Int(stats.nbEpreuvesAVenir)
        
        upcomingEpreuves = stats.epreuvesAVenir.map { epreuve in
            Epreuve(
                id: epreuve.id,
                titre: epreuve.titre,
                description: "",
                statut: StatutEpreuve(rawValue: epreuve.statut) ?? .planifiee,
                dateDebut: epreuve.date,
                dateFin: epreuve.dateFin,
                duree: epreuve.duree,
                nbQuestions: epreuve.nbQuestions,
                totalPoints: epreuve.totalPoints,
                filiereId: "",
                enseignantId: "",
                createdAt: "",
                updatedAt: ""
            )
        }
    }
    
    func refresh() async {
        await loadDashboard()
    }
}
