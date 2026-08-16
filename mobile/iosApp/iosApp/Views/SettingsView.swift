// SECT Mobile — iOS Settings View (SwiftUI)
import SwiftUI
import Shared

struct SettingsView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @AppStorage("isDarkTheme") private var isDarkTheme = false
    @AppStorage("isBiometricEnabled") private var isBiometricEnabled = false
    @AppStorage("isNotificationsEnabled") private var isNotificationsEnabled = true
    @AppStorage("isAutoSaveEnabled") private var isAutoSaveEnabled = true
    @AppStorage("autoSaveInterval") private var autoSaveInterval: Int = 30

    @State private var showLogoutConfirmation = false
    @State private var showPasswordChange = false

    var body: some View {
        NavigationStack {
            Form {
                // ── Appearance ──
                Section("Apparence") {
                    Toggle(isOn: $isDarkTheme) {
                        Label("Thème sombre", systemImage: "moon.fill")
                    }
                    .tint(.sectGreen)
                    .onChange(of: isDarkTheme) { newValue in
                        setDarkTheme(newValue)
                    }
                }

                // ── Security ──
                Section("Sécurité") {
                    Toggle(isOn: $isBiometricEnabled) {
                        Label("Authentification biométrique", systemImage: "faceid")
                    }
                    .tint(.sectGreen)

                    Button {
                        showPasswordChange = true
                    } label: {
                        Label("Changer le mot de passe", systemImage: "key.fill")
                    }
                    .foregroundStyle(.primary)
                }

                // ── Notifications ──
                Section("Notifications") {
                    Toggle(isOn: $isNotificationsEnabled) {
                        Label("Notifications push", systemImage: "bell.fill")
                    }
                    .tint(.sectGreen)
                }

                // ── Exam Settings ──
                Section("Passation d'épreuves") {
                    Toggle(isOn: $isAutoSaveEnabled) {
                        Label("Auto-sauvegarde", systemImage: "floppydisk.fill")
                    }
                    .tint(.sectGreen)

                    if isAutoSaveEnabled {
                        Stepper(value: $autoSaveInterval, in: 10...120, step: 10) {
                            HStack {
                                Label("Intervalle", systemImage: "timer")
                                Spacer()
                                Text("\(autoSaveInterval) sec")
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                // ── Account ──
                Section("Compte") {
                    HStack {
                        Label("Email", systemImage: "envelope.fill")
                        Spacer()
                        Text(authVM.currentUser?.email ?? "—")
                            .foregroundStyle(.secondary)
                    }

                    HStack {
                        Label("Rôle", systemImage: "person.badge.key.fill")
                        Spacer()
                        Text(authVM.currentUser?.role.name ?? "—")
                            .foregroundStyle(.secondary)
                    }

                    HStack {
                        Label("Établissement", systemImage: "building.2.fill")
                        Spacer()
                        Text(authVM.currentUser?.etablissement?.nom ?? "—")
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }

                // ── About ──
                Section("À propos") {
                    HStack {
                        Label("Version", systemImage: "info.circle.fill")
                        Spacer()
                        Text("1.0.0")
                            .foregroundStyle(.secondary)
                    }

                    Link(destination: URL(string: "https://sect-zead.onrender.com")!) {
                        Label("Site web", systemImage: "globe")
                    }
                }

                // ── Logout ──
                Section {
                    Button(role: .destructive) {
                        showLogoutConfirmation = true
                    } label: {
                        HStack {
                            Image(systemName: "rectangle.portrait.and.arrow.right")
                            Text("Déconnexion")
                        }
                    }
                }
            }
            .navigationTitle("Paramètres")
            .alert("Déconnexion", isPresented: $showLogoutConfirmation) {
                Button("Annuler", role: .cancel) { }
                Button("Déconnexion", role: .destructive) {
                    Task { await authVM.logout() }
                }
            } message: {
                Text("Voulez-vous vous déconnecter ?")
            }
            .sheet(isPresented: $showPasswordChange) {
                PasswordChangeView()
            }
        }
    }

    private func setDarkTheme(_ dark: Bool) {
        // Apply appearance change
        if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene {
            windowScene.windows.forEach { window in
                window.overrideUserInterfaceStyle = dark ? .dark : .light
            }
        }
    }
}

// ── Password Change View ──

struct PasswordChangeView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @StateObject private var profileVM = ProfileViewModel()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Changer le mot de passe") {
                    SecureField("Mot de passe actuel", text: $profileVM.currentPassword)
                    SecureField("Nouveau mot de passe", text: $profileVM.newPassword)
                    SecureField("Confirmer le mot de passe", text: $profileVM.confirmPassword)

                    if let error = profileVM.passwordValidationError {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.sectRed)
                    }

                    if let error = profileVM.error {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.sectRed)
                    }
                }

                Section {
                    Button {
                        Task {
                            await profileVM.changePassword()
                            if profileVM.passwordChangeSuccess {
                                dismiss()
                            }
                        }
                    } label: {
                        if profileVM.isChangingPassword {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Text("Enregistrer")
                                .fontWeight(.semibold)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .disabled(!profileVM.isPasswordValid || profileVM.isChangingPassword)
                    .tint(.sectGreen)
                }

                if profileVM.passwordChangeSuccess {
                    Section {
                        Label("Mot de passe modifié avec succès", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(.sectGreen)
                    }
                }
            }
            .navigationTitle("Mot de passe")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Fermer") { dismiss() }
                }
            }
        }
    }
}
