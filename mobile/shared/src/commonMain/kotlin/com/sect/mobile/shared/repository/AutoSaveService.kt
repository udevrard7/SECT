// SECT Mobile — Auto-save Service (shared entre Android/iOS)
// Sauvegarde périodique des réponses pendant la passation d'épreuve
package com.sect.mobile.shared.repository

import com.sect.mobile.shared.network.api.SessionApi
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * AutoSaveService gère la sauvegarde périodique des réponses d'un étudiant
 * pendant la passation d'une épreuve.
 *
 * Stratégie :
 * - Les réponses sont d'abord stockées en local (Map<String, String>)
 * - Toutes les [saveIntervalMs] millisecondes, les réponses modifiées sont poussées au backend
 * - Si l'API échoue, les réponses restent en local et seront réessayées
 * - À la soumission finale, toutes les réponses sont forcées
 *
 * Avantages :
 * - L'étudiant ne perd pas ses réponses en cas de coupure réseau
 * - Le backend a des données partielles même si l'étudiant ferme l'app
 * - Réduit la charge API en batchant les sauvegardes
 */
class AutoSaveService(
    private val sessionApi: SessionApi,
    private val saveIntervalMs: Long = 30_000L, // 30 secondes par défaut
    private val scope: CoroutineScope
) {
    // ── Réponses locales ──
    private val _localReponses = MutableStateFlow<Map<String, String>>(emptyMap())
    val localReponses: StateFlow<Map<String, String>> = _localReponses

    // ── Réponses en attente de sauvegarde (dirty flag) ──
    private val _dirtyQuestions = MutableStateFlow<Set<String>>(emptySet())

    // ── État de la dernière sauvegarde ──
    private val _lastSaveTime = MutableStateFlow(0L)
    val lastSaveTime: StateFlow<Long> = _lastSaveTime

    private val _isSaving = MutableStateFlow(false)
    val isSaving: StateFlow<Boolean> = _isSaving

    private val _saveError = MutableStateFlow<String?>(null)
    val saveError: StateFlow<String?> = _saveError

    private var autoSaveJob: Job? = null
    private var sessionId: String? = null

    /**
     * Démarrer le service d'auto-save pour une session donnée.
     */
    fun start(sessionId: String) {
        this.sessionId = sessionId
        stopAutoSave()
        autoSaveJob = scope.launch {
            while (isActive) {
                delay(saveIntervalMs)
                flushDirtyReponses()
            }
        }
    }

    /**
     * Mettre à jour une réponse locale (ne sauvegarde pas immédiatement).
     */
    fun updateReponse(questionId: String, contenu: String) {
        _localReponses.value = _localReponses.value + (questionId to contenu)
        _dirtyQuestions.value = _dirtyQuestions.value + questionId
    }

    /**
     * Sauvegarder immédiatement une seule réponse (pour les interactions clavier).
     * Debouncée côté UI (300ms après la dernière frappe).
     */
    suspend fun saveReponseNow(questionId: String, contenu: String) {
        val sid = sessionId ?: return
        try {
            sessionApi.saveReponse(sid, questionId, contenu)
            _dirtyQuestions.value = _dirtyQuestions.value - questionId
            _lastSaveTime.value = System.currentTimeMillis()
            _saveError.value = null
        } catch (e: Exception) {
            _saveError.value = e.message
        }
    }

    /**
     * Sauvegarder toutes les réponses modifiées (dirty).
     */
    suspend fun flushDirtyReponses() {
        val sid = sessionId ?: return
        val dirty = _dirtyQuestions.value
        if (dirty.isEmpty()) return

        _isSaving.value = true
        var failed = 0
        for (questionId in dirty) {
            val contenu = _localReponses.value[questionId] ?: continue
            try {
                sessionApi.saveReponse(sid, questionId, contenu)
                _dirtyQuestions.value = _dirtyQuestions.value - questionId
            } catch (_: Exception) {
                failed++
            }
        }
        _lastSaveTime.value = System.currentTimeMillis()
        _saveError.value = if (failed > 0) "$failed réponses non sauvegardées" else null
        _isSaving.value = false
    }

    /**
     * Sauvegarder TOUTES les réponses (pour la soumission finale).
     */
    suspend fun flushAllReponses() {
        val sid = sessionId ?: return
        _isSaving.value = true
        for ((questionId, contenu) in _localReponses.value) {
            try {
                sessionApi.saveReponse(sid, questionId, contenu)
            } catch (_: Exception) { continue }
        }
        _dirtyQuestions.value = emptySet()
        _lastSaveTime.value = System.currentTimeMillis()
        _saveError.value = null
        _isSaving.value = false
    }

    /**
     * Charger des réponses existantes (reprise de session).
     */
    fun loadExistingReponses(reponses: Map<String, String>) {
        _localReponses.value = reponses
        _dirtyQuestions.value = emptySet() // Pas dirty — déjà sur le serveur
    }

    /**
     * Arrêter l'auto-save.
     */
    fun stopAutoSave() {
        autoSaveJob?.cancel()
        autoSaveJob = null
    }

    /**
     * Nettoyer le service.
     */
    fun clear() {
        stopAutoSave()
        sessionId = null
        _localReponses.value = emptyMap()
        _dirtyQuestions.value = emptySet()
        _saveError.value = null
    }
}
