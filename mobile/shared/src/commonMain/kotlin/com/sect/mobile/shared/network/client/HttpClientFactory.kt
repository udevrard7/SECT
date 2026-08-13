// SECT Mobile — Client HTTP Ktor (DEPRECATED expect declaration)
// Préférer : com.sect.mobile.shared.platform.HttpClientFactory (interface) + Koin DI
// Avantage : testabilité (MockHttpClientFactory en tests unitaires)
package com.sect.mobile.shared.network.client

import io.ktor.client.*
import io.ktor.client.engine.*

/**
 * Crée un HttpClient Ktor configuré pour communiquer avec le backend Go SECT.
 *
 * @param engine Engine HTTP spécifique à la plateforme (OkHttp pour Android, Darwin pour iOS)
 * @param baseUrl URL de base du backend (ex: https://sect-zead.onrender.com)
 * @param tokenProvider Fonction qui retourne le JWT access token courant (depuis le cache)
 * @param refreshHandler Fonction pour rafraîchir le token expiré
 */
@Deprecated(
    message = "Utilisez com.sect.mobile.shared.platform.HttpClientFactory (interface) + Koin DI",
    level = DeprecationLevel.WARNING,
    replaceWith = ReplaceWith("httpClientFactory.create(baseUrl, tokenProvider, refreshHandler)", "com.sect.mobile.shared.platform.HttpClientFactory")
)
expect fun createHttpClient(
    engine: HttpClientEngine,
    baseUrl: String,
    tokenProvider: () -> String,
    refreshHandler: suspend () -> String
): HttpClient
