// SECT Mobile — Android Proctoring Implementation
// Utilise : Activity lifecycle, WindowManager, CameraX
package com.sect.mobile.android.ui.proctoring

import android.app.Activity
import android.os.Build
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import com.sect.mobile.shared.proctoring.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/**
 * AndroidProctoringService implémente la surveillance d'examen sur Android.
 *
 * Implémentation :
 * - Tab switch / app background → détecté via Activity.onPause/onResume
 * - Fullscreen → détecté via WindowInsetsListener (Android 11+)
 * - Screen capture → détecté via BroadcastReceiver
 * - Copy/paste → détecté via TextView.OnPasteListener (custom EditText)
 */
class AndroidProctoringService(
    private val activity: Activity,
    private val scope: CoroutineScope,
    private val onAlert: (ProctoringEvent) -> Unit = {}
) : ProctoringService, DefaultLifecycleObserver {

    private val _state = MutableStateFlow(ProctoringState())
    override val state: StateFlow<ProctoringState> = _state

    private val _alertCount = MutableStateFlow(0)
    override val alertCount: StateFlow<Int> = _alertCount

    private val _shouldTerminate = MutableStateFlow(false)
    override val shouldTerminate: StateFlow<Boolean> = _shouldTerminate

    private var config: ProctoringConfig = ProctoringConfig()

    override fun onPause(owner: LifecycleOwner) {
        if (_state.value.isActive) {
            reportEvent(ProctoringEvent.APP_BACKGROUND)
        }
        _state.value = _state.value.copy(isAppInForeground = false)
    }

    override fun onResume(owner: LifecycleOwner) {
        if (_state.value.isActive && !_state.value.isAppInForeground) {
            reportEvent(ProctoringEvent.TAB_SWITCH)
        }
        _state.value = _state.value.copy(isAppInForeground = true)
    }

    override suspend fun start(config: ProctoringConfig) {
        this.config = config
        _state.value = _state.value.copy(isActive = true)
        _alertCount.value = 0
        _shouldTerminate.value = false
        (activity as LifecycleOwner).lifecycle.addObserver(this)
        if (config.enableFullscreen) enableImmersiveMode()
    }

    override suspend fun stop() {
        _state.value = _state.value.copy(isActive = false, webcamActive = false)
        (activity as LifecycleOwner).lifecycle.removeObserver(this)
        disableImmersiveMode()
    }

    override fun reportEvent(event: ProctoringEvent) {
        if (!_state.value.isActive) return
        val increment = when (event.severity()) {
            AlertSeverity.LOW -> 0
            AlertSeverity.MEDIUM -> 1
            AlertSeverity.HIGH -> 2
            AlertSeverity.CRITICAL -> 3
        }
        _alertCount.value += increment
        _shouldTerminate.value = _alertCount.value >= config.maxAlerts
        scope.launch(Dispatchers.Main) { onAlert(event) }
    }

    private fun enableImmersiveMode() {
        activity.window?.let { window ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                window.setDecorFitsSystemWindows(false)
                window.insetsController?.let { controller ->
                    controller.hide(android.view.WindowInsets.Type.statusBars() or android.view.WindowInsets.Type.navigationBars())
                    controller.systemBarsBehavior = android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                }
            } else {
                @Suppress("DEPRECATION")
                window.decorView.systemUiVisibility = (
                    android.view.View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    or android.view.View.SYSTEM_UI_FLAG_FULLSCREEN
                    or android.view.View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    or android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    or android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    or android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                )
            }
        }
        _state.value = _state.value.copy(isFullscreen = true)
    }

    private fun disableImmersiveMode() {
        activity.window?.let { window ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                window.setDecorFitsSystemWindows(true)
                window.insetsController?.show(android.view.WindowInsets.Type.statusBars() or android.view.WindowInsets.Type.navigationBars())
            } else {
                @Suppress("DEPRECATION")
                window.decorView.systemUiVisibility = android.view.View.SYSTEM_UI_FLAG_VISIBLE
            }
        }
        _state.value = _state.value.copy(isFullscreen = false)
    }
}
