// SECT Mobile — Abstraction du cache de tokens JWT
// Chaque plateforme fournit sa propre implémentation sécurisée :
// - Android : EncryptedSharedPreferences
// - iOS : Keychain
package com.sect.mobile.shared.cache

/**
 * Interface pour le stockage sécurisé des tokens d'authentification.
 * Les implémentations utilisent les APIs natives de sécurité de chaque plateforme.
 */
interface TokenCache {
    /**
     * Sauvegarder l'access token JWT.
     */
    suspend fun saveAccessToken(token: String)

    /**
     * Récupérer l'access token JWT.
     * Retourne une chaîne vide si non trouvé.
     */
    suspend fun getAccessToken(): String

    /**
     * Sauvegarder le refresh token.
     */
    suspend fun saveRefreshToken(token: String)

    /**
     * Récupérer le refresh token.
     * Retourne une chaîne vide si non trouvé.
     */
    suspend fun getRefreshToken(): String

    /**
     * Sauvegarder la session complète.
     */
    suspend fun saveSession(accessToken: String, refreshToken: String, expiresAt: String)

    /**
     * Effacer tous les tokens (logout).
     */
    suspend fun clear()

    /**
     * Vérifier si un token est disponible.
     */
    suspend fun isAuthenticated(): Boolean = getAccessToken().isNotEmpty()
}

/**
 * Factory expect/actual pour créer le cache de tokens approprié à la plateforme.
 * @deprecated Préférer l'injection via Koin DI (single<TokenCache> { AndroidTokenCache(ctx) })
 */
@Deprecated(
    message = "Préférer l'injection Koin DI : single<TokenCache> { AndroidTokenCache(ctx) / IOSTokenCache() }",
    level = DeprecationLevel.WARNING
)
expect fun createTokenCache(): TokenCache
