//
//  EpreuvesView.swift
//  SECT Mobile iOS
//
//  Vue principale pour la liste des épreuves (Enseignant & Étudiant)
//  Inspirée de /frontend/src/app/epreuves/page.tsx
//

import SwiftUI
import Shared

struct EpreuvesView: View {
    @EnvironmentObject var viewModel: EpreuveViewModel
    @EnvironmentObject var authViewModel: AuthViewModel
    @State private var searchText = ""
    @State private var selectedFilter: StatutEpreuve? = nil
    
    private var isEnseignant: Bool {
        authViewModel.currentUser?.role == .enseignant
    }
    
    private var filteredEpreuves: [Epreuve] {
        var result = viewModel.epreuves
        
        // Filtre par recherche
        if !searchText.isEmpty {
            result = result.filter { $0.titre.localizedCaseInsensitiveContains(searchText) }
        }
        
        // Filtre par statut
        if let filter = selectedFilter {
            result = result.filter { $0.statut == filter }
        }
        
        return result
    }
    
    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Barre de recherche et filtres
                searchBar
                
                // Liste des épreuves
                if viewModel.isLoading {
                    loadingView
                } else if viewModel.error != nil {
                    errorView
                } else if filteredEpreuves.isEmpty {
                    emptyStateView
                } else {
                    epreuvesList
                }
            }
            .navigationTitle("Épreuves")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: {
                        viewModel.loadEpreuves()
                    }) {
                        Image(systemName: "arrow.clockwise")
                            .foregroundColor(.sectGreen)
                    }
                }
                
                if isEnseignant {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        NavigationLink(destination: CreateEpreuveView()) {
                            Image(systemName: "plus.circle.fill")
                                .foregroundColor(.sectGreen)
                        }
                    }
                }
            }
            .onAppear {
                viewModel.loadEpreuves()
            }
        }
    }
    
    // MARK: - Search Bar & Filters
    
    private var searchBar: some View {
        VStack(spacing: 12) {
            // Recherche
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(.gray)
                
                TextField("Rechercher une épreuve...", text: $searchText)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                
                if !searchText.isEmpty {
                    Button(action: { searchText = "" }) {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.gray)
                    }
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
            .background(Color(.systemGray6))
            .cornerRadius(10)
            .padding(.horizontal)
            .padding(.top, 8)
            
            // Filtres
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    FilterChip(
                        title: "Toutes",
                        isSelected: selectedFilter == nil,
                        action: { selectedFilter = nil }
                    )
                    
                    ForEach(StatutEpreuve.allCases, id: \.self) { statut in
                        FilterChip(
                            title: statut.nom,
                            isSelected: selectedFilter == statut,
                            action: { selectedFilter = statut }
                        )
                    }
                }
                .padding(.horizontal)
            }
        }
        .background(Color(.systemBackground))
    }
    
    // MARK: - Views
    
    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.5)
            Text("Chargement des épreuves...")
                .foregroundColor(.gray)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    
    private var errorView: some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 40))
                .foregroundColor(.sectOrange)
            
            Text("Une erreur est survenue")
                .font(.headline)
            
            Text(viewModel.error ?? "Erreur inconnue")
                .font(.subheadline)
                .foregroundColor(.gray)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            
            Button(action: {
                viewModel.loadEpreuves()
            }) {
                Text("Réessayer")
                    .fontWeight(.semibold)
                    .foregroundColor(.white)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 12)
                    .background(Color.sectGreen)
                    .cornerRadius(10)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    
    private var emptyStateView: some View {
        VStack(spacing: 16) {
            Image(systemName: "doc.text.magnifyingglass")
                .font(.system(size: 50))
                .foregroundColor(.gray.opacity(0.5))
            
            Text("Aucune épreuve trouvée")
                .font(.headline)
                .foregroundColor(.gray)
            
            Text(searchText.isEmpty 
                 ? "Les épreuves apparaîtront ici" 
                 : "Essayez avec d'autres critères")
                .font(.subheadline)
                .foregroundColor(.gray)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            
            if isEnseignant && searchText.isEmpty && selectedFilter == nil {
                Button(action: {
                    // Navigation vers création
                }) {
                    HStack {
                        Image(systemName: "plus.circle.fill")
                        Text("Créer une épreuve")
                    }
                    .fontWeight(.semibold)
                    .foregroundColor(.white)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 12)
                    .background(Color.sectGreen)
                    .cornerRadius(10)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }
    
    private var epreuvesList: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(filteredEpreuves, id: \.id) { epreuve in
                    EpreuveCard(epreuve: epreuve, isEnseignant: isEnseignant)
                }
            }
            .padding()
        }
        .refreshable {
            await viewModel.loadEpreuves()
        }
    }
}

// MARK: - Filter Chip

struct FilterChip: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline)
                .fontWeight(isSelected ? .semibold : .regular)
                .foregroundColor(isSelected ? .white : .sectGreen)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(isSelected ? Color.sectGreen : Color.sectGreen.opacity(0.1))
                .cornerRadius(20)
        }
    }
}

// MARK: - Epreuve Card

struct EpreuveCard: View {
    let epreuve: Epreuve
    let isEnseignant: Bool
    
    private var statutColor: Color {
        switch epreuve.statut {
        case .brouillon: return .gray
        case .active: return .sectGreen
        case .terminee: return .sectBlue
        case .archivee: return .gray
        default: return .gray
        }
    }
    
    private var statutNom: String {
        epreuve.statut.nom
    }
    
    var body: some View {
        NavigationLink(destination: EpreuveDetailView(epreuve: epreuve)) {
            VStack(alignment: .leading, spacing: 12) {
                // Header
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(epreuve.titre)
                            .font(.headline)
                            .lineLimit(2)
                        
                        Text(epreuve.description ?? "")
                            .font(.subheadline)
                            .foregroundColor(.gray)
                            .lineLimit(1)
                    }
                    
                    Spacer()
                    
                    Badge(text: statutNom, color: statutColor)
                }
                
                Divider()
                
                // Info row
                HStack(spacing: 16) {
                    InfoLabel(icon: "clock", text: epreuve.dureeMinutes > 0 
                              ? "\(epreuve.dureeMinutes) min" 
                              : "Illimité")
                    
                    InfoLabel(icon: "questionmark.circle", text: "\(epreuve.questionsCount) questions")
                    
                    InfoLabel(icon: "star", text: "\(epreuve.pointsMax) pts")
                    
                    Spacer()
                }
                .font(.caption)
                .foregroundColor(.secondary)
                
                // Footer
                if let date = epreuve.dateCreation {
                    Text("Créée le \(date.formatted(date: .abbreviated, time: .shortened))")
                        .font(.caption2)
                        .foregroundColor(.gray)
                }
            }
            .padding()
            .background(Color(.systemBackground))
            .cornerRadius(12)
            .shadow(color: Color.black.opacity(0.05), radius: 4, x: 0, y: 2)
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - Info Label

struct InfoLabel: View {
    let icon: String
    let text: String
    
    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
            Text(text)
        }
    }
}

// MARK: - Badge

struct Badge: View {
    let text: String
    let color: Color
    
    var body: some View {
        Text(text)
            .font(.caption2)
            .fontWeight(.semibold)
            .foregroundColor(.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color)
            .cornerRadius(6)
    }
}

// MARK: - Create Epreuve View (Placeholder)

struct CreateEpreuveView: View {
    var body: some View {
        Text("Création d'épreuve")
            .navigationTitle("Nouvelle épreuve")
    }
}

// MARK: - Preview

#Preview {
    EpreuvesView()
        .environmentObject(EpreuveViewModel())
        .environmentObject(AuthViewModel())
}
