package com.sect.mobile.shared.di

import org.koin.dsl.module

/**
 * Koin module for presentation layer.
 *
 * Historiquement, ce module devait contenir des ViewModels partagés (MVI :
 * State + Action + Effect). Après audit (SECT-MOBILE-CLEANUP-1), ces VMs
 * partagés n'étaient jamais instanciés — Android et iOS implémentent chacun
 * leur propre version. Le code mort (773 lignes, 19 fichiers) a été supprimé.
 *
 * Le module est conservé (vide) car référencé dans sharedModules. Si une
 * future migration vers des VMs partagés (ex: via moko-mvvm ou un holder
 * d'état commun) est entreprise, les factory Koin iront ici.
 *
 * Architecture actuelle :
 * - shared : domain/ + data/ + platform/ (interfaces) + notification/
 * - Android : androidx.lifecycle.ViewModel dans androidApp/ui/viewmodel/
 * - iOS : ObservableObject dans iosApp/ViewModels/
 * - Les deux plateformes consomment SECTRepositoryInterface via Koin
 */
val presentationModule = module {
    // Réservé pour une future migration vers des ViewModels partagés.
}
