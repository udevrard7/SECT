// SECT Mobile — Deep Links handler
// SECT-MOBILE-NAV-PHASE-E : support des URI sect:// pour navigation depuis
// notifications push, emails, partage, etc.
//
// SECT-MOBILE-PARITY-T1-ACTIVATION : parser étendu avec devoirs/{id},
// examprep/* (parité avec iOS), et resultats/{epreuveId} (détail, pas liste).
//
// Formats supportés :
//   sect://dashboard                    → accueil
//   sect://travail                      → onglet Travail
//   sect://epreuves/{id}                → détail d'une épreuve
//   sect://devoirs/{devoirId}           → détail d'un devoir (NOUVEAU)
//   sect://examprep/home                → ExamPrep home (NOUVEAU)
//   sect://examprep/documents           → ExamPrep documents (NOUVEAU)
//   sect://examprep/reader/{docId}      → ExamPrep reader (NOUVEAU)
//   sect://examprep/{review|practice|progress|qa|flashcards|planning|help} (NOUVEAU)
//   sect://resultats                    → liste des résultats
//   sect://resultats/{epreuveId}        → détail d'un résultat (FIX : segment ignoré avant)
//   sect://corrections                  → liste des corrections
//   sect://corrections/{sessionId}      → détail de correction
//   sect://messagerie                   → liste des conversations
//   sect://messagerie/{convId}          → conversation
//   sect://passation/{epreuveId}        → mode examen (immersive)
//   sect://profile                       → profil utilisateur
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
    data class DevoirDetail(val devoirId: String) : DeepLinkTarget()
    data class ResultatDetail(val epreuveId: String) : DeepLinkTarget()
    data class CorrectionDetail(val sessionId: String) : DeepLinkTarget()
    data class Conversation(val conversationId: String) : DeepLinkTarget()
    data class Passation(val epreuveId: String) : DeepLinkTarget()
    // ExamPrep (parité avec iOS parser)
    data class ExamPrepHome(val sub: String? = null) : DeepLinkTarget()
    data class ExamPrepReader(val documentId: String) : DeepLinkTarget()
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
                // SECT-MOBILE-PARITY-T1-ACTIVATION : resultats/{epreuveId} → détail (pas liste)
                "resultats" -> {
                    if (segments.isNotEmpty()) ResultatDetail(segments[0])
                    else Resultats
                }
                "travail" -> Travail
                "profile" -> Profile
                "epreuves" -> {
                    if (segments.isNotEmpty()) EpreuveDetail(segments[0])
                    else Travail
                }
                // SECT-MOBILE-PARITY-T1-ACTIVATION : devoirs/{devoirId} (manquait avant)
                "devoirs" -> {
                    if (segments.isNotEmpty()) DevoirDetail(segments[0])
                    else Travail
                }
                "passation" -> {
                    if (segments.isNotEmpty()) Passation(segments[0])
                    else Unknown(uri.toString())
                }
                // SECT-MOBILE-PARITY-T1-ACTIVATION : examprep/* (parité avec iOS)
                "examprep" -> {
                    if (segments.isEmpty()) ExamPrepHome(null)
                    else when (segments[0]) {
                        "reader" -> {
                            if (segments.size > 1) ExamPrepReader(documentId = segments[1])
                            else ExamPrepHome("documents")
                        }
                        "audio" -> {
                            // audio prend un documentId aussi, mais la route audio est examprep/audio/{documentId}
                            // On retourne ExamPrepHome avec sub=audio pour que toRoute() la construise
                            if (segments.size > 1) ExamPrepHome("audio/${segments[1]}")
                            else ExamPrepHome("audio")
                        }
                        else -> ExamPrepHome(segments[0])
                    }
                }
                else -> Unknown(uri.toString())
            }
        }
    }
}

/**
 * Convertit un DeepLinkTarget en route de navigation (string).
 * Retourne null si la cible ne correspond à aucune route (Unknown).
 */
fun DeepLinkTarget.toRoute(): String? = when (this) {
    DeepLinkTarget.Dashboard -> "dashboard"
    DeepLinkTarget.Messagerie -> "messagerie"
    DeepLinkTarget.Corrections -> "corrections"
    DeepLinkTarget.Resultats -> "resultats"
    DeepLinkTarget.Travail -> "travail"
    DeepLinkTarget.Profile -> "profile"
    is DeepLinkTarget.EpreuveDetail -> "epreuves/$id"
    is DeepLinkTarget.DevoirDetail -> "devoirs/$devoirId"
    is DeepLinkTarget.ResultatDetail -> "resultats/$epreuveId"
    is DeepLinkTarget.CorrectionDetail -> "corrections/$sessionId"
    is DeepLinkTarget.Conversation -> "messagerie/$conversationId"
    is DeepLinkTarget.Passation -> "passation/$epreuveId"
    is DeepLinkTarget.ExamPrepHome -> {
        when (sub) {
            null, "home" -> "examprep/home"
            "documents" -> "examprep/documents"
            "review" -> "examprep/review"
            "practice" -> "examprep/practice"
            "progress" -> "examprep/progress"
            "qa" -> "examprep/qa"
            "flashcards" -> "examprep/flashcards"
            "planning" -> "examprep/planning"
            "help" -> "examprep/help"
            // audio sub peut être "audio" (liste) ou "audio/{documentId}" (détail)
            else -> if (sub.startsWith("audio/")) "examprep/audio/${sub.removePrefix("audio/")}"
                    else "examprep/home"
        }
    }
    is DeepLinkTarget.ExamPrepReader -> "examprep/reader/$documentId"
    is DeepLinkTarget.Unknown -> null
}
