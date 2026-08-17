// SECT Mobile — KoinRepositoryProvider — Resolves dependencies from Koin DI for iOS.
//
// This replaces the old KmpRepositoryProvider which manually constructed
// SECTRepository (deprecated concrete class) using createTokenCache() and
// createHttpClient() expect/actual functions.
//
// Now uses Koin DI to resolve SECTRepositoryInterface (domain abstraction)
// and TokenCache from the shared module's DI modules.
//
// The shared module's sharedModules (networkModule + dataModule + domainModule
// + presentationModule) plus iosPlatformModule are loaded by KoinStartup.start()
// in SECTApp.init() before any ViewModel is created.

import Foundation
import Shared

/// KoinRepositoryProvider — Singleton that resolves dependencies from Koin DI for iOS.
///
/// Drop-in replacement for KmpRepositoryProvider. All ViewModels should use:
///   private let repository = KoinRepositoryProvider.shared.repository
///
/// The repository is typed as SECTRepositoryInterface (domain abstraction),
/// not SECTRepository (deprecated concrete class).
class KoinRepositoryProvider {
    
    static let shared = KoinRepositoryProvider()
    
    private init() {}
    
    // ── Repository (main interface) ──
    
    /// Resolve SECTRepositoryInterface from Koin.
    /// This is the primary access point for all ViewModels.
    /// Returns SECTRepositoryImpl (from DataModule) typed as SECTRepositoryInterface.
    lazy var repository: SECTRepositoryInterface = {
        return SharedDIHelper.shared.sectRepositoryInterface
    }()

    // ── ExamPrep Repository (SECT-EXAMPREP-CONTRACT-F1) ──

    /// Resolve ExamPrepRepository from Koin (separate from SECTRepositoryInterface).
    lazy var examPrepRepository: ExamPrepRepository = {
        return SharedDIHelper.shared.examPrepRepository
    }()

    // ── Token Cache ──
    
    /// Resolve TokenCache from Koin (IOSTokenCache via Keychain).
    lazy var tokenCache: TokenCache = {
        return SharedDIHelper.shared.tokenCache
    }()
    
    // ── In-Memory Token Cache ──
    
    // In-memory token cache for synchronous access by Ktor tokenProvider.
    // These are read by the synchronous `tokenProvider` closure in the
    // iosPlatformModule's HttpClient definition — zero deadlock risk.
    //
    // The cached tokens are populated at app launch (initializeTokens)
    // and updated after every successful login / token refresh.
    private var _cachedAccessToken: String = ""
    private var _cachedRefreshToken: String = ""
    
    var cachedAccessToken: String { return _cachedAccessToken }
    var cachedRefreshToken: String { return _cachedRefreshToken }
    
    /// Load tokens from Keychain (via Koin-resolved TokenCache) into in-memory cache.
    /// Must be called once before any HTTP request so the synchronous
    /// `tokenProvider` closure in the HttpClient has a token to return.
    /// Called from SECTApp.swift splash screen.
    func initializeTokens() async {
        _cachedAccessToken = (try? await tokenCache.getAccessToken()) ?? ""
        _cachedRefreshToken = (try? await tokenCache.getRefreshToken()) ?? ""
    }
    
    /// Update cached tokens after a successful login.
    /// Allows the synchronous `tokenProvider` in the HttpClient to return
    /// the latest access token without hitting Keychain or blocking a thread.
    func updateCachedTokens(accessToken: String, refreshToken: String) {
        _cachedAccessToken = accessToken
        _cachedRefreshToken = refreshToken
    }
    
    /// Clear cached tokens on logout so Ktor stops sending stale credentials.
    func clearCachedTokens() {
        _cachedAccessToken = ""
        _cachedRefreshToken = ""
    }
}
