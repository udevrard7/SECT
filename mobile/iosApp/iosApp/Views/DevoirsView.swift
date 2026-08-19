//
//  DevoirsView.swift
//  SECT
//
//  SECT-MOBILE-NAV-PHASE-B : miroir iOS de DevoirsScreen (Android).
//  Liste des devoirs avec pagination + création (enseignant).
//
import SwiftUI
import Shared

struct DevoirsView: View {
    @EnvironmentObject var viewModel: DevoirsViewModel
    @EnvironmentObject var authViewModel: AuthViewModel
    @State private var showCreateDevoir = false

    private var isEnseignant: Bool {
        authViewModel.currentUser?.role == .enseignant
    }

    var body: some View {
        VStack(spacing: 0) {
            DevoirsHeader(isEnseignant: isEnseignant) {
                showCreateDevoir = true
            }

            if viewModel.isLoading {
                loadingView
            } else if let error = viewModel.error {
                errorView(message: error)
            } else if viewModel.devoirs.isEmpty {
                emptyStateView
            } else {
                devoirsList
            }
        }
        .task { await viewModel.loadDevoirs(refresh: true) }
        .sheet(isPresented: $showCreateDevoir) {
            CreateDevoirView()
        }
    }

    // MARK: - Header

    private func DevoirsHeader(isEnseignant: Bool, onCreate: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("Devoirs")
                    .font(.title2).fontWeight(.bold)
                Spacer()
                if isEnseignant {
                    Button(action: onCreate) {
                        Image(systemName: "plus.circle.fill")
                            .font(.title2)
                            .foregroundColor(.sectGreen)
                    }
                }
            }
            Text(isEnseignant ? "Gérez les devoirs de vos étudiants"
                              : "Consultez et soumettez vos devoirs")
                .font(.subheadline).foregroundColor(.secondary)
        }
        .padding().background(Color(.systemBackground))
    }

    // MARK: - List

    private var devoirsList: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(viewModel.devoirs, id: \.id) { devoir in
                    NavigationLink(destination: DevoirDetailView(devoirId: devoir.id)) {
                        DevoirCard(devoir: devoir)
                    }
                    .buttonStyle(PlainButtonStyle())
                }
                if viewModel.isLoadingMore {
                    ProgressView().padding()
                }
                if viewModel.hasMorePages {
                    Button("Charger plus") {
                        Task { await viewModel.loadMore() }
                    }
                    .padding()
                }
            }
            .padding()
        }
        .refreshable { await viewModel.loadDevoirs(refresh: true) }
    }

    // MARK: - States

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView().scaleEffect(1.5)
            Text("Chargement des devoirs...").foregroundColor(.gray)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func errorView(message: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 40)).foregroundColor(.sectOrange)
            Text("Erreur").font(.headline)
            Text(message).font(.subheadline).foregroundColor(.gray)
                .multilineTextAlignment(.center).padding(.horizontal)
            Button("Réessayer") {
                Task { await viewModel.loadDevoirs(refresh: true) }
            }
            .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var emptyStateView: some View {
        VStack(spacing: 16) {
            Image(systemName: "doc.text")
                .font(.system(size: 50)).foregroundColor(.gray.opacity(0.5))
            Text("Aucun devoir").font(.headline).foregroundColor(.gray)
            Text("Les devoirs apparaîtront ici")
                .font(.subheadline).foregroundColor(.gray)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Devoir Card

struct DevoirCard: View {
    let devoir: Devoir

    private var isLate: Bool {
        let dateStr = String(devoir.dateLimite.prefix(10))
        guard let date = ISO8601DateFormatter().date(from: dateStr) else { return false }
        return date < Date()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(devoir.titre)
                .font(.headline).lineLimit(2)

            // description est un mot-clé Swift (NSObject.description) — accès direct
            if !devoir.description.isEmpty {
                Text(devoir.description).font(.subheadline).foregroundColor(.secondary).lineLimit(2)
            }

            HStack(spacing: 16) {
                Label {
                    Text("Échéance: \(String(devoir.dateLimite.prefix(10)))")
                } icon: {
                    Image(systemName: "calendar")
                }
                .font(.caption)
                .foregroundColor(isLate ? .sectRed : .secondary)

                Label {
                    Text("\(devoir.pointsMax) points")
                } icon: {
                    Image(systemName: "star")
                }
                .font(.caption).foregroundColor(.secondary)
            }

            if let auteur = devoir.auteur {
                Text("Par \(auteur.prenom) \(auteur.nom)")
                    .font(.caption).foregroundColor(.secondary)
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(12)
        .shadow(color: Color.black.opacity(0.05), radius: 4, x: 0, y: 2)
    }
}

// MARK: - Create Devoir View
// SECT-MOBILE-PARITY-T1 : formulaire de création de devoir branché sur repository.

struct CreateDevoirView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var viewModel: DevoirsViewModel

    @State private var titre = ""
    @State private var description = ""
    @State private var consignes = ""
    @State private var uniteEnseignementId = ""
    @State private var dateLimite = Calendar.current.date(byAdding: .day, value: 7, to: Date()) ?? Date()
    @State private var noteMax: Double = 20.0
    @State private var typeSeance = "TD"
    @State private var soumissionGroupe = false

    private let typeSeanceOptions = ["TD", "TP", "COURS"]

    private var isFormValid: Bool {
        !titre.trimmingCharacters(in: .whitespaces).isEmpty
        && !uniteEnseignementId.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        NavigationView {
            Form {
                Section("Informations générales") {
                    TextField("Titre du devoir *", text: $titre)
                    TextField("Description (optionnel)", text: $description, axis: .vertical)
                        .lineLimit(2...4)
                    TextField("Consignes détaillées (optionnel)", text: $consignes, axis: .vertical)
                        .lineLimit(3...6)
                    TextField("ID Unité d'Enseignement *", text: $uniteEnseignementId)
                        .autocapitalization(.none)
                        .disableAutocorrection(true)
                }

                Section("Échéance et notation") {
                    DatePicker("Date limite *", selection: $dateLimite)
                    HStack {
                        Text("Note maximale")
                        Spacer()
                        TextField("20", value: $noteMax, format: .number)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 80)
                        Text("/ 20")
                    }
                }

                Section("Type de séance") {
                    Picker("Type", selection: $typeSeance) {
                        ForEach(typeSeanceOptions, id: \.self) { option in
                            Text(option).tag(option)
                        }
                    }
                    .pickerStyle(.segmented)
                    Toggle("Soumission en groupe", isOn: $soumissionGroupe)
                }

                if let error = viewModel.createError {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .foregroundColor(.sectRed)
                    }
                }
            }
            .navigationTitle("Nouveau devoir")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Annuler") {
                        viewModel.resetCreateState()
                        dismiss()
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        Task { await submit() }
                    } label: {
                        if viewModel.isCreating {
                            ProgressView()
                        } else {
                            Text("Créer").fontWeight(.semibold)
                        }
                    }
                    .disabled(!isFormValid || viewModel.isCreating)
                }
            }
        }
    }

    /// Construit le CreateDevoirInput et appelle viewModel.createDevoir().
    /// enseignantId est laissé nil → le backend utilise l'ID du caller (enseignant connecté).
    private func submit() async {
        let rfc3339 = toRfc3339(dateLimite, hour: 23, minute: 59)
        let trimmedDesc = description.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedConsignes = consignes.trimmingCharacters(in: .whitespacesAndNewlines)

        let input = CreateDevoirInput(
            titre: titre.trimmingCharacters(in: .whitespaces),
            uniteEnseignementId: uniteEnseignementId.trimmingCharacters(in: .whitespaces),
            dateLimite: rfc3339,
            description: trimmedDesc.isEmpty ? nil : trimmedDesc,
            consignes: trimmedConsignes.isEmpty ? nil : trimmedConsignes,
            enseignantId: nil,
            typeSeance: typeSeance,
            datePublication: nil,
            noteMax: KotlinDouble(double: noteMax),
            renduFichiers: nil,
            soumissionGroupe: KotlinBoolean(bool: soumissionGroupe),
            nbMaxFichiers: nil,
            tailleMaxFichier: nil,
            anneeUniversitaire: nil
        )
        let success = await viewModel.createDevoir(input)
        if success {
            dismiss()
        }
    }

    /// Convertit une Date en chaîne RFC3339 (ISO8601) en forçant l'heure donnée.
    private func toRfc3339(_ date: Date, hour: Int, minute: Int) -> String {
        let cal = Calendar.current
        var comps = cal.dateComponents([.year, .month, .day], from: date)
        comps.hour = hour
        comps.minute = minute
        comps.second = 0
        let d = cal.date(from: comps) ?? date
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.string(from: d)
    }
}
