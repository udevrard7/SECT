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
                    .environmentObject(BadgeManager.shared)
                    // SECT-MOBILE-NAV-PHASE-E : Deep Links sect://
                    .onOpenURL { url in
                        handleDeepLink(url)
                    }
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
/// SECT-MOBILE-NAV-PHASE-E : étendu avec corrections, travail, profile + parser sect://
enum DeepLinkTarget {
    case epreuve(id: String)
    case results(epreuveId: String)
    case messages(conversationId: String)
    case dashboard
    case notifications
    // SECT-MOBILE-NAV-PHASE-E : nouveaux cas
    case corrections
    case correctionDetail(sessionId: String)
    case travail
    case profile
    case resultats
    case unknown(uri: String)

    /// Parse une URL sect:// en DeepLinkTarget.
    static func parse(from url: URL) -> DeepLinkTarget? {
        guard url.scheme == "sect" else { return nil }
        let host = url.host ?? ""
        let pathComponents = url.pathComponents.filter { $0 != "/" }

        switch host {
        case "dashboard": return .dashboard
        case "messagerie":
            return pathComponents.isEmpty ? .messages(conversationId: "") : .messages(conversationId: pathComponents[0])
        case "corrections":
            return pathComponents.isEmpty ? .corrections : .correctionDetail(sessionId: pathComponents[0])
        case "resultats": return .resultats
        case "travail": return .travail
        case "profile": return .profile
        case "epreuves":
            return pathComponents.isEmpty ? .travail : .epreuve(id: pathComponents[0])
        case "results":
            return pathComponents.isEmpty ? .unknown(uri: url.absoluteString) : .results(epreuveId: pathComponents[0])
        case "passation":
            return pathComponents.isEmpty ? .unknown(uri: url.absoluteString) : .results(epreuveId: pathComponents[0])
        default: return .unknown(uri: url.absoluteString)
        }
    }

    /// Index d'onglet pour MainTabView.
    // SECT-NAV-EXAMPREP : Étudiant a 5 onglets (Accueil=0, Travail=1, Prépa=2, Résultats=3, Messages=4)
    // Enseignant a 4 onglets (Accueil=0, Travail=1, Corrections=2, Messages=3)
    var tabIndex: Int? {
        switch self {
        case .dashboard: return 0
        case .travail: return 1
        case .corrections: return 2  // Enseignant
        case .resultats: return 3    // Étudiant (après Prépa)
        case .messages: return 4     // Étudiant (5e onglet) ou 3 enseignant
        default: return nil
        }
    }
}

// ── Deep Link Handler (SECT-MOBILE-NAV-PHASE-E) ──

/// Traite un deep link sect:// — publie une notification pour la navigation.
func handleDeepLink(_ url: URL) {
    guard let target = DeepLinkTarget.parse(from: url) else { return }
    DispatchQueue.main.async {
        NotificationCenter.default.post(
            name: .sectDeepLink,
            object: nil,
            userInfo: ["target": target]
        )
    }
}

// ── Tab View principal — SECT-NAV-EXAMPREP : 5 onglets étudiant / 4 enseignant ──
// Étudiant    : Accueil · Travail · Prépa · Résultats · Messages (5 onglets)
// Enseignant  : Accueil · Travail · Corrections · Messages (4 onglets)
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
                // Enseignant : Corrections en position 2 (4 onglets)
                CorrectionsView()
                    .tabItem { Label("Corrections", systemImage: "checkmark.square") }
                    .tag(2)
                MessagerieView()
                    .tabItem { Label("Messages", systemImage: "message.fill") }
                    .tag(3)
            } else {
                // Étudiant : Prépa en position 2 (5 onglets) — SECT-NAV-EXAMPREP
                ExamPrepHomeView()
                    .tabItem { Label("Prépa", systemImage: "book.fill") }
                    .tag(2)
                ResultatsView()
                    .tabItem { Label("Résultats", systemImage: "chart.bar.fill") }
                    .tag(3)
                MessagerieView()
                    .tabItem { Label("Messages", systemImage: "message.fill") }
                    .tag(4)
            }
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
            items.append(SidebarItem(tag: 3, title: "Messages", icon: "message.fill"))
        } else {
            // Étudiant : 5 onglets — SECT-NAV-EXAMPREP
            items.append(SidebarItem(tag: 2, title: "Prépa", icon: "book.fill"))
            items.append(SidebarItem(tag: 3, title: "Résultats", icon: "chart.bar.fill"))
            items.append(SidebarItem(tag: 4, title: "Messages", icon: "message.fill"))
        }
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
                ExamPrepHomeView()
            }
        case 3:
            if isEnseignant {
                MessagerieView()
            } else {
                ResultatsView()
            }
        case 4:
            MessagerieView()
        default: DashboardView()
        }
    }
}
