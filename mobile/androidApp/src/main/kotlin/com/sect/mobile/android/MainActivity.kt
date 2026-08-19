// SECT Mobile — MainActivity Android
package com.sect.mobile.android

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.sect.mobile.android.navigation.SECTNavigation
import com.sect.mobile.android.navigation.DeepLinkHandler
import com.sect.mobile.android.navigation.DeepLinkTarget
import com.sect.mobile.android.theme.SECTTheme

/**
 * MainActivity — point d'entrée Android.
 *
 * SECT-MOBILE-PARITY-T1-ACTIVATION : gère les deep-links sect:// reçus au lancement
 * (onCreate) et à la re-livraison (onNewIntent). Le parser DeepLinkHandler existait
 * mais n'était jamais invoqué — on le branche maintenant.
 *
 * Le résultat du parsing est stocké dans `pendingDeepLink` (companion object) pour
 * que SECTNavigation le consomme au premier composition, puis le navigate vers la
 * bonne route via le NavController.
 */
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        // SECT-MOBILE-PARITY-T1-ACTIVATION : lire le deep-link au lancement
        handleDeepLink(intent)
        setContent {
            SECTTheme {
                SECTNavigation()
            }
        }
    }

    /**
     * Re-livraison d'un Intent quand l'activité existe déjà (launchMode singleTop).
     * SECT-MOBILE-PARITY-T1-ACTIVATION : le parser n'était jamais appelé sur les
     * taps ultérieurs de sect:// alors que l'app était déjà ouverte.
     */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // setIntent(intent) pour que getIntent() retourne le nouvel intent si besoin
        setIntent(intent)
        handleDeepLink(intent)
    }

    /**
     * Parse l'Intent et stocke le DeepLinkTarget si c'est un lien sect:// valide.
     * La navigation consomme ensuite `pendingDeepLink` via consumePendingDeepLink().
     */
    private fun handleDeepLink(intent: Intent?) {
        val target = DeepLinkHandler.fromIntent(intent) ?: return
        // On ne stocke QUE les cibles résolubles (Unknown → null → toRoute() = null)
        if (target.toRoute() != null) {
            pendingDeepLink = target
        }
    }

    companion object {
        /**
         * Deep-link en attente de consommation par SECTNavigation.
         * Rendu observable via mutableStateOf pour déclencher la navigation.
         */
        @Volatile
        private var pendingDeepLink: DeepLinkTarget? = null

        /** Récupère le deep-link en attente SANS le consommer (pour peek). */
        fun peekPendingDeepLink(): DeepLinkTarget? = pendingDeepLink

        /** Récupère (et consomme) le deep-link en attente. */
        fun consumePendingDeepLink(): DeepLinkTarget? {
            val target = pendingDeepLink
            pendingDeepLink = null
            return target
        }
    }
}
