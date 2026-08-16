// SECT Mobile — iOS Auth ViewModel
import SwiftUI
import Shared

@MainActor
class AuthViewModel: ObservableObject {
    @Published var isAuthenticated = false
    @Published var currentUser: User?  // From Shared framework
    @Published var isLoading = false
    @Published var error: String? = nil
    @Published var blockedRoleError: String? = nil  // SECT-RBAC-MOBILE-1: Error for ADMIN/RESPONSABLE
    
    private let repository = KoinRepositoryProvider.shared.repository
    
    init() {
        // Pre-load tokens from Keychain into in-memory cache
        // so the synchronous tokenProvider closure in the HttpClient
        // can return them without any semaphore / deadlock risk.
        Task { await KoinRepositoryProvider.shared.initializeTokens() }
    }
    
    func login(identifier: String, password: String) async {
        isLoading = true
        error = nil
        blockedRoleError = nil
        do {
            let session = try await repository.login(identifier: identifier, password: password)
            let user = session.user
            
            // SECT-RBAC-MOBILE-1: L'app mobile est réservée aux ENSEIGNANT et ETUDIANT
            // Les ADMIN et RESPONSABLE doivent utiliser l'interface web
            if user.role != .enseignant && user.role != .etudiant {
                blockedRoleError = "L'application mobile est réservée aux enseignants et étudiants. Les \(user.role == .admin ? "administrateurs" : "responsables") doivent utiliser l'interface web."
                // Logout immédiat + clear tokens
                try? await repository.logout()
                KoinRepositoryProvider.shared.clearCachedTokens()
                isLoading = false
                return
            }
            
            currentUser = user
            isAuthenticated = true
            // Update in-memory token cache so subsequent Ktor requests
            // pick up the new access token synchronously.
            KoinRepositoryProvider.shared.updateCachedTokens(
                accessToken: session.accessToken,
                refreshToken: session.refreshToken
            )
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }
    
    func logout() async {
        do {
            try await repository.logout()
        } catch { }
        currentUser = nil
        isAuthenticated = false
        blockedRoleError = nil
        // Wipe in-memory tokens so Ktor no longer sends stale credentials.
        KoinRepositoryProvider.shared.clearCachedTokens()
    }
    
    func checkAuth() async {
        let isAuth = try? await repository.isAuthenticated()
        if isAuth?.boolValue ?? false {
            do {
                let user = try await repository.getCurrentUser()
                
                // SECT-RBAC-MOBILE-1: Vérifier le rôle même pour les sessions existantes
                if user.role != .enseignant && user.role != .etudiant {
                    await logout()
                    blockedRoleError = "Votre compte (\(user.role.name)) n'est pas autorisé sur l'application mobile. Veuillez utiliser l'interface web."
                    return
                }
                
                currentUser = user
                isAuthenticated = true
            } catch {
                await logout()
            }
        }
    }
    
    func requestPasswordReset(email: String) async {
        isLoading = true
        error = nil
        do {
            try await repository.requestPasswordReset(email: email)
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }
}
