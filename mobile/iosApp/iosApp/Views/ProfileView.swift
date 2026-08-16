//
//  ProfileView.swift
//  SECT Mobile iOS
//
//  Vue de profil utilisateur avec paramètres
//  Inspirée de /frontend/src/app/profile/page.tsx et /frontend/src/app/settings/page.tsx
//

import SwiftUI
import Shared

struct ProfileView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var profileViewModel: ProfileViewModel
    @State private var showingLogoutAlert = false
    @State private var showingChangePassword = false
    @State private var showingSettings = false
    
    private var user: User? {
        authViewModel.currentUser
    }
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 24) {
                    // Profile Header
                    profileHeader
                    
                    // Info Cards
                    userInfoCard
                    
                    // Quick Actions
                    quickActionsCard
                    
                    // Settings Section
                    settingsSection
                    
                    // Danger Zone
                    dangerZone
                }
                .padding()
            }
            .navigationTitle("Profil")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: {
                        showingSettings = true
                    }) {
                        Image(systemName: "gearshape.fill")
                            .foregroundColor(.sectGreen)
                    }
                }
            }
            .sheet(isPresented: $showingChangePassword) {
                ChangePasswordView()
                    .environmentObject(profileViewModel)
            }
            .sheet(isPresented: $showingSettings) {
                SettingsView()
                    .environmentObject(profileViewModel)
            }
            .alert("Déconnexion", isPresented: $showingLogoutAlert) {
                Button("Annuler", role: .cancel) {}
                Button("Se déconnecter", role: .destructive) {
                    Task {
                        await authViewModel.logout()
                    }
                }
            } message: {
                Text("Êtes-vous sûr de vouloir vous déconnecter ?")
            }
        }
    }
    
    // MARK: - Profile Header
    
    private var profileHeader: some View {
        VStack(spacing: 16) {
            // Avatar
            ZStack {
                Circle()
                    .fill(Color.sectBlue.opacity(0.2))
                    .frame(width: 100, height: 100)
                
                if let imageUrl = user?.image, !imageUrl.isEmpty {
                    AsyncImage(url: URL(string: imageUrl)) { image in
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(width: 100, height: 100)
                            .clipShape(Circle())
                    } placeholder: {
                        Image(systemName: "person.fill")
                            .font(.system(size: 40))
                            .foregroundColor(.sectBlue)
                    }
                } else {
                    Image(systemName: "person.fill")
                        .font(.system(size: 40))
                        .foregroundColor(.sectBlue)
                }
            }
            
            // Name & Role
            VStack(spacing: 4) {
                Text(user?.name ?? "Utilisateur")
                    .font(.title2)
                    .fontWeight(.bold)
                
                if let role = user?.role {
                    HStack {
                        Badge(text: role.name.capitalized, color: roleBadgeColor(for: role))
                    }
                }
                
                Text(user?.email ?? "")
                    .font(.subheadline)
                    .foregroundColor(.gray)
            }
        }
        .padding(.vertical, 24)
        .frame(maxWidth: .infinity)
        .background(Color(.systemBackground))
        .cornerRadius(16)
        .shadow(color: Color.black.opacity(0.05), radius: 8, x: 0, y: 2)
    }
    
    // MARK: - User Info Card
    
    private var userInfoCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Informations personnelles")
                .font(.headline)
                .foregroundColor(.secondary)
            
            InfoRow(label: "Établissement", value: user?.etablissement?.nom ?? "N/A")
            InfoRow(label: "Filière", value: user?.filiere?.nom ?? "N/A")
            InfoRow(label: "Niveau", value: user?.niveau ?? "N/A")
            
            if let matricule = user?.matricule {
                InfoRow(label: "Matricule", value: matricule)
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(16)
        .shadow(color: Color.black.opacity(0.05), radius: 8, x: 0, y: 2)
    }
    
    // MARK: - Quick Actions Card
    
    private var quickActionsCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Actions rapides")
                .font(.headline)
                .foregroundColor(.secondary)
            
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                QuickActionButton(
                    icon: "lock.shield",
                    title: "Changer mot de passe",
                    color: .sectBlue
                ) {
                    showingChangePassword = true
                }
                
                QuickActionButton(
                    icon: "doc.badge.gearshape",
                    title: "Certificats",
                    color: .sectGreen
                ) {
                    // Navigation vers certificats
                }
                
                QuickActionButton(
                    icon: "chart.bar",
                    title: "Statistiques",
                    color: .sectPurple
                ) {
                    // Navigation vers stats
                }
                
                QuickActionButton(
                    icon: "bell",
                    title: "Notifications",
                    color: .sectOrange
                ) {
                    showingSettings = true
                }
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(16)
        .shadow(color: Color.black.opacity(0.05), radius: 8, x: 0, y: 2)
    }
    
    // MARK: - Settings Section
    
    private var settingsSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Paramètres")
                .font(.headline)
                .foregroundColor(.secondary)
            
            SettingsRow(icon: "bell", title: "Notifications", subtitle: "Gérer les alertes") {
                showingSettings = true
            }
            
            SettingsRow(icon: "moon", title: "Mode sombre", subtitle: "Apparence") {
                showingSettings = true
            }
            
            SettingsRow(icon: "globe", title: "Langue", subtitle: "Français") {
                showingSettings = true
            }
            
            SettingsRow(icon: "touchid", title: "Biométrie", subtitle: "Connexion rapide") {
                showingSettings = true
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(16)
        .shadow(color: Color.black.opacity(0.05), radius: 8, x: 0, y: 2)
    }
    
    // MARK: - Danger Zone
    
    private var dangerZone: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Zone sensible")
                .font(.headline)
                .foregroundColor(.sectRed)
            
            Button(action: {
                showingLogoutAlert = true
            }) {
                HStack {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                    Text("Se déconnecter")
                    Spacer()
                }
                .foregroundColor(.sectRed)
                .padding()
                .background(Color.sectRed.opacity(0.1))
                .cornerRadius(12)
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(16)
        .shadow(color: Color.black.opacity(0.05), radius: 8, x: 0, y: 2)
    }
    
    // MARK: - Helpers
    
    private func roleBadgeColor(for role: Role) -> Color {
        switch role {
        case .etudiant: return .sectBlue
        case .enseignant: return .sectGreen
        case .responsable: return .sectPurple
        case .admin: return .sectRed
        default: return .gray
        }
    }
}

// MARK: - Info Row

struct InfoRow: View {
    let label: String
    let value: String
    
    var body: some View {
        HStack {
            Text(label)
                .foregroundColor(.secondary)
            Spacer()
            Text(value)
                .fontWeight(.medium)
        }
        .font(.subheadline)
    }
}

// MARK: - Quick Action Button

struct QuickActionButton: View {
    let icon: String
    let title: String
    let color: Color
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.title2)
                    .foregroundColor(.white)
                    .frame(width: 50, height: 50)
                    .background(color)
                    .clipShape(Circle())
                
                Text(title)
                    .font(.caption)
                    .multilineTextAlignment(.center)
                    .foregroundColor(.primary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(color.opacity(0.1))
            .cornerRadius(12)
        }
    }
}

// MARK: - Settings Row

struct SettingsRow: View {
    let icon: String
    let title: String
    let subtitle: String
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack {
                Image(systemName: icon)
                    .font(.title3)
                    .foregroundColor(.sectGreen)
                    .frame(width: 30)
                
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.subheadline)
                        .fontWeight(.medium)
                    Text(subtitle)
                        .font(.caption2)
                        .foregroundColor(.gray)
                }
                
                Spacer()
                
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundColor(.gray)
            }
            .padding(.vertical, 4)
        }
    }
}

// MARK: - Change Password View (Placeholder)

struct ChangePasswordView: View {
    @EnvironmentObject var profileViewModel: ProfileViewModel
    @Environment(\.dismiss) var dismiss
    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    
    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Sécurité")) {
                    SecureField("Mot de passe actuel", text: $currentPassword)
                    SecureField("Nouveau mot de passe", text: $newPassword)
                    SecureField("Confirmer le mot de passe", text: $confirmPassword)
                }
            }
            .navigationTitle("Changer mot de passe")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") {
                        dismiss()
                    }
                }
                
                ToolbarItem(placement: .confirmationAction) {
                    Button("Enregistrer") {
                        // TODO: Call profileViewModel.changePassword
                        dismiss()
                    }
                    .disabled(newPassword != confirmPassword || newPassword.isEmpty)
                }
            }
        }
    }
}

// MARK: - Preview

#Preview {
    ProfileView()
        .environmentObject(AuthViewModel())
        .environmentObject(ProfileViewModel())
}
