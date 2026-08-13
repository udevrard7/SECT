// SECT Mobile — iOS Dashboard View (SwiftUI)
import SwiftUI

struct DashboardView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    // Carte de bienvenue
                    WelcomeCard()
                    
                    // Raccourcis rapides
                    LazyVGrid(columns: [
                        GridItem(.flexible()),
                        GridItem(.flexible())
                    ], spacing: 16) {
                        QuickActionCard(title: "Épreuves", icon: "doc.text.fill", color: .sectGreen)
                        QuickActionCard(title: "Résultats", icon: "chart.bar.fill", color: .sectBlue)
                        QuickActionCard(title: "Messages", icon: "message.fill", color: .sectOrange)
                        QuickActionCard(title: "Certificats", icon: "certificate.fill", color: .sectPurple)
                    }
                    .padding(.horizontal)
                    
                    // Épreuves à venir
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Épreuves à venir")
                            .font(.headline)
                            .padding(.horizontal)
                        
                        // TODO: Liste des épreuves depuis le repository
                        Text("Aucune épreuve planifiée")
                            .foregroundStyle(.secondary)
                            .padding(.horizontal)
                    }
                }
                .padding(.vertical)
            }
            .navigationTitle("SECT")
        }
    }
}

struct WelcomeCard: View {
    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("Bienvenue")
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

// ── Épreuves View ──
struct EpreuvesView: View {
    var body: some View {
        NavigationStack {
            List {
                Text("Épreuves — à implémenter avec Shared repository")
            }
            .navigationTitle("Épreuves")
        }
    }
}

// ── Messagerie View ──
struct MessagerieView: View {
    var body: some View {
        NavigationStack {
            List {
                Text("Messages — à implémenter avec Shared repository")
            }
            .navigationTitle("Messages")
        }
    }
}

// ── Profile View ──
struct ProfileView: View {
    @EnvironmentObject var authVM: AuthViewModel
    
    var body: some View {
        NavigationStack {
            List {
                Section("Compte") {
                    HStack {
                        Text("Email")
                        Spacer()
                        Text(authVM.currentUser?.email ?? "—")
                            .foregroundStyle(.secondary)
                    }
                    HStack {
                        Text("Rôle")
                        Spacer()
                        Text(authVM.currentUser?.role.name ?? "—")
                            .foregroundStyle(.secondary)
                    }
                }
                
                Section {
                    Button(role: .destructive) {
                        Task { await authVM.logout() }
                    } label: {
                        Text("Déconnexion")
                    }
                }
            }
            .navigationTitle("Profil")
        }
    }
}
