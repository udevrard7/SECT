// SECT Mobile — iOS Dashboard View (SwiftUI)
import SwiftUI
import Shared

struct DashboardView: View {
    @StateObject var viewModel = DashboardViewModel()
    @EnvironmentObject var authVM: AuthViewModel

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    // Carte de bienvenue
                    WelcomeCard(userName: authVM.currentUser?.name)

                    // Stats résumé
                    StatsRow(
                        totalEpreuves: viewModel.totalEpreuves,
                        enCours: viewModel.enCours,
                        planifiees: viewModel.planifiees
                    )

                    // Raccourcis rapides
                    LazyVGrid(columns: [
                        GridItem(.flexible()),
                        GridItem(.flexible())
                    ], spacing: 16) {
                        QuickActionCard(title: "Épreuves", icon: "doc.text.fill", color: .sectGreen)
                        QuickActionCard(title: "Résultats", icon: "chart.bar.fill", color: .sectBlue)
                        QuickActionCard(title: "Messages", icon: "message.fill", color: .sectOrange)
                        QuickActionCard(title: "Paramètres", icon: "gearshape.fill", color: .sectPurple)
                    }
                    .padding(.horizontal)

                    // Épreuves à venir
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Text("Épreuves à venir")
                                .font(.headline)
                            Spacer()
                            if viewModel.upcomingEpreuves.count > 3 {
                                NavigationLink {
                                    EpreuvesListView()
                                } label: {
                                    Text("Voir tout")
                                        .font(.subheadline)
                                        .foregroundStyle(.sectGreen)
                                }
                            }
                        }
                        .padding(.horizontal)

                        if viewModel.isLoading {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                                .padding()
                        } else if viewModel.upcomingEpreuves.isEmpty {
                            ContentUnavailableView(
                                "Aucune épreuve planifiée",
                                systemImage: "doc.text",
                                description: Text("Les épreuves à venir apparaîtront ici.")
                            )
                            .padding(.horizontal)
                        } else {
                            ForEach(viewModel.upcomingEpreuves.prefix(3), id: \.id) { epreuve in
                                NavigationLink {
                                    EpreuveDetailView(epreuveId: epreuve.id)
                                } label: {
                                    EpreuveRow(epreuve: epreuve)
                                }
                                .buttonStyle(.plain)
                            }
                            .padding(.horizontal)
                        }
                    }

                    if let error = viewModel.error {
                        ErrorBanner(message: error) {
                            Task { await viewModel.refresh() }
                        }
                        .padding(.horizontal)
                    }
                }
                .padding(.vertical)
            }
            .navigationTitle("SECT")
            .refreshable {
                await viewModel.refresh()
            }
            .task {
                await viewModel.loadDashboard()
            }
        }
    }
}

// ── Welcome Card ──

struct WelcomeCard: View {
    let userName: String?
    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("Bienvenue, \(userName ?? "Étudiant")")
                    .font(.headline)
                Text("Sur SECT Mobile")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "graduationcap.fill")
                .font(.largeTitle)
                .foregroundStyle(.sectGreen)
        }
        .padding()
        .background(Color.sectGreen.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal)
    }
}

// ── Stats Row ──

struct StatsRow: View {
    let totalEpreuves: Int
    let enCours: Int
    let planifiees: Int

    var body: some View {
        HStack(spacing: 12) {
            StatItem(value: totalEpreuves, label: "Total", color: .sectGreen)
            StatItem(value: enCours, label: "En cours", color: .sectBlue)
            StatItem(value: planifiees, label: "Planifiées", color: .sectOrange)
        }
        .padding(.horizontal)
    }
}

struct StatItem: View {
    let value: Int
    let label: String
    let color: Color

    var body: some View {
        VStack(spacing: 4) {
            Text("\(value)")
                .font(.title2)
                .fontWeight(.bold)
                .foregroundStyle(color)
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(color.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

// ── Quick Action Card ──

struct QuickActionCard: View {
    let title: String
    let icon: String
    let color: Color

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(color)
            Text(title)
                .font(.caption)
                .foregroundStyle(.primary)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(color.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// ── Epreuve Row ──

struct EpreuveRow: View {
    let epreuve: Epreuve

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(epreuve.titre)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .lineLimit(2)

                HStack(spacing: 8) {
                    Text(epreuve.statut.name)
                        .font(.caption2)
                        .fontWeight(.semibold)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(statutColor.opacity(0.15))
                        .foregroundStyle(statutColor)
                        .clipShape(Capsule())

                    Text("\(epreuve.duree) min")
                        .font(.caption2)
                        .foregroundStyle(.secondary)

                    if let count = epreuve.questionCount {
                        Text("\(count) Q")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(12)
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private var statutColor: Color {
        switch epreuve.statut.name {
        case "EN_COURS": return .sectGreen
        case "PLANIFIEE": return .sectBlue
        case "TERMINEE": return .sectOrange
        case "CLOTUREE": return .sectRed
        default: return .gray
        }
    }
}

// ── Error Banner ──

struct ErrorBanner: View {
    let message: String
    let onRetry: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.sectRed)
            Text(message)
                .font(.caption)
                .foregroundStyle(.sectRed)
            Spacer()
            Button("Réessayer") {
                onRetry()
            }
            .font(.caption)
            .fontWeight(.semibold)
            .foregroundStyle(.sectRed)
        }
        .padding()
        .background(Color.sectRed.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

// ── Epreuves List View (full list) ──

struct EpreuvesListView: View {
    @StateObject var viewModel = EpreuveViewModel()

    var body: some View {
        List {
            // Filter bar
            Section {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        FilterChip(label: "Toutes", isSelected: viewModel.statutFilter == nil) {
                            Task { await viewModel.filterByStatut(nil) }
                        }
                        FilterChip(label: "En cours", isSelected: viewModel.statutFilter == "EN_COURS") {
                            Task { await viewModel.filterByStatut("EN_COURS") }
                        }
                        FilterChip(label: "Planifiées", isSelected: viewModel.statutFilter == "PLANIFIEE") {
                            Task { await viewModel.filterByStatut("PLANIFIEE") }
                        }
                        FilterChip(label: "Terminées", isSelected: viewModel.statutFilter == "TERMINEE") {
                            Task { await viewModel.filterByStatut("TERMINEE") }
                        }
                    }
                    .padding(.vertical, 4)
                }
            }

            // Epreuve list
            ForEach(viewModel.epreuves, id: \.id) { epreuve in
                NavigationLink {
                    EpreuveDetailView(epreuveId: epreuve.id)
                } label: {
                    EpreuveRow(epreuve: epreuve)
                }
                .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
            }

            if viewModel.hasMorePages {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
                .onAppear {
                    Task { await viewModel.loadNextPage() }
                }
            }
        }
        .searchable(text: $viewModel.searchQuery, prompt: "Rechercher une épreuve")
        .onChange(of: viewModel.searchQuery) { _ in
            Task { await viewModel.search() }
        }
        .overlay {
            if viewModel.epreuves.isEmpty && !viewModel.isLoading {
                ContentUnavailableView(
                    "Aucune épreuve",
                    systemImage: "doc.text",
                    description: Text("Aucune épreuve ne correspond à votre recherche.")
                )
            }
        }
        .navigationTitle("Épreuves")
        .task {
            await viewModel.loadEpreuves()
        }
    }
}

// ── Filter Chip ──

struct FilterChip: View {
    let label: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.caption)
                .fontWeight(.semibold)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(isSelected ? Color.sectGreen : Color(.systemGray5))
                .foregroundStyle(isSelected ? .white : .primary)
                .clipShape(Capsule())
        }
    }
}

// ── Epreuves View (Tab) ──

struct EpreuvesView: View {
    var body: some View {
        NavigationStack {
            EpreuvesListView()
        }
    }
}

// ── Messagerie View (Tab) ──

struct MessagerieView: View {
    @StateObject var viewModel = MessagerieViewModel()

    var body: some View {
        NavigationStack {
            List(viewModel.conversations, id: \.id) { conversation in
                NavigationLink {
                    ConversationView(conversation: conversation)
                } label: {
                    ConversationRow(conversation: conversation)
                }
            }
            .overlay {
                if viewModel.conversations.isEmpty && !viewModel.isLoadingConversations {
                    ContentUnavailableView(
                        "Aucune conversation",
                        systemImage: "message",
                        description: Text("Vos conversations apparaîtront ici.")
                    )
                }
            }
            .navigationTitle("Messages")
            .task {
                await viewModel.loadConversations()
            }
            .refreshable {
                await viewModel.loadConversations()
            }
        }
    }
}

// ── Conversation Row ──

struct ConversationRow: View {
    let conversation: Conversation

    var body: some View {
        HStack(spacing: 12) {
            // Icon
            ZStack {
                Circle()
                    .fill(iconColor.opacity(0.15))
                Image(systemName: iconName)
                    .font(.subheadline)
                    .foregroundStyle(iconColor)
            }
            .frame(width: 40, height: 40)

            VStack(alignment: .leading, spacing: 4) {
                Text(conversation.titre ?? conversation.type.name)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .lineLimit(1)

                if let last = conversation.lastMessage {
                    Text(last.contenu)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            Spacer()

            if let last = conversation.lastMessage {
                Text(formatDate(last.createdAt))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }

    private var iconName: String {
        switch conversation.type.name {
        case "IA": return "sparkles"
        case "CLASSE": return "person.3.fill"
        case "PROMO": return "megaphone.fill"
        case "EQUIPE": return "person.2.fill"
        case "STAFF": return "building.2.fill"
        default: return "message.fill"
        }
    }

    private var iconColor: Color {
        switch conversation.type.name {
        case "IA": return .sectPurple
        case "CLASSE": return .sectGreen
        case "PROMO": return .sectOrange
        case "EQUIPE": return .sectBlue
        default: return .sectGreen
        }
    }

    private func formatDate(_ instant: String) -> String {
        let date = Date(timeIntervalSince1970: Double(instant.toEpochMilliseconds()) / 1000.0)
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = Locale(identifier: "fr_FR")
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}

// ── Profile View (Tab) ──

struct ProfileView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @StateObject var profileVM = ProfileViewModel()

    var body: some View {
        NavigationStack {
            List {
                // User info header
                Section {
                    HStack(spacing: 16) {
                        ZStack {
                            Circle()
                                .fill(Color.sectGreen.opacity(0.15))
                            Image(systemName: "person.fill")
                                .font(.title2)
                                .foregroundStyle(.sectGreen)
                        }
                        .frame(width: 50, height: 50)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(authVM.currentUser?.name ?? "—")
                                .font(.headline)
                            Text(authVM.currentUser?.email ?? "—")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Section("Compte") {
                    HStack {
                        Text("Rôle")
                        Spacer()
                        Text(authVM.currentUser?.role.name ?? "—")
                            .foregroundStyle(.secondary)
                    }
                    HStack {
                        Text("Établissement")
                        Spacer()
                        Text(authVM.currentUser?.etablissement?.nom ?? "—")
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    if let matricule = authVM.currentUser?.matricule {
                        HStack {
                            Text("Matricule")
                            Spacer()
                            Text(matricule)
                                .foregroundStyle(.secondary)
                        }
                    }
                    if let niveau = authVM.currentUser?.niveau {
                        HStack {
                            Text("Niveau")
                            Spacer()
                            Text(niveau)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Section {
                    NavigationLink {
                        SettingsView()
                    } label: {
                        Label("Paramètres", systemImage: "gearshape.fill")
                    }

                    NavigationLink {
                        ResultsView(session: nil)
                    } label: {
                        Label("Mes résultats", systemImage: "chart.bar.fill")
                    }
                }

                Section {
                    Button(role: .destructive) {
                        Task { await authVM.logout() }
                    } label: {
                        HStack {
                            Image(systemName: "rectangle.portrait.and.arrow.right")
                            Text("Déconnexion")
                        }
                    }
                }
            }
            .navigationTitle("Profil")
            .task {
                await profileVM.loadProfile()
            }
        }
    }
}
