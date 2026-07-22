'use client'

import { RotateCw } from 'lucide-react'

/**
 * RetryButton — Bouton "Réessayer" pour la page offline.
 *
 * Client Component séparé car il utilise onClick (window.location.reload).
 * La page /offline reste un Server Component pour préserver metadata.
 */
export function RetryButton() {
  return (
    <button
      onClick={() => window.location.reload()}
      className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <RotateCw className="h-4 w-4" />
      Réessayer
    </button>
  )
}
