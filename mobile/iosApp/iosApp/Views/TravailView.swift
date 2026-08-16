//
//  TravailView.swift
//  SECT
//
//  SECT-MOBILE-NAV-PHASE-B : conteneur regroupant Épreuves + Devoirs.
//  Miroir iOS de TravailScreen (Android).
//
import SwiftUI
import Shared

struct TravailView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @State private var selectedTab = 0

    private var isEnseignant: Bool {
        authViewModel.currentUser?.role == .enseignant
    }

    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                Picker("Type de travail", selection: $selectedTab) {
                    Label("Épreuves", systemImage: "doc.text.fill").tag(0)
                    Label("Devoirs", systemImage: "doc.text.magnifyingglass").tag(1)
                }
                .pickerStyle(.segmented)
                .padding()

                if selectedTab == 0 {
                    EpreuvesView()
                } else {
                    DevoirsView()
                }
            }
            .navigationTitle("Travail")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    if isEnseignant {
                        Menu {
                            Button {
                                // TODO: create epreuve
                            } label: {
                                Label("Nouvelle épreuve", systemImage: "doc.badge.plus")
                            }
                            Button {
                                // TODO: create devoir
                            } label: {
                                Label("Nouveau devoir", systemImage: "doc.text.badge.plus")
                            }
                        } label: {
                            Image(systemName: "plus")
                        }
                    }
                }
            }
        }
    }
}
