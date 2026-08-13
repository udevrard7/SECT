// SECT Mobile — Offline Cache Strategy
// Gestion du cache local pour le mode hors-ligne
package com.sect.mobile.shared.cache.local

import com.sect.mobile.shared.domain.model.Epreuve
import com.sect.mobile.shared.domain.model.User
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.datetime.Clock
import kotlinx.serialization.json.Json

/**
 * OfflineCache gère le cache local des données pour permettre
 * le fonctionnement de l'app sans connexion internet.
 *
 * Stratégie de cache :
 * - Epreuves PLANIFIEES : mises en cache à l'avance (l'étudiant peut les passer offline)
 * - Profil utilisateur : mis en cache au login
 * - Conversations/messages : cache temporaire (TTL 1h)
 * - Réponses en cours : toujours en local (auto-save), poussées au backend quand online
 *
 * Implémentation :
 * - En phase 1 : In-memory cache avec sérialisation JSON (simple, fonctionne partout)
 * - En phase 2 : SQLDelight pour une DB SQLite native (performant, requêtable)
 *
 * Cache-aside pattern :
 * 1. Lire depuis le cache → si présent et non expiré, retourner
 * 2. Sinon, lire depuis l'API → stocker dans le cache → retourner
 * 3. Si offline, retourner le cache même si expiré (stale-while-revalidate)
 */
class OfflineCache(
    private val json: Json = Json { ignoreUnknownKeys = true; encodeDefaults = true },
    private val defaultTtlMs: Long = 3_600_000L // 1 heure par défaut
) {
    // ── In-memory cache store ──
    private val store = MutableStateFlow<Map<String, CacheEntry>>(emptyMap())

    // ── Network status ──
    private val _isOnline = MutableStateFlow(true)
    val isOnline: StateFlow<Boolean> = _isOnline

    fun setOnlineStatus(online: Boolean) {
        _isOnline.value = online
    }

    /**
     * Stocker une valeur dans le cache.
     */
    fun <T> put(key: String, value: T, serializer: (T) -> String = { json.encodeToString(it) }) {
        val entry = CacheEntry(
            data = serializer(value),
            storedAt = Clock.System.now().toEpochMilliseconds(),
            ttlMs = defaultTtlMs
        )
        store.value = store.value + (key to entry)
    }

    /**
     * Lire une valeur depuis le cache.
     * @return La valeur désérialisée, ou null si absent/expiré
     */
    fun <T> get(key: String, deserializer: (String) -> T): T? {
        val entry = store.value[key] ?: return null
        val now = Clock.System.now().toEpochMilliseconds()
        val isExpired = (now - entry.storedAt) > entry.ttlMs

        // Si online et expiré → retourner null (forcer un refresh)
        // Si offline → retourner même si expiré (stale-while-revalidate)
        if (isExpired && _isOnline.value) return null

        return try { deserializer(entry.data) } catch (_: Exception) { null }
    }

    /**
     * Invalider une entrée du cache.
     */
    fun invalidate(key: String) {
        store.value = store.value - key
    }

    /**
     * Invalider toutes les entrées correspondant à un préfixe.
     */
    fun invalidateByPrefix(prefix: String) {
        store.value = store.value.filterKeys { !it.startsWith(prefix) }
    }

    /**
     * Vider tout le cache.
     */
    fun clear() {
        store.value = emptyMap()
    }

    /**
     * Vérifier si une entrée existe et est valide.
     */
    fun contains(key: String): Boolean {
        val entry = store.value[key] ?: return false
        val now = Clock.System.now().toEpochMilliseconds()
        return (now - entry.storedAt) <= entry.ttlMs || !_isOnline.value
    }

    // ── Clés de cache standardisées ──
    object Keys {
        fun userProfile(userId: String) = "user:$userId"
        fun epreuve(epreuveId: String) = "epreuve:$epreuveId"
        fun epreuveList(filter: String) = "epreuves:$filter"
        fun conversations() = "conversations"
        fun messages(conversationId: String) = "messages:$conversationId"
        fun session(sessionId: String) = "session:$sessionId"
    }
}

data class CacheEntry(
    val data: String,
    val storedAt: Long,
    val ttlMs: Long
)
