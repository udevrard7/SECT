// ─────────────────────────────────────────────────────────────
// ErrorState — état d'erreur réutilisable avec bouton "Réessayer"
// Pattern aligné sur resultats-page.tsx / mes-resultats-page.tsx
// ─────────────────────────────────────────────────────────────

'use client'

import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface ErrorStateProps {
  /** Message affiché sous le titre (par défaut générique). */
  message?: string
  /** Handler appelé lors du clic sur "Réessayer". */
  onRetry: () => void
  /** Libellé du bouton (par défaut "Réessayer"). */
  retryLabel?: string
}

/**
 * Carte d'erreur border-l-4 rouge, avec icône AlertTriangle,
 * message et bouton de retry. Réutilisable sur tous les tableaux de bord.
 */
export function ErrorState({
  message = 'Une erreur est survenue lors du chargement de vos données. Veuillez réessayer.',
  onRetry,
  retryLabel = 'Réessayer',
}: ErrorStateProps) {
  return (
    <Card className="border-l-4 border-l-red-500">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <AlertTriangle className="h-10 w-10 text-red-500" />
        <p className="mt-3 text-sm font-medium">Erreur de chargement</p>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">{message}</p>
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-4 gap-2">
          <RefreshCw className="h-4 w-4" />
          {retryLabel}
        </Button>
      </CardContent>
    </Card>
  )
}

export default ErrorState
