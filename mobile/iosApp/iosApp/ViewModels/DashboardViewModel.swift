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
                enseignantId: "",
                titre: epreuve.titre,
                description: "",
                duree: epreuve.duree,
                dateDebut: epreuve.date,
                dateFin: epreuve.dateFin,
                melangeQuestions: false,
                melangePropositions: false,
                blocageRetour: false,
                statut: .planifiee,
                filiereId: "",
                uniteEnseignementId: nil,
                niveau: nil,
                sessionExamen: .normale,
                anneeAcademiqueId: nil,
                createdAt: "",
                updatedAt: "",
                deletedAt: nil,
                proctoringActif: false,
                verificationIdentite: false,
                generationMode: .manuelle,
                isTemplate: false,
                noteTotal: 20.0,
                clotureeAt: nil,
                clotureeAutomatiquement: false,
                raisonCloture: nil,
                delaiGrace: 0,
                epreuveOrigineId: nil,
                questionCount: KotlinInt(int: 0),
                totalPoints: KotlinDouble(double: 0.0),
                enseignant: nil,
                filiere: nil,
                questions: nil
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
                enseignantId: "",
                titre: epreuve.titre,
                description: "",
                duree: epreuve.duree,
                dateDebut: epreuve.date,
                dateFin: epreuve.dateFin,
                melangeQuestions: false,
                melangePropositions: false,
                blocageRetour: false,
                statut: .planifiee,
                filiereId: "",
                uniteEnseignementId: nil,
                niveau: nil,
                sessionExamen: .normale,
                anneeAcademiqueId: nil,
                createdAt: "",
                updatedAt: "",
                deletedAt: nil,
                proctoringActif: false,
                verificationIdentite: false,
                generationMode: .manuelle,
                isTemplate: false,
                noteTotal: 20.0,
                clotureeAt: nil,
                clotureeAutomatiquement: false,
                raisonCloture: nil,
                delaiGrace: 0,
                epreuveOrigineId: nil,
                questionCount: KotlinInt(int: epreuve.nbQuestions),
                totalPoints: KotlinDouble(double: epreuve.totalPoints),
                enseignant: nil,
                filiere: nil,
                questions: nil
            )
        }
    }
    
    func refresh() async {
        await loadDashboard()
    }
}
