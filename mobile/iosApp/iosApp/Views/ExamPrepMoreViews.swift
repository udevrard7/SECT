//
//  ExamPrepMoreViews.swift
//  SECT
//  SECT-EXAMPREP-CONTRACT-F2 : Vagues 2-4 iOS (Practice, Progress, Q&A, Flashcards, Audio, Planning, Help)
//
import SwiftUI
import Shared

// ════════════════════════════════════════════════════════
// VAGUE 2 — PRACTICE
// ════════════════════════════════════════════════════════

struct ExamPrepPracticeView: View {
    @State private var documentId = ""
    @State private var nombreQuestions: Double = 10
    @State private var difficulte = "MOYEN"
    @State private var generationState: PracticeGenerationState = .Idle
    @State private var questions: [PracticeQuestion] = []
    @State private var currentIndex = 0
    @State private var attempts: [PracticeAttempt] = []
    @State private var userAnswers: [String: [String]] = [:]

    private let repository = KoinRepositoryProvider.shared.examPrepRepository

    var body: some View {
        switch generationState {
        case .Idle:
            configView
        case .Generating:
            VStack(spacing: 16) {
                ProgressView()
                Text("Génération des questions...")
                Text("L'IA prépare votre entraînement").foregroundColor(.secondary).font(.caption)
            }
        case .ready(let qs):
            questionsView(qs: qs)
        case .failed(let msg):
            VStack(spacing = 16) {
                Image(systemName: "xmark.circle.fill").font(.system(size: 48)).foregroundColor(.sectRed)
                Text(msg).foregroundColor(.sectRed)
                Button("Réessayer") { generationState = .Idle }
            }
        case .Timeout:
            VStack(spacing: 16) {
                Text("Délai dépassé (60s)").foregroundColor(.sectRed)
                Button("Réessayer") { generationState = .Idle }
            }
        }
    }

    private var configView: some View {
        Form {
            Section("Configuration") {
                TextField("Document ID", text: $documentId)
                VStack(alignment: .leading) {
                    Text("Nombre de questions: \(Int(nombreQuestions))")
                    Slider(value: $nombreQuestions, in: 5...30, step: 1)
                }
                Picker("Difficulté", selection: $difficulte) {
                    Text("Facile").tag("FACILE")
                    Text("Moyen").tag("MOYEN")
                    Text("Difficile").tag("DIFFICILE")
                }
                Button("Générer") { Task { await generate() } }
                    .disabled(documentId.isEmpty)
            }
            if !attempts.isEmpty {
                Section("Tentatives récentes") {
                    ForEach(attempts.prefix(10), id: \.id) { att in
                        HStack {
                            Image(systemName: att.correct ? "checkmark.circle.fill" : "xmark.circle.fill")
                                .foregroundColor(att.correct ? .sectLime : .sectRed)
                            Text("Score: \(Int(att.score * 100))%")
                            Spacer()
                            Text("\(att.dureeSec)s").font(.caption).foregroundColor(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle("🎯 Entraînement")
        .task { await loadAttempts() }
    }

    private func questionsView(qs: [PracticeQuestion]) -> some View {
        let progress = Double(currentIndex + 1) / Double(qs.count)
        return VStack {
            ProgressView(value: progress)
            Text("Question \(currentIndex + 1)/\(qs.count)").font(.caption).foregroundColor(.secondary)
            Spacer()
            if let q = qs[safe: currentIndex] {
                GlassCard {
                    VStack(alignment: .leading) {
                        Text(q.enonce).fontWeight(.medium)
                        ForEach(q.propositions, id: \.self) { prop in
                            Button(action: { userAnswers[q.id] = [prop] }) {
                                Text(prop).frame(maxWidth: .infinity).padding()
                                    .background(userAnswers[q.id]?.contains(prop) == true ? Color.sectLime.opacity(0.2) : Color.clear)
                                    .cornerRadius(8)
                            }.buttonStyle(PlainButtonStyle())
                        }
                    }
                }
            }
            Spacer()
            HStack {
                Button("Précédent") { currentIndex = max(0, currentIndex - 1) }
                    .disabled(currentIndex == 0)
                Spacer()
                if currentIndex < qs.count - 1 {
                    Button("Suivant") { currentIndex += 1 }
                } else {
                    Button("Terminer") { /* submit */ }
                        .disabled(userAnswers.count < qs.count)
                }
            }
        }.padding()
    }

    private func generate() async {
        generationState = .Generating
        let result = await repository.generatePractice(
            documentId: documentId,
            nombreQuestions: Int32(nombreQuestions),
            difficulte: difficulte,
            chapterId: nil
        )
        switch result {
        case .ready(let qs):
            questions = qs; currentIndex = 0; userAnswers = [:]
            generationState = .Ready(qs)
        case .failed(let msg):
            generationState = .Failed(message: msg)
        case .Timeout:
            generationState = .Timeout
        default: generationState = .Idle
        }
    }

    private func loadAttempts() async {
        attempts = (try? await repository.listPracticeAttempts(documentId: nil)) ?? []
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

// ════════════════════════════════════════════════════════
// VAGUE 3 — PROGRESS
// ════════════════════════════════════════════════════════

struct ExamPrepProgressView: View {
    @State private var dashboard: ExamPrepDashboard? = nil
    @State private var isLoading = true
    private let repository = KoinRepositoryProvider.shared.examPrepRepository

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                KenteDivider(height: 3)
                if let dash = dashboard {
                    HStack(spacing: 12) {
                        SectStatCard(value: "\(Int(dash.scoreMoyen * 100))%", label: "Score moyen", icon: "chart.line.uptrend.xyarrow", accentColor: .sectLime)
                        SectStatCard(value: "\(dash.tauxReussite)%", label: "Réussite", icon: "checkmark.circle.fill", accentColor: .sectGold)
                    }
                    HStack(spacing: 12) {
                        SectStatCard(value: "\(dash.totalAttempts)", label: "Tentatives", icon: "questionmark.circle", accentColor: .sectTerreCuite)
                        SectStatCard(value: "\(dash.itemsSrs?.masterises ?? 0)", label: "Maîtrisés", icon: "graduationcap.fill", accentColor: .sectLime)
                    }
                    if !dash.lacunesParChapitre.isEmpty {
                        Text("⚠️ Lacunes").font(.title3).fontWeight(.bold).frame(maxWidth: .infinity, alignment: .leading)
                        ForEach(dash.lacunesParChapitre.sorted(by: { $0.avgScore < $1.avgScore }), id: \.chapterId) { w in
                            VStack(alignment: .leading) {
                                Text(w.titre).fontWeight(.medium)
                                SectProgressBar(progress: w.avgScore, color: .sectRed)
                                Text("\(Int(w.avgScore * 100))% · \(w.attempts) tentatives").font(.caption).foregroundColor(.secondary)
                            }.padding(12).background(Color.sectTerreCuite.opacity(0.08)).cornerRadius(12)
                        }
                    }
                } else if isLoading {
                    ProgressView()
                }
            }.padding()
        }
        .navigationTitle("📊 Progression")
        .task { dashboard = try? await repository.getDashboard(documentId: nil); isLoading = false }
    }
}

// ════════════════════════════════════════════════════════
// VAGUE 3 — Q&A
// ════════════════════════════════════════════════════════

struct ExamPrepQaView: View {
    @State private var question = ""
    @State private var response: QAResponse? = nil
    @State private var isLoading = false
    @State private var history: [(String, QAResponse)] = []
    private let repository = KoinRepositoryProvider.shared.examPrepRepository

    var body: some View {
        VStack {
            TextField("Votre question...", text: $question, axis: .vertical)
                .textFieldStyle(.roundedBorder).lineLimit(2...4)
            Button { Task { await ask() } } label: {
                if isLoading { ProgressView() }
                else { Text("Demander à l'IA").fontWeight(.semibold) }
            }
            .buttonStyle(.borderedProminent).tint(.sectTech)
            .disabled(question.isEmpty || isLoading)

            if let resp = response {
                GlassCard {
                    VStack(alignment: .leading) {
                        Text(resp.response).font(.body)
                        Text("Modèle: \(resp.model)").font(.caption).foregroundColor(.secondary)
                    }
                }
            }
            Spacer()
        }.padding().navigationTitle("🤖 Q&A IA")
    }

    private func ask() async {
        isLoading = true
        if let resp = try? await repository.askQuestion(documentId: "", question: question) {
            response = resp
            history.append((question, resp))
        }
        isLoading = false
    }
}

// ════════════════════════════════════════════════════════
// VAGUE 3 — FLASHCARDS
// ════════════════════════════════════════════════════════

struct ExamPrepFlashcardsView: View {
    @State private var flashcards: [Flashcard] = []
    @State private var isLoading = true
    private let repository = KoinRepositoryProvider.shared.examPrepRepository

    var body: some View {
        Group {
            if isLoading { ProgressView() }
            else if flashcards.isEmpty {
                VStack(spacing: 16) {
                    Image(systemName: "rectangle.stack").font(.system(size: 50)).foregroundColor(.sectLime)
                    Text("Aucune flashcard")
                    Text("Créez-en depuis le lecteur de cours").foregroundColor(.secondary)
                }
            } else {
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(flashcards, id: \.id) { card in
                            FlashcardItemView(card: card) { Task { await delete(card.id) } }
                        }
                    }.padding()
                }
            }
        }
        .navigationTitle("🃏 Flashcards")
        .task { flashcards = (try? await repository.listFlashcards(documentId: nil)) ?? []; isLoading = false }
    }

    private func delete(_ id: String) async {
        try? await repository.deleteFlashcard(id: id)
        flashcards = (try? await repository.listFlashcards(documentId: nil)) ?? []
    }
}

struct FlashcardItemView: View {
    let card: Flashcard
    let onDelete: () -> Void
    @State private var flipped = false

    var body: some View {
        GlassCard {
            VStack(alignment: .leading) {
                Text(flipped ? card.verso : card.recto)
                    .font(flipped ? .body : .title3).fontWeight(.bold)
                Button(flipped ? "Voir recto" : "Voir verso") { flipped.toggle() }
                Button(role: .destructive, action: onDelete) { Label("Supprimer", systemImage: "trash") }
            }
        }
    }
}

// ════════════════════════════════════════════════════════
// VAGUE 4 — AUDIO
// ════════════════════════════════════════════════════════

struct ExamPrepAudioView: View {
    let documentId: String
    @State private var audios: [DocumentAudio] = []
    @State private var isGenerating = false
    private let repository = KoinRepositoryProvider.shared.examPrepRepository

    var body: some View {
        VStack {
            Button { Task { await generate() } } label: {
                Label("Générer podcast", systemImage: "mic.fill")
                    .frame(maxWidth: .infinity).padding()
                    .background(Color.sectTech).foregroundColor(.white)
                    .cornerRadius(12)
            }.disabled(isGenerating)

            if isGenerating { ProgressView("Génération en cours..."); }

            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(audios, id: \.id) { audio in
                        GlassCard {
                            VStack(alignment: .leading) {
                                Text(audio.script.prefix(100) + "...")
                                    .font(.caption)
                                Text("\(audio.durationSec)s · \(audio.status)")
                                    .font(.caption2).foregroundColor(.secondary)
                                if audio.status == "PRET" && audio.audioUrl != nil {
                                    Text("▶ Prêt à écouter").foregroundColor(.sectLime)
                                }
                            }
                        }
                    }
                }.padding()
            }
        }.padding()
        .navigationTitle("🎧 Audio")
        .task { audios = (try? await repository.listDocumentAudio(documentId: documentId)) ?? [] }
    }

    private func generate() async {
        isGenerating = true
        _ = try? await repository.generateAudio(documentId: documentId)
        audios = (try? await repository.listDocumentAudio(documentId: documentId)) ?? []
        isGenerating = false
    }
}

// ════════════════════════════════════════════════════════
// VAGUE 4 — PLANNING
// ════════════════════════════════════════════════════════

struct ExamPrepPlanningView: View {
    @State private var sessions: [StudySession] = []
    @State private var isLoading = true
    private let repository = KoinRepositoryProvider.shared.examPrepRepository

    var body: some View {
        Group {
            if isLoading { ProgressView() }
            else if sessions.isEmpty { Text("Aucune session") }
            else {
                ScrollView {
                    LazyVStack(spacing: 12) {
                        Text("À venir").font(.title3).fontWeight(.bold).frame(maxWidth: .infinity, alignment: .leading)
                        ForEach(sessions.filter { $0.statut == "PLANIFIEE" }, id: \.id) { s in
                            GlassCard {
                                HStack {
                                    Image(systemName: "calendar").foregroundColor(.sectGold)
                                    VStack(alignment: .leading) {
                                        Text(s.type.capitalized).fontWeight(.medium)
                                        Text(String(s.dateDebut.prefix(16))).font(.caption).foregroundColor(.secondary)
                                    }
                                    Spacer()
                                    Button("Terminer") { Task { await markCompleted(s.id) } }
                                        .foregroundColor(.sectLime)
                                }
                            }
                        }
                    }.padding()
                }
            }
        }
        .navigationTitle("📅 Planning")
        .task { sessions = (try? await repository.listStudySessions()) ?? []; isLoading = false }
    }

    private func markCompleted(_ id: String) async {
        _ = try? await repository.updateStudySession(id: id, type: nil, dateDebut: nil, dateFin: nil, statut: "TERMINEE", notes: nil)
        sessions = (try? await repository.listStudySessions()) ?? []
    }
}

// ════════════════════════════════════════════════════════
// VAGUE 4 — HELP
// ════════════════════════════════════════════════════════

struct ExamPrepHelpView: View {
    @State private var threads: [HelpThread] = []
    @State private var isLoading = true
    private let repository = KoinRepositoryProvider.shared.examPrepRepository

    var body: some View {
        Group {
            if isLoading { ProgressView() }
            else if threads.isEmpty {
                VStack(spacing: 16) {
                    Text("Aucune discussion")
                    Text("Posez une question à votre enseignant").foregroundColor(.secondary)
                }
            } else {
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(threads, id: \.id) { thread in
                            GlassCard {
                                HStack {
                                    Image(systemName: thread.statut == "OUVERT" ? "questionmark.bubble.fill" : "checkmark.circle.fill")
                                        .foregroundColor(thread.statut == "OUVERT" ? .sectLime : .sectNavy)
                                    VStack(alignment: .leading) {
                                        Text(thread.sujet).fontWeight(.medium).lineLimit(2)
                                        Text(thread.statut).font(.caption).foregroundColor(.secondary)
                                    }
                                    Spacer()
                                }
                            }
                        }
                    }.padding()
                }
            }
        }
        .navigationTitle("👨‍🏫 Aide")
        .task { threads = (try? await repository.listHelpThreads()) ?? []; isLoading = false }
    }
}
