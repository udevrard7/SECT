import Link from 'next/link'
import { WifiOff, Home } from 'lucide-react'
import { RetryButton } from './retry-button'

export const metadata = {
  title: 'Hors ligne — SECT',
  description: 'Vous êtes actuellement hors ligne.',
}

/**
 * Page /offline — Affichée quand l'utilisateur est hors ligne et que la
 * page demandée n'est pas en cache.
 *
 * Le Service Worker (public/sw.js) redirige vers cette page quand une
 * navigation échoue et qu'aucun cache n'est disponible.
 *
 * Server Component (préserve metadata SEO). Le bouton "Réessayer" est
 * un Client Component séparé (retry-button.tsx) car il utilise onClick.
 */
export default function OfflinePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-6 ds-kente-watermark rounded-2xl p-8">
        {/* Icône */}
        <div className="flex justify-center">
          <div className="h-20 w-20 rounded-full bg-warning/10 flex items-center justify-center">
            <WifiOff className="h-10 w-10 text-warning" />
          </div>
        </div>

        {/* Titre + message */}
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Vous êtes hors ligne
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Impossible de charger cette page. Vérifiez votre connexion internet
            et réessayez. Les pages déjà visitées restent accessibles depuis le cache.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <RetryButton />
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-md border border-border bg-card text-foreground text-sm font-medium hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Home className="h-4 w-4" />
            Tableau de bord
          </Link>
        </div>

        {/* Info complémentaire */}
        <p className="text-xs text-muted-foreground">
          💡 Astuce : SECT fonctionne en mode hors ligne. Vos épreuves en cours
          sont sauvegardées et seront synchronisées à la reconnexion.
        </p>
      </div>
    </main>
  )
}
