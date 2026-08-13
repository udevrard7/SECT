package com.sect.mobile.shared.di

import com.sect.mobile.shared.proctoring.ProctoringEngine
import org.koin.dsl.module

/**
 * Koin module for domain layer: ProctoringEngine and other domain services.
 *
 * The ProctoringEngine is a singleton because it maintains state
 * across the entire exam session (alert count, event log).
 */
val domainModule = module {
    single { ProctoringEngine() }
}
