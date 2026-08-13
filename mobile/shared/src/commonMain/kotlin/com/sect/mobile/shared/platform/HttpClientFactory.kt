package com.sect.mobile.shared.platform

import io.ktor.client.*

/**
 * HttpClientFactory — Creates a configured HttpClient for the SECT backend.
 *
 * Interface for DI — replaces the old expect/actual pattern:
 *   OLD: expect fun createHttpClient(engine, baseUrl, tokenProvider, refreshHandler): HttpClient
 *   NEW: interface HttpClientFactory  (provided via Koin platformModule)
 *
 * Platform implementations provide:
 * - The HTTP engine (OkHttp for Android, Darwin for iOS)
 * - Platform-specific configuration (timeouts, interceptors, certificate pinning)
 *
 * Usage via Koin:
 *   val factory: HttpClientFactory = get()
 *   val client = factory.create(
 *       baseUrl = "https://sect-zead.onrender.com",
 *       tokenProvider = { tokenCache.getAccessToken() },
 *       refreshHandler = { authApi.refresh(refreshToken).accessToken }
 *   )
 *
 * The common configuration (ContentNegotiation, Auth, Logging, HttpTimeout)
 * is applied by configureHttpClient() in network/client/HttpClientConfig.kt.
 */
interface HttpClientFactory {
    /**
     * Create a configured HttpClient.
     *
     * @param baseUrl Base URL of the SECT backend (e.g., https://sect-zead.onrender.com)
     * @param tokenProvider Function that returns the current JWT access token (from cache)
     * @param refreshHandler Function to refresh an expired token
     * @return Configured HttpClient ready for API calls
     */
    fun create(
        baseUrl: String,
        tokenProvider: () -> String,
        refreshHandler: suspend () -> String
    ): HttpClient
}
