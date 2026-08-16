// SECT Mobile — Offline Repository (SQLDelight-backed)
// STUB : implémentation temporairement désactivée (SECT-MOBILE-COMPILE-FIX-3).
//
// Les queries SQLDelight (cached_userQueries etc.) ne sont pas accessibles car
// la génération SQLDelight 2.1.0 + Kotlin 2.1.21 + KMP ne produit pas les
// properties sur SectDatabase dans la configuration actuelle.
//
// Ce fichier sera restauré avec la vraie implémentation une fois le problème
// de génération SQLDelight résolu (voir SECT-MOBILE-SQLDELIGHT-UPGRADE).
//
// Le mode offline n'est pas encore fonctionnel sur mobile — l'app fonctionne
// en mode online uniquement pour l'instant.
package com.sect.mobile.shared.database

import com.sect.mobile.shared.platform.TimeProvider
import kotlinx.serialization.json.Json

/**
 * OfflineRepository stub — mode offline désactivé temporairement.
 *
 * Toutes les méthodes retournent null/empty/vide. L'app fonctionne en mode
 * online uniquement. Sera remplacé par la vraie implémentation SQLDelight.
 */
class OfflineRepository(
    private val database: SectDatabase,
    private val timeProvider: TimeProvider,
    private val json: Json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
) {
    // ── User cache ──
    suspend fun getCachedUser(userId: String): String? = null
    suspend fun getValidCachedUser(userId: String): String? = null
    suspend fun cacheUser(userId: String, userJson: String, ttlMs: Long = 3_600_000L) { }
    suspend fun deleteUser(userId: String) { }

    // ── Epreuve cache ──
    suspend fun getCachedEpreuve(epreuveId: String): String? = null
    suspend fun getValidCachedEpreuve(epreuveId: String): String? = null
    suspend fun cacheEpreuve(epreuveId: String, questionsJson: String, ttlMs: Long = 3_600_000L) { }
    suspend fun listCachedEpreuvesByStatut(statut: String): List<String> = emptyList()
    suspend fun deleteEpreuve(epreuveId: String) { }

    // ── Session cache ──
    suspend fun getCachedSession(sessionId: String): String? = null
    suspend fun cacheSession(sessionJson: String) { }
    suspend fun deleteSession(sessionId: String) { }

    // ── Reponse cache (auto-save + offline outbox) ──
    suspend fun saveLocalReponse(sessionId: String, questionId: String, contenu: String) { }
    suspend fun getLocalReponses(sessionId: String): List<String> = emptyList()
    suspend fun getUnsyncedReponses(): List<String> = emptyList()
    suspend fun markReponseSynced(sessionId: String, questionId: String) { }

    // ── Conversation cache ──
    suspend fun getCachedConversations(): List<String> = emptyList()
    suspend fun cacheConversation(conversationJson: String) { }

    // ── Message cache ──
    suspend fun getCachedMessages(conversationId: String): List<String> = emptyList()
    suspend fun cacheMessage(messageJson: String) { }

    // ── Cache management ──
    suspend fun deleteExpired() { }
    suspend fun clearAll() { }
}
