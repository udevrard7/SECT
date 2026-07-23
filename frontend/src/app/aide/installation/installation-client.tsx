'use client'

/**
 * installation-client.tsx — Bouton d'installation interactif pour la page d'aide.
 *
 * SECT-PWA-DESKTOP-1 : sur la page /aide/installation, on propose un gros bouton
 * "Installer SECT maintenant" qui utilise useInstallPrompt pour déclencher le
 * prompt natif. S'affiche uniquement si le navigateur permet l'installation
 * (canInstall=true). Sinon, affiche un message informatif.
 *
 * Client Component séparé de page.tsx (Server Component) car utilise useInstallPrompt.
 */

import { Download, CheckCircle2, Info } from 'lucide-react'
import { useInstallPrompt } from '@/hooks/use-install-prompt'
import { toast } from 'sonner'

export function InstallationClient() {
  const { canInstall, isInstalled, promptInstall } = useInstallPrompt()

  // Déjà installé → message de succès
  if (isInstalled) {
    return (
      <div className="rounded-xl border bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900 p-6 text-center">
        <div className="flex justify-center mb-3">
          <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          </div>
        </div>
        <h3 className="font-semibold text-emerald-900 dark:text-emerald-100">
          SECT est installé sur cet appareil
        </h3>
        <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-1">
          Vous accédez à SECT depuis votre menu Démarrer / Launchpad / écran d&apos;accueil.
        </p>
      </div>
    )
  }

  // Navigateur compatible → bouton installer
  if (canInstall) {
    const handleClick = async () => {
      const outcome = await promptInstall()
      if (outcome === 'accepted') {
        toast.success('SECT installé', {
          description: 'L\'application est maintenant disponible sur votre appareil.',
        })
      } else if (outcome === 'dismissed') {
        toast.info('Installation annulée', {
          description: 'Vous pourrez installer SECT plus tard depuis le menu du navigateur.',
        })
      }
    }
    return (
      <div className="rounded-xl border bg-card p-6 text-center">
        <div className="flex justify-center mb-3">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Download className="h-6 w-6 text-primary" />
          </div>
        </div>
        <h3 className="font-semibold">
          Votre navigateur permet l&apos;installation
        </h3>
        <p className="text-sm text-muted-foreground mt-1 mb-4">
          Installez SECT en un clic pour un accès rapide et des notifications natives.
        </p>
        <button
          onClick={handleClick}
          className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Download className="h-4 w-4" />
          Installer SECT maintenant
        </button>
      </div>
    )
  }

  // Navigateur non compatible (Firefox, Safari desktop, etc.) → message info
  return (
    <div className="rounded-xl border bg-muted/30 p-6 text-center">
      <div className="flex justify-center mb-3">
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
          <Info className="h-6 w-6 text-muted-foreground" />
        </div>
      </div>
      <h3 className="font-semibold">
        Suivez les instructions ci-dessous
      </h3>
      <p className="text-sm text-muted-foreground mt-1">
        Votre navigateur ne propose pas d&apos;installation automatique. Suivez le guide
        ci-dessous selon votre appareil (Chrome, Edge, Safari mobile&hellip;).
      </p>
    </div>
  )
}
