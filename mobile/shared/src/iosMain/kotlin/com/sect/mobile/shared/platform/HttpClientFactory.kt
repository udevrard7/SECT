// SECT Mobile — HttpClientFactory iOS (Darwin/NSURLSession engine)
package com.sect.mobile.shared.platform

import com.sect.mobile.shared.network.client.configureHttpClient
import io.ktor.client.*
import io.ktor.client.engine.darwin.Darwin

/**
 * iOS implementation of HttpClientFactory using Darwin/NSURLSession engine.
 *
 * Provided via Koin DI in platformModule:
 *   single<HttpClientFactory> { IOSHttpClientFactory() }
 *
 * Replaces the deprecated expect/actual createHttpClient() function.
 */
class IOSHttpClientFactory : HttpClientFactory {
    override fun create(
        baseUrl: String,
        tokenProvider: () -> String,
        refreshHandler: suspend () -> String
    ): HttpClient {
        val client = HttpClient(Darwin)
        return configureHttpClient(client, baseUrl, tokenProvider, refreshHandler)
    }
}
