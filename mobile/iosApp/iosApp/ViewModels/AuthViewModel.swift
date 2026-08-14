// SECT Mobile — iOS Auth ViewModel
import SwiftUI
import Shared

@MainActor
class AuthViewModel: ObservableObject {
    @Published var isAuthenticated = false
    @Published var currentUser: User?  // From Shared framework
    @Published var isLoading = false
    @Published var error: String? = nil
    
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
        do {
            let session = try await repository.login(identifier: identifier, password: password)
            currentUser = session.user
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
        // Wipe in-memory tokens so Ktor no longer sends stale credentials.
        KoinRepositoryProvider.shared.clearCachedTokens()
    }
    
    func checkAuth() async {
        if await repository.isAuthenticated() {
            do {
                currentUser = try await repository.getCurrentUser()
                isAuthenticated = true
            } catch { }
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
