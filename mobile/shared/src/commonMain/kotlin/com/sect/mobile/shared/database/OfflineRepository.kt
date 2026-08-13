// SECT Mobile — Offline Repository (SQLDelight-backed)
// Replaces the in-memory OfflineCache with persistent SQLite storage.
package com.sect.mobile.shared.database

import com.sect.mobile.shared.database.SectDatabase
import com.sect.mobile.shared.util.currentTimeMillis
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json

/**
 * OfflineRepository provides typed access to the SQLDelight database
 * for offline-first data access.
 *
 * Cache-aside pattern:
 * 1. Read from SQLite → if present and not expired, return
 * 2. Otherwise, read from API → store in SQLite → return
 * 3. If offline, return cache even if expired (stale-while-revalidate)
 */
class OfflineRepository(
    private val database: SectDatabase,
    private val json: Json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
) {
    private val userQueries get() = database.cached_userQueries
    private val epreuveQueries get() = database.cached_epreuveQueries
    private val sessionQueries get() = database.cached_sessionQueries
    private val reponseQueries get() = database.local_reponseQueries
    private val conversationQueries get() = database.cached_conversationQueries
    private val messageQueries get() = database.cached_messageQueries

    // Default TTL: 1 hour
    private val defaultTtlMs: Long = 3_600_000L

    // ── User cache ──

    fun getCachedUser(userId: String): String? {
        return userQueries.getUser(userId).executeAsOneOrNull()?.user_json
    }

    fun getCachedUserIfValid(userId: String): String? {
        val now = currentTimeMillis()
        return userQueries.getUserIfValid(userId, now).executeAsOneOrNull()?.user_json
    }

    fun putCachedUser(
        id: String, email: String, name: String, role: String,
        etablissementId: String?, filiereId: String?, matricule: String?,
        image: String?, userJson: String
    ) {
        val now = currentTimeMillis()
        userQueries.insertUser(
            id, email, name, role, etablissementId, filiereId, matricule, image,
            userJson, now, now + defaultTtlMs
        )
    }

    // ── Epreuve cache ──

    fun getCachedEpreuve(epreuveId: String): String? {
        return epreuveQueries.getEpreuve(epreuveId).executeAsOneOrNull()?.questions_json
    }

    fun getCachedEpreuveIfValid(epreuveId: String): String? {
        val now = currentTimeMillis()
        return epreuveQueries.getEpreuveIfValid(epreuveId, now).executeAsOneOrNull()?.questions_json
    }

    fun putCachedEpreuve(
        id: String, titre: String, description: String?, duree: Int,
        dateDebut: String, dateFin: String, statut: String, noteTotal: Double,
        proctoringActif: Boolean, filiereId: String?, enseignantId: String,
        questionsJson: String
    ) {
        val now = currentTimeMillis()
        epreuveQueries.insertEpreuve(
            id, titre, description, duree, dateDebut, dateFin, statut, noteTotal,
            proctoringActif, filiereId, enseignantId, questionsJson, now, now + defaultTtlMs
        )
    }

    fun listCachedEpreuvesByStatut(statut: String): List<String> {
        return epreuveQueries.listEpreuvesByStatut(statut).executeAsList().map { it.questions_json }
    }

    // ── Session cache ──

    fun getCachedSession(sessionId: String) =
        sessionQueries.getSession(sessionId).executeAsOneOrNull()

    fun putCachedSession(
        id: String, etudiantId: String, epreuveId: String, statut: String,
        dateDebut: String?, dateSoumission: String?, tempsRestant: Int?, note: Double?
    ) {
        val now = currentTimeMillis()
        sessionQueries.insertSession(
            id, etudiantId, epreuveId, statut, dateDebut, dateSoumission,
            tempsRestant, note, now, now + defaultTtlMs
        )
    }

    // ── Local Réponses (auto-save + offline outbox) ──

    fun saveLocalReponse(sessionId: String, questionId: String, contenu: String) {
        reponseQueries.insertReponse(sessionId, questionId, contenu, currentTimeMillis(), false)
    }

    fun getUnsyncedReponses() =
        reponseQueries.getUnsyncedReponses().executeAsList()

    fun markReponseSynced(sessionId: String, questionId: String) {
        reponseQueries.markReponseSynced(sessionId, questionId)
    }

    fun getReponsesBySession(sessionId: String) =
        reponseQueries.getReponsesBySession(sessionId).executeAsList()

    // ── Conversation cache ──

    fun putCachedConversation(
        id: String, type: String, titre: String?, etablissementId: String?,
        filiereId: String?, epreuveId: String?, lastMessageJson: String?
    ) {
        val now = currentTimeMillis()
        conversationQueries.insertConversation(
            id, type, titre, etablissementId, filiereId, epreuveId,
            lastMessageJson, now, now + defaultTtlMs
        )
    }

    fun listCachedConversations() =
        conversationQueries.listConversations().executeAsList()

    // ── Message cache ──

    fun putCachedMessage(
        id: String, conversationId: String, expediteurId: String,
        contenu: String, createdAt: String, expediteurName: String?
    ) {
        messageQueries.insertMessage(
            id, conversationId, expediteurId, contenu, createdAt,
            expediteurName, currentTimeMillis()
        )
    }

    fun getCachedMessages(conversationId: String) =
        messageQueries.getMessagesByConversation(conversationId).executeAsList()

    // ── Cache maintenance ──

    fun evictExpired() {
        val now = currentTimeMillis()
        userQueries.deleteExpiredUsers(now)
        epreuveQueries.deleteExpiredEpreuves(now)
        sessionQueries.deleteExpiredSessions(now)
        conversationQueries.deleteExpiredConversations(now)
        reponseQueries.deleteSyncedReponses()
    }

    fun clearAll() {
        userQueries.deleteAllUsers()
        epreuveQueries.deleteAllEpreuves()
        conversationQueries.deleteAllConversations()
    }
}
