// SECT Mobile — iOS Passation View (Exam Taking View)
import SwiftUI
import Shared

struct PassationView: View {
    @StateObject var viewModel = PassationViewModel()
    let epreuveId: String

    @State private var showSubmitConfirmation = false
    @State private var showResults = false

    var body: some View {
        if viewModel.isSessionComplete {
            // ── Session Complete ──
            ResultsView(session: viewModel.session)
        } else if viewModel.isLoading {
            ProgressView("Démarrage de la session…")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            VStack(spacing: 0) {
                // ── Timer Bar ──
                timerBar

                Divider()

                // ── Question Content ──
                if let question = viewModel.currentQuestion {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 16) {
                            // Question header
                            HStack {
                                Text("Question \(viewModel.currentQuestionIndex + 1) / \(viewModel.questions.count)")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                Spacer()
                                Text(question.type.name)
                                    .font(.caption)
                                    .fontWeight(.semibold)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(Color.sectBlue.opacity(0.15))
                                    .foregroundStyle(.sectBlue)
                                    .clipShape(Capsule())
                            }

                            // Énoncé
                            Text(question.enonce)
                                .font(.body)
                                .fontWeight(.medium)

                            // ── Answer Input ──
                            answerInput(for: question)
                        }
                        .padding()
                    }
                } else {
                    Text("Aucune question disponible")
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }

                Divider()

                // ── Navigation Bar ──
                navigationBar
            }
            .navigationTitle(viewModel.epreuve?.titre ?? "Épreuve")
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarBackButtonHidden(viewModel.isTimerRunning)
            .toolbar {
                if viewModel.isTimerRunning {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Terminer") {
                            showSubmitConfirmation = true
                        }
                        .foregroundStyle(.sectRed)
                    }
                }
            }
            .alert("Confirmer la soumission", isPresented: $showSubmitConfirmation) {
                Button("Annuler", role: .cancel) { }
                Button("Soumettre", role: .destructive) {
                    Task { await viewModel.submitSession() }
                }
            } message: {
                Text("Voulez-vous soumettre vos réponses ? Vous avez répondu à \(viewModel.answeredCount) sur \(viewModel.questions.count) questions.")
            }
            .task {
                await viewModel.startSession(epreuveId: epreuveId)
            }
            .onDisappear {
                viewModel.cleanup()
            }
        }
    }

    // ── Timer Bar ──

    @ViewBuilder
    private var timerBar: some View {
        VStack(spacing: 4) {
            HStack {
                Image(systemName: "clock.fill")
                    .foregroundStyle(viewModel.remainingSeconds < 300 ? .sectRed : .sectGreen)
                Text(viewModel.timerDisplay)
                    .font(.system(.title3, design: .monospaced))
                    .fontWeight(.bold)
                    .foregroundStyle(viewModel.remainingSeconds < 300 ? .sectRed : .primary)
                Spacer()
                Text("\(viewModel.answeredCount)/\(viewModel.questions.count) réponses")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal)
            .padding(.top, 8)

            ProgressView(value: viewModel.timerProgress)
                .tint(viewModel.remainingSeconds < 300 ? .sectRed : .sectGreen)
                .padding(.horizontal)
                .padding(.bottom, 4)
        }
        .background(Color(.systemBarBackground))
    }

    // ── Answer Input ──

    @ViewBuilder
    private func answerInput(for question: Question) -> some View {
        let type = question.type.name

        VStack(alignment: .leading, spacing: 12) {
            Text("Votre réponse")
                .font(.headline)

            if type == "QCU" || type == "QCM" {
                // Multiple choice
                if let propositions = question.propositions {
                    let isMultiple = type == "QCM"
                    ForEach(propositions.sorted { $0.ordre < $1.ordre }, id: \.id) { prop in
                        propositionRow(prop, isMultiple: isMultiple)
                    }
                }
            } else if type == "CODE" {
                // Code editor
                if let starter = question.codeStarter {
                    TextEditor(text: Binding(
                        get: { viewModel.currentAnswer.isEmpty ? starter : viewModel.currentAnswer },
                        set: { viewModel.currentAnswer = $0 }
                    ))
                    .font(.system(.body, design: .monospaced))
                    .frame(minHeight: 200)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color(.systemGray4), lineWidth: 1)
                    )
                } else {
                    TextEditor(text: $viewModel.currentAnswer)
                        .font(.system(.body, design: .monospaced))
                        .frame(minHeight: 200)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color(.systemGray4), lineWidth: 1)
                        )
                }
            } else {
                // QRC, REFLEXION, TRS — free text
                TextEditor(text: $viewModel.currentAnswer)
                    .frame(minHeight: 150)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color(.systemGray4), lineWidth: 1)
                    )
            }
        }
    }

    @ViewBuilder
    private func propositionRow(_ prop: Proposition, isMultiple: Bool) -> some View {
        let isSelected = viewModel.currentAnswer.contains(prop.id)

        Button {
            if isMultiple {
                // Toggle proposition ID in comma-separated list
                var selectedIds = viewModel.currentAnswer.components(separatedBy: ",").filter { !$0.isEmpty }
                if isSelected {
                    selectedIds.removeAll { $0 == prop.id }
                } else {
                    selectedIds.append(prop.id)
                }
                viewModel.currentAnswer = selectedIds.joined(separator: ",")
            } else {
                viewModel.currentAnswer = prop.id
            }
        } label: {
            HStack(spacing: 12) {
                if isMultiple {
                    Image(systemName: isSelected ? "checkmark.square.fill" : "square")
                        .foregroundStyle(isSelected ? .sectGreen : .gray)
                } else {
                    Image(systemName: isSelected ? "circle.fill" : "circle")
                        .foregroundStyle(isSelected ? .sectGreen : .gray)
                }
                Text(prop.texte)
                    .foregroundStyle(.primary)
                Spacer()
            }
            .padding(.vertical, 4)
        }
    }

    // ── Navigation Bar ──

    @ViewBuilder
    private var navigationBar: some View {
        HStack(spacing: 0) {
            // Previous
            Button {
                Task {
                    await viewModel.saveCurrentAnswer()
                    viewModel.previousQuestion()
                }
            } label: {
                Image(systemName: "chevron.left")
                    .font(.title3)
            }
            .disabled(viewModel.isFirstQuestion)
            .foregroundStyle(viewModel.isFirstQuestion ? .gray : .sectGreen)
            .frame(maxWidth: .infinity)

            // Question dots
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(0..<viewModel.questions.count, id: \.self) { index in
                        let isAnswered = !viewModel.answers[viewModel.questions[index].id].OrNil.isNilOrEmpty
                        Circle()
                            .fill(index == viewModel.currentQuestionIndex ? Color.sectGreen :
                                  isAnswered ? Color.sectGreen.opacity(0.4) : Color(.systemGray4))
                            .frame(width: 10, height: 10)
                            .onTapGesture {
                                Task {
                                    await viewModel.saveCurrentAnswer()
                                    viewModel.goToQuestion(at: index)
                                }
                            }
                    }
                }
                .padding(.vertical, 4)
            }
            .frame(maxWidth: .infinity)

            // Next
            Button {
                Task {
                    await viewModel.saveCurrentAnswer()
                    viewModel.nextQuestion()
                }
            } label: {
                Image(systemName: "chevron.right")
                    .font(.title3)
            }
            .disabled(viewModel.isLastQuestion)
            .foregroundStyle(viewModel.isLastQuestion ? .gray : .sectGreen)
            .frame(maxWidth: .infinity)
        }
        .padding(.vertical, 8)
        .background(Color(.systemBarBackground))
    }
}

// ── Helper for optional string ──
extension Optional where Wrapped == String {
    var isNilOrEmpty: Bool {
        return self == nil || self!.isEmpty
    }
}
