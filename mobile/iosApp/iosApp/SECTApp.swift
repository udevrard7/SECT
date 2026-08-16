// SECT Mobile — iOS App Entry Point (SwiftUI)
// Ce fichier sera utilisé comme référence pour le projet Xcode
// Le module :shared sera compilé en Shared.framework importable

import SwiftUI
import Shared // ◄ Framework Kotlin compilé pour iOS

@main
struct SECTApp: App {
    /// Bridge to UIApplicationDelegate for APNs device token callbacks.
    @UIApplicationDelegateAdaptor(SECTAppDelegate.self) var appDelegate
    
    @StateObject private var authViewModel = AuthViewModel()
    @StateObject private var dashboardViewModel = DashboardViewModel()
    @StateObject private var epreuveViewModel = EpreuveViewModel()
    @StateObject private var messagerieViewModel = MessagerieViewModel()
    @StateObject private var profileViewModel = ProfileViewModel()
    // SECT-MOBILE-NAV-PHASE-B : nouveaux ViewModels pour Devoirs + Corrections
    @StateObject private var devoirsViewModel = DevoirsViewModel()
    @StateObject private var correctionsViewModel = CorrectionsViewModel()
    // SECT-MOBILE-NAV-PHASE-C : ResultatsViewModel pour l'onglet Résultats étudiant
    @StateObject private var resultatsViewModel = ResultatsViewModel()
    
    /// Tracks whether in-memory tokens have been loaded from Keychain.
    /// Shows a lightweight splash until ready so no HTTP request fires
    /// with an empty tokenProvider cache.
    @State private var tokensReady = false
    
    /// Deep link target from notification tap navigation.
    @State private var deepLinkTarget: DeepLinkTarget?

    init() {
        // Initialize Koin DI — must happen before any ViewModel is created.
        // Loads iosPlatformModule (platform singletons) + sharedModules (network → data → domain → presentation).
        KoinStartup.start()
        
        // Setup push notifications (APNs)
        PushNotificationManager.shared.setup()
        PushNotificationManager.shared.onDeepLink = { target, data in
            // Handle deep link navigation from notification tap.
            // The target string maps to DeepLinkTarget cases.
            switch target {
            case "epreuve":
                if let id = data["epreuveId"] as? String {
                    DispatchQueue.main.async {
                        // Will be consumed by MainTabView/EpreuvesView
                        NotificationCenter.default.post(
                            name: .sectDeepLink,
                            object: nil,
                            userInfo: ["target": "epreuve", "epreuveId": id]
                        )
                    }
                }
            case "results":
                if let id = data["epreuveId"] as? String {
                    DispatchQueue.main.async {
                        NotificationCenter.default.post(
                            name: .sectDeepLink,
                            object: nil,
                            userInfo: ["target": "results", "epreuveId": id]
                        )
                    }
                }
            case "messages":
                if let conversationId = data["conversationId"] as? String {
                    DispatchQueue.main.async {
                        NotificationCenter.default.post(
                            name: .sectDeepLink,
                            object: nil,
                            userInfo: ["target": "messages", "conversationId": conversationId]
                        )
                    }
                }
            case "dashboard":
                DispatchQueue.main.async {
                    NotificationCenter.default.post(
                        name: .sectDeepLink,
                        object: nil,
                        userInfo: ["target": "dashboard"]
                    )
                }
            default:
                break
            }
        }
    }

    var body: some Scene {
        WindowGroup {
            if !tokensReady {
                // Minimal splash while tokens load from Keychain
                Color.white
                    .ignoresSafeArea()
                    .task {
                        await KoinRepositoryProvider.shared.initializeTokens()
                        tokensReady = true
                    }
            } else if authViewModel.isAuthenticated {
                MainTabView()
                    .environmentObject(authViewModel)
                    .environmentObject(dashboardViewModel)
                    .environmentObject(epreuveViewModel)
                    .environmentObject(messagerieViewModel)
                    .environmentObject(profileViewModel)
                    .environmentObject(devoirsViewModel)
                    .environmentObject(correctionsViewModel)
                    .environmentObject(resultatsViewModel)
            } else {
                LoginView()
                    .environmentObject(authViewModel)
            }
        }
    }
}

// ── Deep Link Notification Name ──

extension Notification.Name {
    /// Notification posted when a push notification deep link should be navigated.
    static let sectDeepLink = Notification.Name("sectDeepLink")
}

// ── Deep Link Target ──

/// Deep link target for notification tap navigation.
enum DeepLinkTarget {
    case epreuve(id: String)
    case results(epreuveId: String)
    case messages(conversationId: String)
    case dashboard
    case notifications
}

// ── Tab View principal — SECT-MOBILE-NAV-PHASE-A/B/D : 4 onglets rôle-spécifiques ──
// Étudiant    : Accueil · Travail · Résultats · Messages
// Enseignant  : Accueil · Travail · Corrections · Messages
// Profil est accessible via l'avatar dans le Dashboard (secondaire).
//
// SECT-MOBILE-NAV-PHASE-D : navigation adaptative
//   iPhone (compact) : TabView en bas
//   iPad   (regular) : NavigationSplitView avec sidebar
struct MainTabView: View {
    @State private var selectedTab = 0
    @EnvironmentObject var authViewModel: AuthViewModel
    @Environment(\.horizontalSizeClass) var horizontalSizeClass

    private var isEnseignant: Bool {
        authViewModel.currentUser?.role == .enseignant
    }

    var body: some View {
        if horizontalSizeClass == .regular {
            // iPad : NavigationSplitView avec sidebar
            iPadLayout
        } else {
            // iPhone : TabView standard
            phoneLayout
        }
    }

    // MARK: - iPhone (TabView)

    private var phoneLayout: some View {
        TabView(selection: $selectedTab) {
            DashboardView()
                .tabItem { Label("Accueil", systemImage: "house.fill") }
                .tag(0)

            TravailView()
                .tabItem { Label("Travail", systemImage: "briefcase.fill") }
                .tag(1)

            if isEnseignant {
                CorrectionsView()
                    .tabItem { Label("Corrections", systemImage: "checkmark.square") }
                    .tag(2)
            } else {
                ResultatsView()
                    .tabItem { Label("Résultats", systemImage: "chart.bar.fill") }
                    .tag(2)
            }

            MessagerieView()
                .tabItem { Label("Messages", systemImage: "message.fill") }
                .tag(3)
        }
        .tint(.sectGreen)
    }

    // MARK: - iPad (NavigationSplitView)

    private var iPadLayout: some View {
        NavigationSplitView {
            // Sidebar : liste des destinations avec sélection manuelle
            List {
                ForEach(sidebarItems, id: \.tag) { item in
                    Button {
                        selectedTab = item.tag
                    } label: {
                        Label(item.title, systemImage: item.icon)
                            .foregroundColor(selectedTab == item.tag ? .sectGreen : .primary)
                    }
                    .buttonStyle(PlainButtonStyle())
                }
            }
            .navigationTitle("SECT")
            .tint(.sectGreen)
        } detail: {
            detailView
        }
    }

    private struct SidebarItem {
        let tag: Int
        let title: String
        let icon: String
    }

    private var sidebarItems: [SidebarItem] {
        var items = [
            SidebarItem(tag: 0, title: "Accueil", icon: "house.fill"),
            SidebarItem(tag: 1, title: "Travail", icon: "briefcase.fill")
        ]
        if isEnseignant {
            items.append(SidebarItem(tag: 2, title: "Corrections", icon: "checkmark.square"))
        } else {
            items.append(SidebarItem(tag: 2, title: "Résultats", icon: "chart.bar.fill"))
        }
        items.append(SidebarItem(tag: 3, title: "Messages", icon: "message.fill"))
        return items
    }

    @ViewBuilder
    private var detailView: some View {
        switch selectedTab {
        case 0: DashboardView()
        case 1: TravailView()
        case 2:
            if isEnseignant {
                CorrectionsView()
            } else {
                ResultatsView()
            }
        case 3: MessagerieView()
        default: DashboardView()
        }
    }
}
