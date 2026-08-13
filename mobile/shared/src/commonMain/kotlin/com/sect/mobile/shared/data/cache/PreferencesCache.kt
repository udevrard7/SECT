package com.sect.mobile.shared.data.cache

/**
 * PreferencesCache — Cache for non-sensitive user preferences.
 *
 * SECURITY RULE:
 * - TokenCache (Keychain/EncryptedSharedPreferences): ONLY for accessToken, refreshToken, encryption keys
 * - PreferencesCache (UserDefaults/SharedPreferences): ONLY for theme, language, display preferences
 *
 * NEVER store secrets in PreferencesCache.
 * NEVER store preferences in TokenCache.
 *
 * Platform implementations:
 * - Android: SharedPreferences or DataStore<Preferences>
 * - iOS:     UserDefaults
 *
 * Usage via Koin:
 *   val prefs: PreferencesCache = get()
 *   prefs.putBoolean(PreferenceKeys.THEME_DARK, true)
 */
interface PreferencesCache {
    suspend fun getString(key: String): String?
    suspend fun putString(key: String, value: String)
    suspend fun getBoolean(key: String): Boolean
    suspend fun putBoolean(key: String, value: Boolean)
    suspend fun getInt(key: String): Int
    suspend fun putInt(key: String, value: Int)
    suspend fun remove(key: String)
    suspend fun clear()
}

/**
 * Standard preference keys used across the SECT app.
 *
 * These are NON-SECURE preferences. For secure storage (tokens, keys),
 * use TokenCache with its expect/actual implementations.
 */
object PreferenceKeys {
    /** Whether dark mode is enabled. */
    const val THEME_DARK = "theme_dark"

    /** UI language code (e.g., "fr", "en"). */
    const val LANGUAGE = "language"

    /** Whether biometric login is enabled. */
    const val BIOMETRIC_ENABLED = "biometric_enabled"

    /** Whether push notifications are enabled. */
    const val NOTIFICATIONS_ENABLED = "notifications_enabled"

    /** Whether auto-save is enabled during exam passation. */
    const val AUTO_SAVE_ENABLED = "auto_save_enabled"

    /** Auto-save interval in seconds. */
    const val AUTO_SAVE_INTERVAL = "auto_save_interval_sec"

    /** Last logged-in user ID (for biometric unlock). */
    const val LAST_USER_ID = "last_user_id"
}
