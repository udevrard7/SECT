// SECT Mobile — ExamPrepAudioViewModel (podcasts de révision)
// SECT-EXAMPREP-CONTRACT-F1
//
// ⚠️ audioUrl est présignée pour 15 minutes — ne pas stocker durablement.
// Le mobile doit re-fetch GET /audio/{id} pour obtenir une nouvelle URL.
package com.sect.mobile.shared.presentation.examprep.audio

import com.sect.mobile.shared.domain.model.examprep.AudioGenerationState
import com.sect.mobile.shared.domain.model.examprep.DocumentAudio
import com.sect.mobile.shared.domain.repository.examprep.ExamPrepRepository
import com.sect.mobile.shared.presentation.BaseViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class ExamPrepAudioState(
    val isLoadingList: Boolean = true,
    val error: String? = null,
    val documentId: String? = null,
    val audios: List<DocumentAudio> = emptyList(),
    val generationState: AudioGenerationState = AudioGenerationState.Idle,
    val currentAudio: DocumentAudio? = null,
    val isPlaying: Boolean = false
)

class ExamPrepAudioViewModel(
    private val repository: ExamPrepRepository
) : BaseViewModel() {

    private val _state = MutableStateFlow(ExamPrepAudioState())
    val state: StateFlow<ExamPrepAudioState> = _state.asStateFlow()

    fun loadAudios(documentId: String) {
        _state.value = _state.value.copy(isLoadingList = true, documentId = documentId, error = null)
        launch {
            val audios = repository.listDocumentAudio(documentId)
            _state.value = _state.value.copy(isLoadingList = false, audios = audios)
        }
    }

    /**
     * Génère un podcast pour un document (202 + worker async).
     * Le backend génère : Document → Script IA → TTS → MP3 → R2.
     */
    fun generate(documentId: String) {
        _state.value = _state.value.copy(generationState = AudioGenerationState.Generating, error = null)
        launch {
            try {
                val audio = repository.generateAudio(documentId)
                // Si déjà PRET, on l'affiche. Sinon, on poll.
                if (audio.status == "PRET") {
                    _state.value = _state.value.copy(generationState = AudioGenerationState.Ready(audio))
                    loadAudios(documentId)
                } else {
                    // Poll jusqu'à PRET ou ERREUR (max 5 min = 30 × 10s)
                    pollAudioStatus(audio.id, documentId)
                }
            } catch (e: Exception) {
                _state.value = _state.value.copy(generationState = AudioGenerationState.Failed(e.message ?: "Erreur"))
            }
        }
    }

    private suspend fun pollAudioStatus(audioId: String, documentId: String) {
        val maxAttempts = 30 // 30 × 10s = 5 min
        repeat(maxAttempts) {
            delay(10000)
            try {
                val audio = repository.getAudio(audioId)
                when (audio.status) {
                    "PRET" -> {
                        _state.value = _state.value.copy(generationState = AudioGenerationState.Ready(audio))
                        loadAudios(documentId)
                        return
                    }
                    "ERREUR" -> {
                        _state.value = _state.value.copy(generationState = AudioGenerationState.Failed("Génération échouée"))
                        return
                    }
                    // EN_COURS → continue polling
                }
            } catch (_: Exception) {
                // Continue polling on transient errors
            }
        }
        _state.value = _state.value.copy(generationState = AudioGenerationState.Failed("Timeout (5min)"))
    }

    /**
     * Récupère une URL présignée fraîche (l'ancienne expire après 15min).
     */
    fun refreshAudioUrl(audioId: String) {
        launch {
            try {
                val audio = repository.getAudio(audioId)
                _state.value = _state.value.copy(currentAudio = audio)
            } catch (e: Exception) {
                _state.value = _state.value.copy(error = e.message)
            }
        }
    }

    fun play(audio: DocumentAudio) {
        _state.value = _state.value.copy(currentAudio = audio, isPlaying = true)
    }

    fun stop() {
        _state.value = _state.value.copy(isPlaying = false)
    }

    fun delete(audioId: String) {
        launch {
            try {
                repository.deleteAudio(audioId)
                val current = _state.value
                _state.value = current.copy(
                    audios = current.audios.filter { a -> a.id != audioId },
                    currentAudio = if (current.currentAudio?.id == audioId) null else current.currentAudio
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(error = e.message)
            }
        }
    }

    fun resetGeneration() {
        _state.value = _state.value.copy(generationState = AudioGenerationState.Idle)
    }

    override fun onError(error: Exception) {
        _state.value = _state.value.copy(isLoadingList = false, error = error.message)
    }
}
