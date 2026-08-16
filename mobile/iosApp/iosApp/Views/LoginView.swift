// SECT Mobile — iOS Login View (SwiftUI)
import SwiftUI

struct LoginView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @State private var identifier = ""
    @State private var password = ""
    @State private var showPasswordReset = false
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                // Logo
                VStack(spacing: 8) {
                    Text("SECT")
                        .font(.largeTitle)
                        .fontWeight(.bold)
                        .foregroundStyle(.sectGreen)
                    Text("Système d'Évaluation")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.bottom, 32)
                
                // Form
                VStack(spacing: 16) {
                    TextField("Email ou Matricule", text: $identifier)
                        .textFieldStyle(.roundedBorder)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    
                    SecureField("Mot de passe", text: $password)
                        .textFieldStyle(.roundedBorder)
                    
                    // SECT-RBAC-MOBILE-1: Afficher erreur de rôle bloqué (ADMIN/RESPONSABLE)
                    if let blockedError = authVM.blockedRoleError {
                        VStack(spacing: 8) {
                            Image(systemName: "exclamationmark.shield.fill")
                                .font(.title2)
                                .foregroundStyle(.sectOrange)
                            Text(blockedError)
                                .font(.caption)
                                .foregroundStyle(.sectOrange)
                                .multilineTextAlignment(.center)
                        }
                        .padding()
                        .frame(maxWidth: .infinity)
                        .background(Color.sectOrange.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    } else if let error = authVM.error {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                    
                    Button {
                        Task { await authVM.login(identifier: identifier, password: password) }
                    } label: {
                        if authVM.isLoading {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Text("Se connecter")
                                .fontWeight(.semibold)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color.sectGreen)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .disabled(identifier.isEmpty || password.isEmpty || authVM.isLoading)
                }
                .padding(.horizontal, 24)
                
                Button("Mot de passe oublié ?") {
                    showPasswordReset = true
                }
                .font(.footnote)
                .foregroundStyle(.sectGreen)
            }
            .navigationDestination(isPresented: $showPasswordReset) {
                PasswordResetView()
            }
        }
    }
}

// ── Mot de passe oublié ──
struct PasswordResetView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @State private var email = ""
    @State private var isSuccess = false

    var body: some View {
        Form {
            Section {
                TextField("Email", text: $email)
                    .textInputAutocapitalization(.never)

                Button {
                    Task {
                        await authVM.requestPasswordReset(email: email)
                        if authVM.error == nil {
                            isSuccess = true
                        }
                    }
                } label: {
                    if authVM.isLoading {
                        ProgressView()
                    } else {
                        Text("Envoyer")
                    }
                }
                .disabled(email.isEmpty || authVM.isLoading)
            } header: {
                Text("Réinitialiser le mot de passe")
            }

            if let error = authVM.error {
                Section {
                    Text(error)
                        .foregroundStyle(.red)
                }
            }

            if isSuccess {
                Section {
                    Text("Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.")
                        .foregroundStyle(.green)
                }
            }
        }
    }
}
