// SECT Mobile — KoinStartup — Initializes Koin DI for the iOS app.
//
// Loads platform-specific modules + shared modules from the KMP framework.
// Must be called once in SECTApp.init() before any ViewModel is created.
//
// Module load order:
//   iosPlatformModule (platform singletons: HttpClient, TokenCache, etc.)
//   → sharedModules (networkModule → dataModule → domainModule → presentationModule)
//
// This mirrors the Android pattern in SECTApplication.kt:
//   startKoin { modules(appModule + sharedModules) }

import Foundation
import Shared

/// KoinStartup — One-time Koin DI initialization for iOS.
///
/// Call `KoinStartup.start()` in SECTApp.init() before creating any ViewModel.
/// Safe to call multiple times — subsequent calls are no-ops.
enum KoinStartup {
    
    /// Start Koin with iOS platform module + shared modules.
    /// Called once from SECTApp.init().
    static func start() {
        // Guard: don't start Koin twice
        guard !isKoinStarted() else {
            print("[Koin] Already started — skipping")
            return
        }
        
        do {
            // Start Koin with: iosPlatformModule (platform) + sharedModules (network → data → domain → presentation)
            //
            // The Shared framework exposes:
            //   iosPlatformModule — iOS-specific singletons (HttpClient, TokenCache, etc.)
            //   sharedModules — shared DI modules from commonMain
            //
            // This mirrors Android's: startKoin { modules(appModule + sharedModules) }
            let allModules = [IOSPlatformModuleKt.getIosPlatformModule()] + SharedDIHelperKt.sharedModules()
            
            try KoinKoin_instance.start(modules: allModules)
            print("[Koin] Started successfully with \(allModules.count) modules")
        } catch {
            // If Koin fails to start, log but don't crash —
            // the app can still function with lazy resolution errors
            // which will be caught at the ViewModel level.
            print("[Koin] ⚠️ Failed to start: \(error)")
            print("[Koin] ⚠️ Dependency resolution will fail — check module definitions")
        }
    }
    
    /// Check if Koin is already running.
    private static func isKoinStarted() -> Bool {
        return KoinKoin_instance.isStarted()
    }
}
