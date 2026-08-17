// SECT Mobile — Base ViewModel (KMP, pure Kotlin)
// SECT-EXAMPREP-CONTRACT-F1 : classe de base pour les ViewModels commonMain.
//
// Pattern : StateFlow + CoroutineScope (pas de dépendance androidx.lifecycle).
// Chaque plateforme wrappe ce VM dans son propre cycle de vie :
// - Android : androidx.lifecycle.ViewModel(viewModelScope) → delegate à commonState
// - iOS : ObservableObject avec @Published qui observe le StateFlow
package com.sect.mobile.shared.presentation

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * ViewModel de base shared KMP.
 *
 * Fournit un CoroutineScope géré (annulé sur clear) + helpers pour StateFlow.
 * Les plateformes appellent clear() quand le VM n'est plus utilisé.
 */
abstract class BaseViewModel {

    protected val viewModelScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    /**
     * Doit être appelé quand le VM n'est plus utilisé (Android onDestroy, iOS deinit).
     */
    fun clear() {
        viewModelScope.cancel()
    }

    /**
     * Helper pour lancer une coroutine dans le scope du VM.
     */
    protected fun launch(block: suspend () -> Unit) {
        viewModelScope.launch {
            try { block() } catch (e: Exception) {
                onError(e)
            }
        }
    }

    /**
     * Override pour gérer les erreurs globales.
     */
    protected open fun onError(error: Exception) {
        // défaut : noop, les VMs gèrent leurs erreurs via state
    }
}
