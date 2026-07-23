'use client'

/**
 * (app)/error.tsx — Error boundary pour les routes authentifiées.
 *
 * SECT-RESILIENCE-1 : attrape les erreurs Runtime React dans le dashboard
 * (pages /dashboard, /epreuves, /sessions, etc.). Sans ce fichier, une erreur
 * dans une page authentifiée provoque une page blanche (ou l'error boundary
 * racine, moins contextualisé).
 *
 * Contrairement au error.tsx racine, celui-ci garde l'utilisateur DANS l'app
 * (sidebar visible via le layout) avec un bouton "Recharger" + "Retour dashboard".
 * Évite la frustration d'être éjecté vers une page hors-app pour une erreur
 * de page isolée.
 */

import { useEffect } from 'react'
import { AlertTriangle, RotateCw, LayoutDashboard } from 'lucide-react'
import Link from 'next/link'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('SECT app route error:', error)
  }, [error])

  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6 rounded-2xl border bg-card p-8 shadow-sm">
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="font-display text-xl font-bold tracking-tight">
            Cette page a rencontré un problème
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Le reste de la plateforme fonctionne normalement. Vos données sont
            sécurisées. Essayez de recharger la page ou revenez au tableau de bord.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <RotateCw className="h-4 w-4" />
            Recharger la page
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-md border border-border bg-background text-foreground text-sm font-medium hover:bg-accent transition-colors"
          >
            <LayoutDashboard className="h-4 w-4" />
            Tableau de bord
          </Link>
        </div>

        {error.digest && (
          <p className="text-xs text-muted-foreground font-mono">
            Réf. : {error.digest}
          </p>
        )}
      </div>
    </main>
  )
}
