// SECT Mobile — ExamPrepPracticeViewModel (entraînement + génération IA)
// SECT-EXAMPREP-CONTRACT-F1
//
// Le VM le plus complexe : gère config → génération → questions → réponse →
// soumission → résultat. Utilise PracticeGenerationState (sealed class avec
// polling 200 PRET / 202 EN_COURS géré par le repository).
package com.sect.mobile.shared.presentation.examprep.practice

import com.sect.mobile.shared.domain.model.examprep.*
import com.sect.mobile.shared.domain.repository.examprep.ExamPrepRepository
import com.sect.mobile.shared.presentation.BaseViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class ExamPrepPracticeState(
    val isLoadingAttempts: Boolean = true,
    val error: String? = null,
    val documentId: String? = null,
    val chapterId: String? = null,
    val nombreQuestions: Int = 10,
    val difficulte: String = "MOYEN",
    val generationState: PracticeGenerationState = PracticeGenerationState.Idle,
    val questions: List<PracticeQuestion> = emptyList(),
    val currentIndex: Int = 0,
    val userAnswers: Map<String, List<String>> = emptyMap(),
    val attempts: List<PracticeAttempt> = emptyList(),
    val lastResult: PracticeAttempt? = null
) {
    /** Question courante. */
    val currentQuestion: PracticeQuestion? get() = questions.getOrNull(currentIndex)

    /** Progression (0-1). */
    val progress: Float
        get() = if (questions.isEmpty()) 0f else (currentIndex + 1f) / questions.size

    /** Nombre de questions répondues. */
    val answeredCount: Int get() = userAnswers.size

    /** Toutes les questions ont une réponse. */
    val allAnswered: Boolean get() = questions.isNotEmpty() && userAnswers.size == questions.size
}

class ExamPrepPracticeViewModel(
    private val repository: ExamPrepRepository
) : BaseViewModel() {

    private val _state = MutableStateFlow(ExamPrepPracticeState())
    val state: StateFlow<ExamPrepPracticeState> = _state.asStateFlow()

    init { loadAttempts() }

    fun loadAttempts(documentId: String? = null) {
        _state.value = _state.value.copy(isLoadingAttempts = true, documentId = documentId)
        launch {
            val attempts = repository.listPracticeAttempts(documentId)
            _state.value = _state.value.copy(isLoadingAttempts = false, attempts = attempts)
        }
    }

    // ── Configuration ──

    fun setDocument(documentId: String) {
        _state.value = _state.value.copy(documentId = documentId)
    }

    fun setChapter(chapterId: String?) {
        _state.value = _state.value.copy(chapterId = chapterId)
    }

    fun setQuestionCount(count: Int) {
        _state.value = _state.value.copy(nombreQuestions = count)
    }

    fun setDifficulte(d: String) {
        _state.value = _state.value.copy(difficulte = d)
    }

    // ── Génération ──

    /**
     * Démarre la génération de questions.
     * Le repository gère le protocole 200 PRET / 202 EN_COURS + polling.
     */
    fun generate() {
        val docId = _state.value.documentId ?: run {
            _state.value = _state.value.copy(error = "Document requis")
            return
        }
        _state.value = _state.value.copy(generationState = PracticeGenerationState.Generating, error = null)
        launch {
            val result = repository.generatePractice(
                documentId = docId,
                nombreQuestions = _state.value.nombreQuestions,
                difficulte = _state.value.difficulte,
                chapterId = _state.value.chapterId
            )
            when (result) {
                is PracticeGenerationState.Ready -> {
                    _state.value = _state.value.copy(
                        generationState = result,
                        questions = result.questions,
                        currentIndex = 0,
                        userAnswers = emptyMap()
                    )
                }
                is PracticeGenerationState.Timeout -> {
                    _state.value = _state.value.copy(generationState = result, error = "Délai dépassé (60s)")
                }
                is PracticeGenerationState.Failed -> {
                    _state.value = _state.value.copy(generationState = result, error = result.message)
                }
                else -> {
                    _state.value = _state.value.copy(generationState = result)
                }
            }
        }
    }

    fun resetGeneration() {
        _state.value = _state.value.copy(
            generationState = PracticeGenerationState.Idle,
            questions = emptyList(),
            currentIndex = 0,
            userAnswers = emptyMap(),
            lastResult = null
        )
    }

    // ── Réponses ──

    fun answerQuestion(questionId: String, answers: List<String>) {
        _state.value = _state.value.copy(
            userAnswers = _state.value.userAnswers + (questionId to answers)
        )
    }

    fun nextQuestion() {
        if (_state.value.currentIndex < _state.value.questions.size - 1) {
            _state.value = _state.value.copy(currentIndex = _state.value.currentIndex + 1)
        }
    }

    fun previousQuestion() {
        if (_state.value.currentIndex > 0) {
            _state.value = _state.value.copy(currentIndex = _state.value.currentIndex - 1)
        }
    }

    // ── Soumission ──

    /**
     * Soumet la réponse de la question courante.
     * Le backend calcule le score + met à jour le SRS automatiquement.
     */
    fun submitCurrentAnswer() {
        val s = _state.value
        val question = s.currentQuestion ?: return
        val userAnswer = s.userAnswers[question.id] ?: return
        val correct = userAnswer.sorted() == question.reponseCorrecte.sorted()

        launch {
            try {
                val attempt = repository.submitPractice(
                    attemptId = question.id, // le backend utilise questionId comme attemptId pour la première soumission
                    questionId = question.id,
                    documentId = question.documentId,
                    chapterId = "", // chapterId optionnel
                    score = if (correct) 1.0 else 0.0,
                    correct = correct,
                    dureeSec = 0 // TODO : mesurer le temps réel
                )
                _state.value = _state.value.copy(lastResult = attempt)
            } catch (e: Exception) {
                _state.value = _state.value.copy(error = e.message)
            }
        }
    }

    override fun onError(error: Exception) {
        _state.value = _state.value.copy(isLoadingAttempts = false, error = error.message)
    }
}
