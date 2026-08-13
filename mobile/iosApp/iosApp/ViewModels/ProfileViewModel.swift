// SECT Mobile — iOS Profile ViewModel
import SwiftUI
import Shared

@MainActor
class ProfileViewModel: ObservableObject {
    @Published var user: User? = nil
    @Published var isLoading = false
    @Published var isChangingPassword = false
    @Published var error: String? = nil
    @Published var passwordChangeSuccess = false

    // Password change fields
    @Published var currentPassword: String = ""
    @Published var newPassword: String = ""
    @Published var confirmPassword: String = ""

    private let repository = KmpRepositoryProvider.shared.repository()

    // ── Load Profile ──

    func loadProfile() async {
        isLoading = true
        error = nil
        do {
            user = try await repository.getCurrentUser()
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    // ── Change Password ──

    var isPasswordValid: Bool {
        !currentPassword.isEmpty &&
        newPassword.count >= 8 &&
        newPassword == confirmPassword
    }

    var passwordValidationError: String? {
        if currentPassword.isEmpty { return nil }
        if newPassword.count < 8 { return "Le nouveau mot de passe doit contenir au moins 8 caractères" }
        if newPassword != confirmPassword { return "Les mots de passe ne correspondent pas" }
        return nil
    }

    func changePassword() async {
        guard isPasswordValid else { return }
        isChangingPassword = true
        error = nil
        passwordChangeSuccess = false
        do {
            try await repository.changePassword(
                currentPassword: currentPassword,
                newPassword: newPassword
            )
            passwordChangeSuccess = true
            currentPassword = ""
            newPassword = ""
            confirmPassword = ""
        } catch {
            self.error = error.localizedDescription
        }
        isChangingPassword = false
    }
}
