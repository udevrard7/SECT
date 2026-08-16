// SECT Mobile — Deep Links handler
// SECT-MOBILE-NAV-PHASE-E : support des URI sect:// pour navigation depuis
// notifications push, emails, partage, etc.
//
// Formats supportés :
//   sect://epreuves/{id}          → détail d'une épreuve
//   sect://corrections/{sessionId} → détail de correction
//   sect://messagerie/{convId}    → conversation
//   sect://dashboard              → accueil
//   sect://passation/{id}         → mode examen (immersive)
package com.sect.mobile.android.navigation

import android.content.Intent
import android.net.Uri

/**
 * Parse un deep link sect:// en cible de navigation.
 */
sealed class DeepLinkTarget {
    object Dashboard : DeepLinkTarget()
    object Messagerie : DeepLinkTarget()
    object Corrections : DeepLinkTarget()
    object Resultats : DeepLinkTarget()
    object Travail : DeepLinkTarget()
    object Profile : DeepLinkTarget()
    data class EpreuveDetail(val id: String) : DeepLinkTarget()
    data class CorrectionDetail(val sessionId: String) : DeepLinkTarget()
    data class Conversation(val conversationId: String) : DeepLinkTarget()
    data class Passation(val epreuveId: String) : DeepLinkTarget()
    data class Unknown(val uri: String) : DeepLinkTarget()

    companion object {
        /**
         * Parse un Intent (ACTION_VIEW avec data sect://...) en DeepLinkTarget.
         * Retourne null si l'intent n'est pas un deep link SECT.
         */
        fun fromIntent(intent: Intent?): DeepLinkTarget? {
            val data: Uri = intent?.data ?: return null
            if (data.scheme != "sect") return null
            return parse(data)
        }

        /**
         * Parse une URI sect:// en DeepLinkTarget.
         */
        fun parse(uri: Uri): DeepLinkTarget {
            val host = uri.host ?: return Unknown(uri.toString())
            val segments = uri.pathSegments
            return when (host) {
                "dashboard" -> Dashboard
                "messagerie" -> {
                    if (segments.isNotEmpty()) Conversation(segments[0])
                    else Messagerie
                }
                "corrections" -> {
                    if (segments.isNotEmpty()) CorrectionDetail(segments[0])
                    else Corrections
                }
                "resultats" -> Resultats
                "travail" -> Travail
                "profile" -> Profile
                "epreuves" -> {
                    if (segments.isNotEmpty()) EpreuveDetail(segments[0])
                    else Travail
                }
                "passation" -> {
                    if (segments.isNotEmpty()) Passation(segments[0])
                    else Unknown(uri.toString())
                }
                else -> Unknown(uri.toString())
            }
        }
    }
}

/**
 * Convertit un DeepLinkTarget en route de navigation (string).
 */
fun DeepLinkTarget.toRoute(): String? = when (this) {
    DeepLinkTarget.Dashboard -> "dashboard"
    DeepLinkTarget.Messagerie -> "messagerie"
    DeepLinkTarget.Corrections -> "corrections"
    DeepLinkTarget.Resultats -> "resultats"
    DeepLinkTarget.Travail -> "travail"
    DeepLinkTarget.Profile -> "profile"
    is DeepLinkTarget.EpreuveDetail -> "epreuves/$id"
    is DeepLinkTarget.CorrectionDetail -> "corrections/$sessionId"
    is DeepLinkTarget.Conversation -> "messagerie/$conversationId"
    is DeepLinkTarget.Passation -> "passation/$epreuveId"
    is DeepLinkTarget.Unknown -> null
}
