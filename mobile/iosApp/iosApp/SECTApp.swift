// SECT Mobile — iOS App Entry Point (SwiftUI)
// Ce fichier sera utilisé comme référence pour le projet Xcode
// Le module :shared sera compilé en Shared.framework importable

import SwiftUI
import Shared // ◄ Framework Kotlin compilé pour iOS

@main
struct SECTApp: App {
    @StateObject private var authViewModel = AuthViewModel()
    @StateObject private var dashboardViewModel = DashboardViewModel()
    @StateObject private var epreuveViewModel = EpreuveViewModel()
    @StateObject private var messagerieViewModel = MessagerieViewModel()
    @StateObject private var profileViewModel = ProfileViewModel()

    var body: some Scene {
        WindowGroup {
            if authViewModel.isAuthenticated {
                MainTabView()
                    .environmentObject(authViewModel)
                    .environmentObject(dashboardViewModel)
                    .environmentObject(epreuveViewModel)
                    .environmentObject(messagerieViewModel)
                    .environmentObject(profileViewModel)
            } else {
                LoginView()
                    .environmentObject(authViewModel)
            }
        }
    }
}

// ── Tab View principal ──
struct MainTabView: View {
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            DashboardView()
                .tabItem {
                    Label("Accueil", systemImage: "house.fill")
                }
                .tag(0)

            EpreuvesView()
                .tabItem {
                    Label("Épreuves", systemImage: "doc.text.fill")
                }
                .tag(1)

            MessagerieView()
                .tabItem {
                    Label("Messages", systemImage: "message.fill")
                }
                .tag(2)

            ProfileView()
                .tabItem {
                    Label("Profil", systemImage: "person.fill")
                }
                .tag(3)
        }
        .tint(.sectGreen)
    }
}
