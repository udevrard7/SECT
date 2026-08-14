// SECT Mobile — iOS Passation ViewModel (Exam Session)
import SwiftUI
import Shared

@MainActor
class PassationViewModel: ObservableObject {
    @Published var session: SessionPassation? = nil
    @Published var epreuve: Epreuve? = nil
    @Published var questions: [Question] = []
    @Published var currentQuestionIndex: Int = 0
    @Published var answers: [String: String] = [:]  // questionId -> contenu
    @Published var remainingSeconds: Int = 0
    @Published var isTimerRunning = false
    @Published var isSubmitting = false
    @Published var isLoading = false
    @Published var error: String? = nil
    @Published var isSessionComplete = false

    private let repository = KoinRepositoryProvider.shared.repository
    private var timerTask: Task<Void, Never>? = nil
    private var autoSaveTask: Task<Void, Never>? = nil

    // ── Start Session ──

    func startSession(epreuveId: String) async {
        isLoading = true
        error = nil
        do {
            let session = try await repository.startSession(epreuveId: epreuveId)
            self.session = session
            self.epreuve = session.epreuve

            if let epreuve = session.epreuve, let qs = epreuve.questions {
                self.questions = qs.sorted { $0.ordre < $1.ordre }
            }

            // Load existing answers from session
            if let reponses = session.reponses {
                for reponse in reponses {
                    if let contenu = reponse.contenu {
                        answers[reponse.questionId] = contenu
                    }
                }
            }

            // Start countdown timer
            let totalSeconds: Int
            if let tempsRestant = session.tempsRestant, tempsRestant > 0 {
                totalSeconds = tempsRestant
            } else if let epreuve = self.epreuve {
                totalSeconds = epreuve.duree * 60
            } else {
                totalSeconds = 0
            }
            remainingSeconds = totalSeconds
            startTimer()
            startAutoSave()
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    // ── Timer ──

    private func startTimer() {
        isTimerRunning = true
        timerTask = Task { [weak self] in
            while let self = self, self.remainingSeconds > 0, !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                guard !Task.isCancelled else { return }
                self.remainingSeconds -= 1
                if self.remainingSeconds <= 0 {
                    self.isTimerRunning = false
                    // Auto-submit when time runs out
                    await self.submitSession()
                }
            }
        }
    }

    func stopTimer() {
        timerTask?.cancel()
        timerTask = nil
        isTimerRunning = false
    }

    // ── Auto-Save ──

    private func startAutoSave() {
        autoSaveTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 30_000_000_000) // 30 seconds
                guard let self = self, !Task.isCancelled else { return }
                await self.saveAllAnswers()
            }
        }
    }

    func stopAutoSave() {
        autoSaveTask?.cancel()
        autoSaveTask = nil
    }

    // ── Question Navigation ──

    var currentQuestion: Question? {
        guard currentQuestionIndex >= 0, currentQuestionIndex < questions.count else { return nil }
        return questions[currentQuestionIndex]
    }

    var currentAnswer: String {
        get {
            guard let q = currentQuestion else { return "" }
            return answers[q.id] ?? ""
        }
        set {
            guard let q = currentQuestion else { return }
            answers[q.id] = newValue
        }
    }

    func goToQuestion(at index: Int) {
        guard index >= 0, index < questions.count else { return }
        currentQuestionIndex = index
    }

    func nextQuestion() {
        if currentQuestionIndex < questions.count - 1 {
            currentQuestionIndex += 1
        }
    }

    func previousQuestion() {
        if currentQuestionIndex > 0 {
            currentQuestionIndex -= 1
        }
    }

    var isFirstQuestion: Bool { currentQuestionIndex == 0 }
    var isLastQuestion: Bool { currentQuestionIndex == questions.count - 1 }

    // ── Answer Saving ──

    func saveCurrentAnswer() async {
        guard let session = session, let question = currentQuestion else { return }
        let contenu = answers[question.id] ?? ""
        do {
            try await repository.saveReponse(
                sessionId: session.id,
                questionId: question.id,
                contenu: contenu
            )
        } catch {
            // Silent fail for auto-save; user will see on submit
        }
    }

    func saveAllAnswers() async {
        guard let session = session else { return }
        for (questionId, contenu) in answers {
            do {
                try await repository.saveReponse(
                    sessionId: session.id,
                    questionId: questionId,
                    contenu: contenu
                )
            } catch { }
        }
    }

    // ── Submit Session ──

    func submitSession() async {
        guard let session = session else { return }
        stopTimer()
        stopAutoSave()
        isSubmitting = true
        error = nil
        do {
            // Save all answers first
            await saveAllAnswers()

            // Build reponses array for submission
            let reponses: [[String: Any?]] = answers.map { questionId, contenu in
                return [
                    "questionId": questionId,
                    "contenu": contenu
                ]
            }

            let result = try await repository.submitSession(
                sessionId: session.id,
                reponses: reponses
            )
            self.session = result
            isSessionComplete = true
        } catch {
            self.error = error.localizedDescription
        }
        isSubmitting = false
    }

    // ── Cleanup ──

    func cleanup() {
        stopTimer()
        stopAutoSave()
    }

    // ── Timer Display ──

    var timerDisplay: String {
        let minutes = remainingSeconds / 60
        let seconds = remainingSeconds % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }

    var timerProgress: Double {
        guard let epreuve = epreuve, epreuve.duree > 0 else { return 0 }
        let total = Double(epreuve.duree * 60)
        return Double(remainingSeconds) / total
    }

    var answeredCount: Int {
        answers.values.filter { !$0.isEmpty }.count
    }
}
