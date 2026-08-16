'use client'

/**
 * install-button.tsx — Bouton "Installer SECT" pour le header.
 *
 * SECT-PWA-DESKTOP-1 : bouton discret qui apparaît dans le header quand le
 * navigateur permet l'installation PWA (Chrome/Edge desktop, Android Chrome).
 *
 * Comportement :
 *   - Invisible si l'app est déjà installée (isInstalled=true)
 *   - Invisible si le navigateur ne supporte pas l'installation (canInstall=false)
 *   - Invisible si l'utilisateur a dismiss le prompt dans les 30 derniers jours
 *   - Au clic : déclenche le prompt natif + toast de feedback
 *
 * UX : icône Download + tooltip "Installer SECT sur cet appareil". Bouton ghost
 * pour s'intégrer discrètement dans le header à côté des autres actions.
 */

import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useInstallPrompt } from '@/hooks/use-install-prompt'
import { toast } from 'sonner'

export function InstallButton() {
  const { canInstall, isInstalled, promptInstall } = useInstallPrompt()

  // Ne rien afficher si déjà installé ou si installation impossible
  if (isInstalled || !canInstall) return null

  const handleClick = async () => {
    const outcome = await promptInstall()
    if (outcome === 'accepted') {
      toast.success('SECT installé', {
        description: 'L\'application est maintenant disponible dans votre menu Démarrer / Launchpad.',
      })
    } else if (outcome === 'dismissed') {
      toast.info('Installation annulée', {
        description: 'Vous pourrez installer SECT plus tard depuis le menu du navigateur.',
      })
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      className="h-9 w-9 p-0 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-lg"
      aria-label="Installer SECT sur cet appareil"
      title="Installer SECT sur cet appareil"
    >
      <Download className="h-4 w-4" />
      <span className="sr-only">Installer SECT</span>
    </Button>
  )
}
