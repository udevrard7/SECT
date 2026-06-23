'use client'

import { Loader2, ClipboardList } from 'lucide-react'

/**
 * États transitoires de la page Correction : skeleton de chargement des
 * épreuves et état vide (aucune épreuve disponible).
 *
 * Extrait de correction-page.tsx (phase 3, commit 1).
 * JSX strictement identique aux blocs L1912-1921 (loading) et L1924-1938
 * (empty) de l'original.
 */
export function CorrectionLoadingSkeleton() {
  return (
    <div className="flex h-[calc(100vh-10rem)] items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600 mx-auto" />
        <p className="mt-3 text-sm text-muted-foreground">Chargement des épreuves...</p>
      </div>
    </div>
  )
}

export function CorrectionEmptyState() {
  return (
    <div className="flex h-[calc(100vh-10rem)] items-center justify-center">
      <div className="text-center">
        <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-muted">
          <ClipboardList className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="mt-3 text-base font-semibold">Aucune épreuve disponible</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Créez une épreuve pour commencer à corriger.
        </p>
      </div>
    </div>
  )
}
