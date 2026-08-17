//
//  ExamPrepViews.swift
//  SECT
//
//  SECT-EXAMPREP-CONTRACT-F2 : Vague 1 — écrans iOS (Home, Documents, Reader, Review)
//  Miroir des écrans Android, consommant les mêmes ViewModels commonMain.
//
import SwiftUI
import Shared

// ════════════════════════════════════════════════════════
// MARK: - Home
// ════════════════════════════════════════════════════════

struct ExamPrepHomeView: View {
    @State private var dashboard: ExamPrepDashboard? = nil
    @State private var documents: [ExamPrepDocument] = []
    @State private var isLoading = true
    @State private var error: String? = nil

    private let repository = KoinRepositoryProvider.shared.repository

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 20) {
                    // Kente divider
                    KenteDivider(height: 3)

                    // Aujourd'hui
                    VStack(alignment: .leading, spacing: 12) {
                        Text("🎯 Aujourd'hui").font(.title3).fontWeight(.bold)

                        HStack(spacing: 12) {
                            SectStatCard(
                                value: "\(dashboard?.itemsSrs?.dusAujourdhui ?? 0)",
                                label: "Cartes à revoir",
                                icon: "rectangle.stack.fill",
                                accentColor: .sectLime
                            )
                            SectStatCard(
                                value: "\(dashboard?.sessionsAVenir ?? 0)",
                                label: "Sessions prévues",
                                icon: "calendar",
                                accentColor: .sectGold
                            )
                        }

                        if let dash = dashboard, dash.itemsSrs?.dusAujourdhui ?? 0 > 0 {
                            NavigationLink(destination: ExamPrepReviewView()) {
                                Label("Commencer ma révision", systemImage: "play.fill")
                                    .frame(maxWidth: .infinity).padding()
                                    .background(Color.sectLime).foregroundColor(.sectLimeDark)
                                    .cornerRadius(12).fontWeight(.bold)
                            }
                        }
                    }
                    .padding(.horizontal)

                    // Mes cours
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Text("📖 Mes cours").font(.title3).fontWeight(.bold)
                            Spacer()
                            NavigationLink("Voir tout") {
                                ExamPrepDocumentsView()
                            }.foregroundColor(.sectLime)
                        }

                        ForEach(documents.prefix(5), id: \.id) { doc in
                            NavigationLink(destination: ExamPrepReaderView(documentId: doc.id)) {
                                GlassCard {
                                    HStack {
                                        Image(systemName: "doc.text.fill").foregroundColor(.sectNavy)
                                        VStack(alignment: .leading) {
                                            Text(doc.nomFichier).fontWeight(.medium).lineLimit(1)
                                            if let ue = doc.uniteEnseignement {
                                                Text("\(ue.code) · \(ue.nom)").font(.caption).foregroundColor(.secondary)
                                            }
                                        }
                                        Spacer()
                                    }
                                }
                            }.buttonStyle(PlainButtonStyle())
                        }
                    }
                    .padding(.horizontal)

                    // Lacunes
                    if let dash = dashboard, !dash.lacunesParChapitre.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("⚠️ À renforcer").font(.title3).fontWeight(.bold)

                            ForEach(dash.lacunesParChapitre.sorted(by: { $0.avgScore < $1.avgScore }).prefix(3), id: \.chapterId) { weakness in
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(weakness.titre).fontWeight(.medium)
                                    SectProgressBar(progress: weakness.avgScore,
                                                    color: weakness.avgScore < 0.4 ? .sectRed : .sectGold)
                                    Text("\(Int(weakness.avgScore * 100))% · \(weakness.attempts) tentatives")
                                        .font(.caption).foregroundColor(.secondary)
                                }
                                .padding(12)
                                .background(Color.sectTerreCuite.opacity(0.08))
                                .cornerRadius(12)
                            }
                        }
                        .padding(.horizontal)
                    }

                    KenteDivider(height: 3)
                }
                .padding(.vertical)
            }
            .navigationTitle("Prépa Examens")
            .task { await loadData() }
        }
    }

    private func loadData() async {
        isLoading = true
        do {
            dashboard = try await repository.getDashboard(documentId: nil)
            documents = try await repository.listDocuments()
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }
}

// ════════════════════════════════════════════════════════
// MARK: - Documents
// ════════════════════════════════════════════════════════

struct ExamPrepDocumentsView: View {
    @State private var documents: [ExamPrepDocument] = []
    @State private var searchQuery = ""
    @State private var isLoading = true

    private let repository = KoinRepositoryProvider.shared.repository

    var filteredDocuments: [ExamPrepDocument] {
        documents.filter { searchQuery.isEmpty || $0.nomFichier.lowercased().contains(searchQuery.lowercased()) }
    }

    var body: some View {
        VStack(spacing: 0) {
            TextField("Rechercher...", text: $searchQuery)
                .textFieldStyle(.roundedBorder)
                .padding()

            if isLoading {
                ProgressView("Chargement...").frame(maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(filteredDocuments, id: \.id) { doc in
                            NavigationLink(destination: ExamPrepReaderView(documentId: doc.id)) {
                                GlassCard {
                                    HStack {
                                        Image(systemName: "doc.text.fill").foregroundColor(.sectNavy)
                                        VStack(alignment: .leading) {
                                            Text(doc.nomFichier).fontWeight(.bold)
                                            if let ue = doc.uniteEnseignement {
                                                Text("\(ue.code) · \(ue.nom)").font(.caption).foregroundColor(.secondary)
                                            }
                                        }
                                        Spacer()
                                        SectBadge(text: doc.statutAnalyse, color: .sectLime)
                                    }
                                }
                            }.buttonStyle(PlainButtonStyle())
                        }
                    }.padding()
                }
                .refreshable { await loadDocuments() }
            }
        }
        .navigationTitle("Mes cours")
        .task { await loadDocuments() }
    }

    private func loadDocuments() async {
        do { documents = try await repository.listDocuments() } catch {}
        isLoading = false
    }
}

// ════════════════════════════════════════════════════════
// MARK: - Reader
// ════════════════════════════════════════════════════════

struct ExamPrepReaderView: View {
    let documentId: String
    @State private var document: ExamPrepReaderDocument? = nil
    @State private var isLoading = true
    @State private var showFlashcardSheet = false
    @State private var showQASheet = false

    private let repository = KoinRepositoryProvider.shared.repository

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let ue = document?.uniteEnseignement {
                    SectBadge(text: "\(ue.code) · \(ue.nom)", color: .sectNavy)
                }

                Text(document?.contenuTexte ?? "Chargement...")
                    .font(.body)
                    .frame(maxWidth: .infinity, alignment: .leading)

                // Actions
                HStack(spacing: 12) {
                    Button { showFlashcardSheet = true } label: {
                        Label("Flashcard", systemImage: "rectangle.stack")
                    }.buttonStyle(.bordered)

                    Button { showQASheet = true } label: {
                        Label("Q&A IA", systemImage: "sparkles")
                    }.buttonStyle(.bordered)
                }
            }
            .padding()
        }
        .navigationTitle(document?.nomFichier ?? "Lecture")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadDocument() }
        .sheet(isPresented: $showFlashcardSheet) {
            FlashcardSheet(documentId: documentId)
        }
        .sheet(isPresented: $showQASheet) {
            QASheet(documentId: documentId)
        }
    }

    private func loadDocument() async {
        do { document = try await repository.readDocument(id: documentId) } catch {}
        isLoading = false
    }
}

// ════════════════════════════════════════════════════════
// MARK: - Review (SRS)
// ════════════════════════════════════════════════════════

struct ExamPrepReviewView: View {
    @State private var reviewItems: [ReviewItem] = []
    @State private var isLoading = true
    @State private var dueOnly = true
    @State private var lastReviewedId: String? = nil

    private let repository = KoinRepositoryProvider.shared.repository

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                if reviewItems.isEmpty && !isLoading {
                    VStack(spacing: 16) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 50)).foregroundColor(.sectLime)
                        Text("Tout est à jour !").font(.headline)
                        Text("Aucune carte à réviser").foregroundColor(.secondary)
                    }.padding(.top, 60)
                }

                ForEach(reviewItems, id: \.id) { item in
                    ReviewItemCard(item: item, isLastReviewed: lastReviewedId == item.id) { quality in
                        Task { await markReviewed(item.id, quality: quality) }
                    }
                }
            }.padding()
        }
        .navigationTitle("🧠 Révision")
        .toolbar {
            Toggle(isOn: $dueOnly) { Text("Dues") }
                .toggleStyle(.switch)
                .onChange(of: dueOnly) { _ in Task { await loadItems() } }
        }
        .task { await loadItems() }
    }

    private func loadItems() async {
        do { reviewItems = try await repository.listReviewItems(documentId: nil, due: dueOnly) } catch {}
        isLoading = false
    }

    private func markReviewed(_ id: String, quality: Int) async {
        do {
            try await repository.markReviewed(reviewItemId: id, quality: quality)
            lastReviewedId = id
            await loadItems()
        } catch {}
    }
}

struct ReviewItemCard: View {
    let item: ReviewItem
    let isLastReviewed: Bool
    let onQuality: (Int) -> Void

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    SectBadge(text: "Rép. \(item.repetitions)", color: .sectNavy)
                    Spacer()
                    Text("Facilité: \(String(format: "%.1f", item.easeFactor))")
                        .font(.caption).foregroundColor(.secondary)
                    if isLastReviewed {
                        SectBadge(text: "✓ Révisé", color: .sectLime)
                    }
                }

                SectProgressBar(progress: Double(item.repetitions) / 5.0, color: .sectLime)

                Text("Votre évaluation :").font(.caption).foregroundColor(.secondary)

                HStack(spacing: 8) {
                    qualityButton(0, "Oubli", .sectRed)
                    qualityButton(2, "Difficile", .sectTerreCuite)
                    qualityButton(3, "Correct", .sectGold)
                    qualityButton(5, "Parfait", .sectLime)
                }
            }
        }
    }

    private func qualityButton(_ quality: Int, _ label: String, _ color: Color) -> some View {
        Button(label) { onQuality(quality) }
            .font(.caption)
            .frame(maxWidth: .infinity).padding(.vertical, 6)
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(color, lineWidth: 1))
            .foregroundColor(color)
    }
}

// ════════════════════════════════════════════════════════
// MARK: - Sheets (Flashcard + Q&A)
// ════════════════════════════════════════════════════════

struct FlashcardSheet: View {
    let documentId: String
    @Environment(\.dismiss) var dismiss
    @State private var selectedText = ""
    @State private var isCreating = false
    @State private var created = false

    private let repository = KoinRepositoryProvider.shared.repository

    var body: some View {
        NavigationView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Texte sélectionné (max 4000 caractères) :").font(.caption)
                TextEditor(text: $selectedText)
                    .frame(minHeight: 120, maxHeight: 200)
                    .border(Color.gray.opacity(0.3))

                if created {
                    Text("✅ Flashcard créée + SRS mis à jour")
                        .foregroundColor(.sectLime).fontWeight(.bold)
                }

                Spacer()
            }
            .padding()
            .navigationTitle("Créer une flashcard")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Créer") {
                        Task { await createFlashcard() }
                    }.disabled(selectedText.isEmpty || isCreating || created)
                }
            }
        }
    }

    private func createFlashcard() async {
        isCreating = true
        do {
            _ = try await repository.createFlashcard(
                documentId: documentId,
                selectedText: String(selectedText.prefix(4000)),
                chapterId: nil
            )
            created = true
        } catch {}
        isCreating = false
    }
}

struct QASheet: View {
    let documentId: String
    @Environment(\.dismiss) var dismiss
    @State private var question = ""
    @State private var response: QAResponse? = nil
    @State private var isLoading = false

    private let repository = KoinRepositoryProvider.shared.repository

    var body: some View {
        NavigationView {
            VStack(alignment: .leading, spacing: 16) {
                TextField("Posez une question...", text: $question, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(2...4)

                Button {
                    Task { await ask() }
                } label: {
                    if isLoading { ProgressView() }
                    else { Text("Demander à l'IA").fontWeight(.semibold) }
                }
                .buttonStyle(.borderedProminent)
                .tint(.sectTech)
                .disabled(question.isEmpty || isLoading)

                if let resp = response {
                    GlassCard {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(resp.response).font(.body)
                            Text("Modèle : \(resp.model)").font(.caption).foregroundColor(.secondary)
                        }
                    }
                }
                Spacer()
            }
            .padding()
            .navigationTitle("🤖 Q&A IA")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Fermer") { dismiss() } }
            }
        }
    }

    private func ask() async {
        isLoading = true
        do { response = try await repository.askQuestion(documentId: documentId, question: question) } catch {}
        isLoading = false
    }
}
