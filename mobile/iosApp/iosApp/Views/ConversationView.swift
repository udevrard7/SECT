// SECT Mobile — iOS Conversation View (SwiftUI)
import SwiftUI
import Shared

struct ConversationView: View {
    @StateObject var viewModel = MessagerieViewModel()
    let conversation: Conversation

    @FocusState private var isInputFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            // ── Messages List ──
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12) {
                        if viewModel.isLoadingMessages {
                            ProgressView()
                        }
                        ForEach(viewModel.messages, id: \.id) { message in
                            MessageBubble(message: message)
                                .id(message.id)
                        }
                    }
                    .padding()
                }
                .onChange(of: viewModel.messages.count) { _ in
                    if let lastId = viewModel.messages.last?.id {
                        withAnimation {
                            proxy.scrollTo(lastId, anchor: .bottom)
                        }
                    }
                }
            }

            Divider()

            // ── Input Field ──
            HStack(spacing: 12) {
                TextField("Message…", text: $viewModel.newMessageText, axis: .vertical)
                    .lineLimit(1...5)
                    .textFieldStyle(.plain)
                    .padding(10)
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 20))
                    .focused($isInputFocused)

                Button {
                    Task { await viewModel.sendMessage() }
                } label: {
                    Image(systemName: "paperplane.fill")
                        .font(.title3)
                        .foregroundStyle(viewModel.newMessageText.trimmingCharacters(in: .whitespaces).isEmpty ? .gray : .sectGreen)
                }
                .disabled(viewModel.newMessageText.trimmingCharacters(in: .whitespaces).isEmpty || viewModel.isSendingMessage)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color(UIColor.systemBackground))
        }
        .navigationTitle(conversation.titre ?? "Conversation")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Fermer") {
                    isInputFocused = false
                }
            }
        }
        .task {
            await viewModel.selectConversation(conversation)
        }
    }
}

// ── Message Bubble ──

struct MessageBubble: View {
    let message: Message
    @EnvironmentObject var authVM: AuthViewModel

    private var isOwnMessage: Bool {
        message.expediteurId == authVM.currentUser?.id
    }

    var body: some View {
        HStack {
            if isOwnMessage { Spacer(minLength: 60) }

            VStack(alignment: isOwnMessage ? .trailing : .leading, spacing: 4) {
                if !isOwnMessage, let sender = message.expediteur {
                    Text(sender.name)
                        .font(.caption)
                        .foregroundStyle(.sectGreen)
                        .fontWeight(.medium)
                }

                Text(message.contenu)
                    .font(.body)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(isOwnMessage ? Color.sectGreen.opacity(0.15) : Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                    .frame(maxWidth: 280, alignment: isOwnMessage ? .trailing : .leading)

                Text(formatTime(message.createdAt))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            if !isOwnMessage { Spacer(minLength: 60) }
        }
    }

    private func formatTime(_ instant: String) -> String {
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = isoFormatter.date(from: instant) ?? Date()
        let formatter = DateFormatter()
        formatter.dateStyle = .none
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}
