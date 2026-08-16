//
//  MessagerieView.swift
//  SECT Mobile iOS
//
//  Vue principale pour la messagerie (conversations et messages)
//  Inspirée de /frontend/src/app/messagerie/page.tsx
//

import SwiftUI
import Shared

struct MessagerieView: View {
    @EnvironmentObject var viewModel: MessagerieViewModel
    @EnvironmentObject var authViewModel: AuthViewModel
    @State private var showingNewConversation = false
    
    private var unreadCount: Int {
        viewModel.conversations.reduce(0) { count, conversation in
            count + Int(conversation.unreadCount)
        }
    }
    
    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                if viewModel.isLoadingConversations {
                    loadingView
                } else if viewModel.error != nil {
                    errorView
                } else if viewModel.conversations.isEmpty {
                    emptyStateView
                } else {
                    conversationsList
                }
            }
            .navigationTitle("Messages")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    HStack(spacing: 16) {
                        // Badge notifications
                        if unreadCount > 0 {
                            Badge(text: "\(unreadCount)", color: .sectOrange)
                        }
                        
                        // Refresh button
                        Button(action: {
                            Task { await viewModel.loadConversations() }
                        }) {
                            Image(systemName: "arrow.clockwise")
                                .foregroundColor(.sectGreen)
                        }
                        
                        // Nouvelle conversation
                        Button(action: {
                            showingNewConversation = true
                        }) {
                            Image(systemName: "plus.circle.fill")
                                .foregroundColor(.sectGreen)
                        }
                    }
                }
            }
            .sheet(isPresented: $showingNewConversation) {
                NewConversationView()
                    .environmentObject(viewModel)
            }
            .onAppear {
                Task { await viewModel.loadConversations() }
            }
        }
    }
    
    // MARK: - Views
    
    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.5)
            Text("Chargement des conversations...")
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
                Task { await viewModel.loadConversations() }
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
            Image(systemName: "message.badge.filled")
                .font(.system(size: 50))
                .foregroundColor(.gray.opacity(0.5))
            
            Text("Aucune conversation")
                .font(.headline)
                .foregroundColor(.gray)
            
            Text("Vos conversations apparaîtront ici")
                .font(.subheadline)
                .foregroundColor(.gray)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            
            Button(action: {
                showingNewConversation = true
            }) {
                HStack {
                    Image(systemName: "plus.circle.fill")
                    Text("Nouvelle conversation")
                }
                .fontWeight(.semibold)
                .foregroundColor(.white)
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .background(Color.sectGreen)
                .cornerRadius(10)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }
    
    private var conversationsList: some View {
        ScrollView {
            LazyVStack(spacing: 8) {
                ForEach(viewModel.conversations, id: \.id) { conversation in
                    ConversationRow(conversation: conversation)
                }
            }
            .padding(.vertical, 8)
        }
        .refreshable {
            await viewModel.loadConversations()
        }
    }
}

// MARK: - Conversation Row

struct ConversationRow: View {
    let conversation: Conversation
    @EnvironmentObject var viewModel: MessagerieViewModel
    
    private var lastMessageDate: String {
        guard let isoString = conversation.lastMessage?.createdAt else { return "" }
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = isoFormatter.date(from: isoString) else { return "" }
        let calendar = Calendar.current
        
        if calendar.isDateInToday(date) {
            return date.formatted(date: .omitted, time: .shortened)
        } else if calendar.isDateInYesterday(date) {
            return "Hier"
        } else {
            return date.formatted(date: .abbreviated, time: .omitted)
        }
    }
    
    var body: some View {
        NavigationLink(destination: ConversationView(conversation: conversation)) {
            HStack(spacing: 12) {
                // Avatar
                ZStack {
                    Circle()
                        .fill(Color.sectBlue.opacity(0.2))
                        .frame(width: 50, height: 50)
                    
                    Image(systemName: "person.fill")
                        .foregroundColor(.sectBlue)
                }
                
                // Content
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(conversation.titre ?? "Conversation")
                            .font(.headline)
                            .lineLimit(1)
                        
                        Spacer()
                        
                        Text(lastMessageDate)
                            .font(.caption2)
                            .foregroundColor(.gray)
                    }
                    
                    Text(conversation.lastMessage?.contenu ?? "")
                        .font(.subheadline)
                        .foregroundColor(.gray)
                        .lineLimit(2)
                }
                
                // Unread badge
                let unreadCount = Int(conversation.unreadCount)
                if unreadCount > 0 {
                    Spacer()
                    
                    Badge(text: "\(unreadCount)", color: .sectOrange)
                        .frame(minWidth: 20, minHeight: 20)
                }
            }
            .padding()
            .background(Color(.systemBackground))
            .cornerRadius(12)
            .shadow(color: Color.black.opacity(0.03), radius: 2, x: 0, y: 1)
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - New Conversation View

struct NewConversationView: View {
    @EnvironmentObject var viewModel: MessagerieViewModel
    @Environment(\.dismiss) var dismiss
    @State private var searchText = ""
    @State private var selectedUserId: String? = nil
    
    private var filteredUsers: [User] {
        if searchText.isEmpty {
            return viewModel.availableUsers
        }
        return viewModel.availableUsers.filter {
            $0.name.localizedCaseInsensitiveContains(searchText) ||
            $0.email.localizedCaseInsensitiveContains(searchText)
        }
    }
    
    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Search bar
                HStack {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(.gray)
                    
                    TextField("Rechercher un utilisateur...", text: $searchText)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                }
                .padding()
                
                // Users list
                if viewModel.isLoadingUsers {
                    ProgressView()
                        .padding()
                } else if filteredUsers.isEmpty {
                    VStack(spacing: 16) {
                        Image(systemName: "person.crop.circle.badge.exclamationmark")
                            .font(.system(size: 40))
                            .foregroundColor(.gray)
                        
                        Text(searchText.isEmpty 
                             ? "Aucun utilisateur disponible" 
                             : "Aucun résultat trouvé")
                            .foregroundColor(.gray)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List(filteredUsers, id: \.id) { user in
                        HStack {
                            // Avatar
                            if let imageUrl = user.image, !imageUrl.isEmpty {
                                AsyncImage(url: URL(string: imageUrl)) { image in
                                    image
                                        .resizable()
                                        .frame(width: 40, height: 40)
                                        .clipShape(Circle())
                                } placeholder: {
                                    Circle()
                                        .fill(Color.sectBlue.opacity(0.2))
                                        .frame(width: 40, height: 40)
                                        .overlay(
                                            Image(systemName: "person.fill")
                                                .foregroundColor(.sectBlue)
                                        )
                                }
                            } else {
                                Circle()
                                    .fill(Color.sectBlue.opacity(0.2))
                                    .frame(width: 40, height: 40)
                                    .overlay(
                                        Image(systemName: "person.fill")
                                            .foregroundColor(.sectBlue)
                                    )
                            }
                            
                            // Info
                            VStack(alignment: .leading, spacing: 2) {
                                Text(user.name)
                                    .font(.headline)
                                Text(user.email)
                                    .font(.subheadline)
                                    .foregroundColor(.gray)
                            }
                            
                            Spacer()
                            
                            // Selection checkmark
                            if selectedUserId == user.id {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundColor(.sectGreen)
                            }
                        }
                        .contentShape(Rectangle())
                        .onTapGesture {
                            selectedUserId = user.id
                        }
                    }
                }
            }
            .navigationTitle("Nouvelle conversation")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") {
                        dismiss()
                    }
                }
                
                ToolbarItem(placement: .confirmationAction) {
                    Button("Créer") {
                        if let userId = selectedUserId {
                            Task {
                                await viewModel.createConversation(otherUserId: userId)
                                dismiss()
                            }
                        }
                    }
                    .disabled(selectedUserId == nil)
                }
            }
            .onAppear {
                Task {
                    await viewModel.loadAvailableUsers()
                }
            }
        }
    }
}

// MARK: - Preview

#Preview {
    MessagerieView()
        .environmentObject(MessagerieViewModel())
        .environmentObject(AuthViewModel())
}
