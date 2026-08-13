// SECT Mobile — Configuration du client HTTP Ktor
package com.sect.mobile.shared.network.client

import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.engine.*
import io.ktor.client.plugins.*
import io.ktor.client.plugins.auth.*
import io.ktor.client.plugins.auth.providers.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.plugins.logging.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.json.Json

/**
 * Crée un HttpClient Ktor configuré pour communiquer avec le backend Go SECT.
 *
 * @param engine Engine HTTP spécifique à la plateforme (OkHttp pour Android, Darwin pour iOS)
 * @param baseUrl URL de base du backend (ex: https://sect-zead.onrender.com)
 * @param tokenProvider Fonction qui retourne le JWT access token courant (depuis le cache)
 * @param refreshHandler Fonction pour rafraîchir le token expiré
 */
expect fun createHttpClient(
    engine: HttpClientEngine,
    baseUrl: String,
    tokenProvider: () -> String,
    refreshHandler: suspend () -> String
): HttpClient

/**
 * Configuration commune du client HTTP (appelée par les implementations expect/actual)
 */
fun configureHttpClient(
    client: HttpClient,
    baseUrl: String,
    tokenProvider: () -> String,
    refreshHandler: suspend () -> String
): HttpClient {
    return client.config {
        // ── Content Negotiation (JSON) ──
        install(ContentNegotiation) {
            json(Json {
                prettyPrint = false
                isLenient = true
                ignoreUnknownKeys = true
                encodeDefaults = true
                explicitNulls = false
            })
        }

        // ── Auth (Bearer JWT) ──
        install(Auth) {
            bearer {
                loadTokens {
                    val token = tokenProvider()
                    if (token.isNotEmpty()) {
                        BearerTokens(token, "")
                    } else {
                        null
                    }
                }
                refreshTokens {
                    val newToken = refreshHandler()
                    BearerTokens(newToken, "")
                }
            }
        }

        // ── Logging ──
        install(Logging) {
            level = LogLevel.INFO
            logger = Logger.DEFAULT
        }

        // ── Timeouts ──
        install(HttpTimeout) {
            connectTimeoutMillis = 15_000
            requestTimeoutMillis = 30_000
            socketTimeoutMillis = 30_000
        }

        // ── Default request ──
        defaultRequest {
            url(baseUrl)
            contentType(ContentType.Application.Json)
            accept(ContentType.Application.Json)
        }

        // ── Response validation ──
        expectSuccess = true
    }
}
