// SECT Mobile — Badges dynamiques (messages non lus, corrections en attente)
// SECT-MOBILE-NAV-PHASE-E : holder central pour les compteurs de badges
package com.sect.mobile.android.ui.components

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Holder central des compteurs de badges pour la navigation.
 *
 * Alimenté par :
 * - MessagerieViewModel (messages non lus via SSE/polling)
 * - CorrectionsViewModel (sessions needsCorrectionCount > 0)
 *
 * Consommé par SectBottomNavigationBar pour afficher les badges sur les onglets.
 */
object BadgeManager {
    private val _unreadMessages = MutableStateFlow(0)
    val unreadMessages: StateFlow<Int> = _unreadMessages.asStateFlow()

    private val _pendingCorrections = MutableStateFlow(0)
    val pendingCorrections: StateFlow<Int> = _pendingCorrections.asStateFlow()

    fun setUnreadMessages(count: Int) {
        _unreadMessages.value = count
    }

    fun setPendingCorrections(count: Int) {
        _pendingCorrections.value = count
    }

    fun incrementUnread() {
        _unreadMessages.value++
    }

    fun decrementUnread() {
        if (_unreadMessages.value > 0) _unreadMessages.value--
    }
}
