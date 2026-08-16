// SECT Mobile — HttpClientFactory Android (OkHttp engine)
package com.sect.mobile.shared.platform

import com.sect.mobile.shared.network.client.configureHttpClient
import io.ktor.client.*
import io.ktor.client.engine.okhttp.OkHttp

/**
 * Android implementation of HttpClientFactory using OkHttp engine.
 *
 * Provided via Koin DI in platformModule:
 *   single<HttpClientFactory> { AndroidHttpClientFactory() }
 *
 * Replaces the deprecated expect/actual createHttpClient() function.
 */
class AndroidHttpClientFactory : HttpClientFactory {
    override fun create(
        baseUrl: String,
        tokenProvider: () -> String,
        refreshHandler: suspend () -> String
    ): HttpClient {
        val client = HttpClient(OkHttp)
        return configureHttpClient(client, baseUrl, tokenProvider, refreshHandler)
    }
}
