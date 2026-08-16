package com.sect.mobile.shared.di

import org.koin.dsl.module

/**
 * Koin module for domain layer.
 *
 * NOTE : ProctoringEngine est temporairement désactivé du DI (SECT-MOBILE-COMPILE-FIX-3).
 * Il utilisait kotlinx.datetime.Clock qui ne se résolvait pas en compilation Android
 * (problème de classpath KMP). Le moteur de proctoring n'est pas encore branché aux
 * ViewModels — sera réactivé quand l'intégration sera complète.
 *
 * Le module est conservé (vide) car référencé dans sharedModules.
 */
val domainModule = module {
    // ProctoringEngine sera réactivé ici une fois l'intégration finalisée.
}
