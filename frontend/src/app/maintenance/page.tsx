import Link from 'next/link'
import { Wrench, Home } from 'lucide-react'
import { MaintenanceRetryButton } from './retry-button'

export const metadata = {
  title: 'Maintenance en cours — SECT',
  description: 'La plateforme SECT est temporairement indisponible.',
  robots: { index: false, follow: false },
}

/**
 * Page /maintenance — Affichée quand :
 *   1. L'admin a activé maintenanceMode dans PlatformSettings (maintenance planifiée)
 *   2. Le backend Render est down (incident détecté par use-backend-health)
 *   3. L'utilisateur a été redirigé ici par le proxy ou le hook health
 *
 * SECT-RESILIENCE-1 : évite la page blanche et l'erreur technique brute.
 * Design cohérent avec /offline (kente watermark, navy/gold, icône + message).
 *
 * Server Component (préserve metadata SEO + robots noindex). Le bouton
 * "Réessayer" est un Client Component (retry-button.tsx) avec auto-refresh
 * 30s pour détecter le retour du backend.
 *
 * Page publique (ajoutée à PUBLIC_PATHS dans proxy.ts) : accessible sans auth.
 */
export default function MaintenancePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-6 ds-kente-watermark rounded-2xl p-8">
        {/* Icône */}
        <div className="flex justify-center">
          <div className="h-20 w-20 rounded-full bg-warning/10 flex items-center justify-center">
            <Wrench className="h-10 w-10 text-warning" />
          </div>
        </div>

        {/* Titre + message */}
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Plateforme temporairement indisponible
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Patientez, nous réglons un incident. Votre plateforme sera bientôt
            disponible. Vos données sont sécurisées et aucun examen en cours
            n&apos;a été perdu.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 justify-center">
          <MaintenanceRetryButton />
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-md border border-border bg-card text-foreground text-sm font-medium hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Home className="h-4 w-4" />
            Revenir à la connexion
          </Link>
        </div>

        {/* Info complémentaire */}
        <p className="text-xs text-muted-foreground">
          💡 Si le problème persiste au-delà de 15 minutes, contactez le support
          à <a href="mailto:contact@sect.ftci.fr" className="underline hover:text-foreground">contact@sect.ftci.fr</a>.
        </p>
      </div>
    </main>
  )
}
