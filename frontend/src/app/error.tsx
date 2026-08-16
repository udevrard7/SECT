'use client'

/**
 * error.tsx — Error boundary pour la route racine (App Router).
 *
 * SECT-RESILIENCE-1 : attrape les erreurs des routes non-authentifiées
 * (landing, login, etc.) qui ne sont pas catchées par un error.tsx plus
 * spécifique. Contrairement à global-error.tsx, celui-ci ne remplace pas
 * le layout root — il peut donc utiliser Tailwind + les composants UI.
 *
 * Design cohérent avec /offline et /maintenance (kente watermark, icône,
 * bouton retry). Affiche le message d'erreur en mode replié (détails
 * techniques) pour ne pas effrayer l'utilisateur.
 */

import { useEffect } from 'react'
import { AlertTriangle, RotateCw, Home } from 'lucide-react'
import Link from 'next/link'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log l'erreur pour observabilité
    console.error('SECT route error:', error)
  }, [error])

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-6 ds-kente-watermark rounded-2xl p-8">
        <div className="flex justify-center">
          <div className="h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-10 w-10 text-destructive" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Une erreur s&apos;est produite
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            La page que vous essayez d&apos;afficher a rencontré un problème
            technique. Vos données sont sécurisées. Essayez de recharger la page.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <RotateCw className="h-4 w-4" />
            Réessayer
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-md border border-border bg-card text-foreground text-sm font-medium hover:bg-accent transition-colors"
          >
            <Home className="h-4 w-4" />
            Accueil
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
