//
//  DevoirDetailView.swift
//  SECT
//  SECT-MOBILE-PARITY : P0-2 — détail d'un devoir iOS (pas epreuves/{id})
//
import SwiftUI
import Shared

struct DevoirDetailView: View {
    let devoirId: String
    @State private var devoir: Devoir? = nil
    @State private var isLoading = true
    @Environment(\.dismiss) var dismiss

    private let repository = KoinRepositoryProvider.shared.repository

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                KenteDivider(height: 3)

                if let d = devoir {
                    // Titre + statut
                    Text(d.titre).font(.title2).fontWeight(.bold)
                    SectBadge(text: d.statut, color: d.statut == "PUBLIE" ? .sectLime : .sectNavy)

                    // Description
                    if let desc = d.description, !desc.isEmpty {
                        GlassCard {
                            VStack(alignment: .leading) {
                                Text("Description").font(.headline)
                                Text(desc).font(.body)
                            }
                        }
                    }

                    // Infos
                    GlassCard {
                        VStack(alignment: .leading, spacing: 8) {
                            let isLate = isDevoirLate(d.dateLimite)
                            Label {
                                Text("Échéance: \(String(d.dateLimite.prefix(10)))")
                            } icon: {
                                Image(systemName: "calendar")
                            }.foregroundColor(isLate ? .sectRed : .sectGold)

                            Label {
                                Text("\(d.pointsMax) points")
                            } icon: {
                                Image(systemName: "star.fill")
                            }.foregroundColor(.sectGold)

                            if let auteur = d.auteur {
                                Label {
                                    Text("Par \(auteur.prenom) \(auteur.nom)")
                                } icon: {
                                    Image(systemName: "person.fill")
                                }.foregroundColor(.sectNavy)
                            }

                            if let url = d.fichierUrl, !url.isEmpty {
                                Label {
                                    Text("Document attaché")
                                } icon: {
                                    Image(systemName: "paperclip")
                                }.foregroundColor(.sectTech)
                            }
                        }
                    }

                    // Soumission étudiant
                    if let soumission = d.soumissionUtilisateur {
                        GlassCard {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Ma soumission").font(.headline)
                                Text("Statut: \(soumission.statut)")
                                if let note = soumission.note {
                                    Text("Note: \(note)/\(d.pointsMax)")
                                        .fontWeight(.bold).foregroundColor(.sectLimeDark)
                                }
                                if let comm = soumission.commentaire, !comm.isEmpty {
                                    Text("Commentaire: \(comm)").font(.caption)
                                }
                            }
                        }
                    }

                    // Bouton soumettre (étudiant)
                    if d.soumissionUtilisateur == nil {
                        Button {
                            // TODO P1 : soumission (upload presigned + POST /soumissions)
                        } label: {
                            Label("Soumettre", systemImage: "upload")
                                .frame(maxWidth: .infinity).padding()
                                .background(Color.sectLime)
                                .foregroundColor(.sectLimeDark)
                                .cornerRadius(12).fontWeight(.bold)
                        }
                    }
                } else if isLoading {
                    ProgressView().padding()
                }

                KenteDivider(height: 3)
            }
            .padding()
        }
        .navigationTitle(devoir?.titre ?? "Devoir")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadDevoir() }
    }

    private func loadDevoir() async {
        isLoading = true
        do {
            let devoirs = try await repository.listDevoirs(page: 1, limit: 50)
            devoir = devoirs.first(where: { $0.id == devoirId })
        } catch {}
        isLoading = false
    }

    private func isDevoirLate(_ dateStr: String) -> Bool {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        guard let date = formatter.date(from: String(dateStr.prefix(10))) else { return false }
        return date < Date()
    }
}
