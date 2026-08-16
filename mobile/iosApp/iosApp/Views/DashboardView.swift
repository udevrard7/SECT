// SECT Mobile — iOS Dashboard View (SwiftUI) - RBAC: routage vers vue spécifique
import SwiftUI
import Shared

struct DashboardView: View {
    @StateObject var viewModel = DashboardViewModel()
    @EnvironmentObject var authVM: AuthViewModel

    var body: some View {
        NavigationStack {
            Group {
                // Routage RBAC : affichage de la vue spécifique selon le rôle
                if viewModel.isEnseignant {
                    EnseignantDashboardView(viewModel: viewModel)
                } else if viewModel.isEtudiant {
                    EtudiantDashboardView(viewModel: viewModel)
                } else {
                    // Cas ADMIN/RESPONSABLE : message d'avertissement (déjà géré par AuthViewModel)
                    RoleRestrictedView()
                }
            }
            .task {
                await viewModel.loadDashboard()
            }
        }
        .navigationTitle("SECT")
    }
}

// ── Vue pour rôles non autorisés (ADMIN/RESPONSABLE) ──

struct RoleRestrictedView: View {
    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(.sectOrange)
                
                Text("Accès restreint")
                    .font(.title2)
                    .fontWeight(.bold)
                
                Text("L'application mobile est réservée aux enseignants et étudiants.\n\nLes administrateurs et responsables doivent utiliser l'interface web.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                
                Link(destination: URL(string: "https://sect.app")!) {
                    HStack {
                        Image(systemName: "safari.fill")
                        Text("Ouvrir l'interface web")
                    }
                    .font(.headline)
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(Color.sectGreen)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .padding(.horizontal)
            }
            .padding(.vertical, 48)
            .padding(.horizontal, 24)
        }
    }
}
