// SECT Mobile — iOS Auth ViewModel
import SwiftUI
import Shared

@MainActor
class AuthViewModel: ObservableObject {
    @Published var isAuthenticated = false
    @Published var currentUser: User?  // From Shared framework
    @Published var isLoading = false
    @Published var error: String? = nil
    
    private let repository = KmpRepositoryProvider.shared.repository()
    
    func login(identifier: String, password: String) async {
        isLoading = true
        error = nil
        do {
            let session = try await repository.login(identifier: identifier, password: password)
            currentUser = session.user
            isAuthenticated = true
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
    }
    
    func checkAuth() async {
        if await repository.isAuthenticated() {
            do {
                currentUser = try await repository.getCurrentUser()
                isAuthenticated = true
            } catch { }
        }
    }
}

// ── Provider singleton pour le repository KMP ──
class KmpRepositoryProvider {
    static let shared = KmpRepositoryProvider()
    
    func repository() -> SECTRepository {
        // Initialisé avec les APIs et le cache de la plateforme iOS
        return SECTRepository(
            authApi: AuthApi(client: createKtorClient()),
            userApi: UserApi(client: createKtorClient()),
            epreuveApi: EpreuveApi(client: createKtorClient()),
            sessionApi: SessionApi(client: createKtorClient()),
            messagerieApi: MessagerieApi(client: createKtorClient()),
            tokenCache: createTokenCache()
        )
    }
    
    private func createKtorClient() -> HttpClient {
        // Utilise le engine Darwin (NSURLSession) configuré dans shared/
        return createHttpClient(
            engine: DarwinClientEngine(),
            baseUrl: "https://sect-zead.onrender.com",
            tokenProvider: { /* TODO: from TokenCache */ },
            refreshHandler: { /* TODO: refresh flow */ }
        )
    }
}
