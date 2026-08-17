// SECT Mobile — ExamPrep états asynchrones (sealed classes)
// SECT-EXAMPREP-CONTRACT-1 : modélisation des états non-triviaux (point #20 de l'audit)
//
// 3 états asynchrones clés :
// - PracticeGenerationState (200 PRET / 202 EN_COURS + polling)
// - AudioGenerationState (202 + worker async)
// - QAState (loading synchrone avec timeout)
package com.sect.mobile.shared.domain.model.examprep

/**
 * État de génération de questions d'entraînement.
 *
 * Flux backend :
 *   POST /practice/generate
 *     ├─ 200 PRET → questions disponibles immédiatement
 *     └─ 202 EN_COURS → polling question-bank toutes les 2s (max 60s)
 *
 * Le mobile DOIT gérer ces 5 états (pas un simple Boolean isLoading).
 */
sealed class PracticeGenerationState {
    /** État initial, aucune génération demandée. */
    object Idle : PracticeGenerationState()
    /** Génération en cours (202 reçu, polling question-bank). */
    object Generating : PracticeGenerationState()
    /** Questions prêtes (200 reçu ou polling a trouvé des questions). */
    data class Ready(val questions: List<PracticeQuestion>) : PracticeGenerationState()
    /** Échec de la génération (erreur IA ou backend). */
    data class Failed(val message: String) : PracticeGenerationState()
    /** Polling dépassé (60s sans résultat). */
    object Timeout : PracticeGenerationState()
}

/**
 * État de génération audio (podcast de révision).
 *
 * Flux backend :
 *   POST /documents/{id}/audio → 202 + AudioGenerationQueue
 *   Worker : Document → Script IA → TTS → MP3 → R2
 *   GET /audio/{id} pour suivre : EN_COURS → PRET / ERREUR
 */
sealed class AudioGenerationState {
    object Idle : AudioGenerationState()
    object Generating : AudioGenerationState()
    data class Ready(val audio: DocumentAudio) : AudioGenerationState()
    data class Failed(val message: String) : AudioGenerationState()
}

/**
 * État Q&A IA (RAG synchrone).
 *
 * POST /qa → réponse directe (200) ou erreur/timeout.
 * citations est actuellement vide côté backend (V2 future) — ne pas construire
 * d'UI sophistiquée de citations pour l'instant.
 */
sealed class QAState {
    object Idle : QAState()
    object Loading : QAState()
    data class Success(val response: QAResponse) : QAState()
    data class Error(val message: String) : QAState()
}

/**
 * État générique pour les opérations CRUD simples.
 */
sealed class ExamPrepUiState<out T> {
    object Loading : ExamPrepUiState<Nothing>()
    data class Success<T>(val data: T) : ExamPrepUiState<T>()
    data class Error(val message: String) : ExamPrepUiState<Nothing>()
}
