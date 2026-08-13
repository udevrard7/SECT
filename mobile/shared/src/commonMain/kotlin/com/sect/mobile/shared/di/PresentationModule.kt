package com.sect.mobile.shared.di

import org.koin.dsl.module

/**
 * Koin module for presentation layer: ViewModels.
 *
 * NOTE: Shared ViewModels are a future goal (Correction 6).
 * Currently, ViewModels are platform-specific:
 * - Android: com.sect.mobile.android.ui.viewmodel.* (using androidx.lifecycle.ViewModel)
 * - iOS:     Swift ViewModels observing shared state
 *
 * When ViewModels are migrated to shared (using Kotlin Multiplatform ViewModel
 * or a shared state holder), they will be declared here as factories:
 *
 * ```
 * factory { AuthViewModel(get()) }
 * factory { DashboardViewModel(get()) }
 * factory { EpreuveViewModel(get()) }
 * factory { PassationViewModel(get(), get()) }
 * factory { MessagerieViewModel(get()) }
 * factory { ProfileViewModel(get()) }
 * ```
 *
 * For now, platform-specific DI modules provide their own ViewModels:
 * - Android: AppModule in androidApp/di/
 * - iOS:     iOSDIKit in iosApp/
 */
val presentationModule = module {
    // Shared ViewModels will be declared here after migration (Correction 6).
    // Currently, each platform provides its own ViewModel DI.
}
