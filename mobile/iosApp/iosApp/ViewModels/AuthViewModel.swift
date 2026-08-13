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
    private let tokenCache = KmpRepositoryProvider.shared.tokenCache
    
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

// ── Provider singleton pour le repository KMP ──
class KmpRepositoryProvider {
    static let shared = KmpRepositoryProvider()
    
    private let _tokenCache = createTokenCache()
    var tokenCache: TokenCache { _tokenCache }
    
    private lazy var _client: HttpClient = {
        createHttpClient(
            engine: DarwinClientEngine(),
            baseUrl: "https://sect-zead.onrender.com",
            tokenProvider: { [weak self] in
                // Token provider — retourne le JWT access token courant
                guard let self = self else { return "" }
                return DispatchQueue.global().sync {
                    // Utilise runBlocking équivalent pour obtenir le token de façon synchrone
                    // Le TokenCache iOS est synchrone via Keychain
                    var token = ""
                    let semaphore = DispatchSemaphore(value: 0)
                    Task {
                        token = await self._tokenCache.getAccessToken()
                        semaphore.signal()
                    }
                    semaphore.wait()
                    return token
                }
            },
            refreshHandler: { [weak self] in
                // Refresh handler — utilise le refresh token pour obtenir un nouveau access token
                guard let self = self else { return "" }
                do {
                    let refreshToken = await self._tokenCache.getRefreshToken()
                    if refreshToken.isEmpty { return "" }
                    
                    // Créer un AuthApi temporaire pour le refresh
                    let authApi = AuthApi(client: self._client)
                    let session = try await authApi.refresh(refreshToken: refreshToken)
                    
                    // Sauvegarder les nouveaux tokens
                    await self._tokenCache.saveAccessToken(session.accessToken)
                    await self._tokenCache.saveRefreshToken(session.refreshToken)
                    
                    return session.accessToken
                } catch {
                    return ""
                }
            }
        )
    }()
    
    private lazy var _repository: SECTRepository = {
        SECTRepository(
            authApi: AuthApi(client: _client),
            userApi: UserApi(client: _client),
            epreuveApi: EpreuveApi(client: _client),
            sessionApi: SessionApi(client: _client),
            messagerieApi: MessagerieApi(client: _client),
            tokenCache: _tokenCache
        )
    }()
    
    func repository() -> SECTRepository {
        return _repository
    }
}
