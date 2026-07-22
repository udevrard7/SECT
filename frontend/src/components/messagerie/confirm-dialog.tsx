'use client'

// ─────────────────────────────────────────────────────────────
// ConfirmDialog — Boîte de dialogue de confirmation IN-APP.
//
// Remplace les window.confirm() natifs du navigateur (qui ouvrent une
// fenêtre système extérieure à l'app) par une modale AlertDialog shadcn/ui
// stylée et accessible, rendue dans le portail React (donc à l'intérieur
// de l'application).
//
// Usage :
//   const { confirm, dialog } = useConfirmDialog()
//   const ok = await confirm({ title, description, confirmLabel, destructive })
//   if (!ok) return
//   // ...action
//   return <>{dialog}</>
//
// Le hook retourne :
//   - confirm(opts): Promise<boolean> (true si validé, false si annulé)
//   - dialog: le JSX à rendre une seule fois dans le composant parent
// ─────────────────────────────────────────────────────────────

import { useCallback, useState, type ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

export interface ConfirmOptions {
  /** Titre court de la modale (ex: "Supprimer ce message ?") */
  title: string
  /** Description détaillée (ex: "Cette action est définitive.") */
  description?: string
  /** Libellé du bouton de confirmation (défaut: "Confirmer") */
  confirmLabel?: string
  /** Libellé du bouton d'annulation (défaut: "Annuler") */
  cancelLabel?: string
  /** Style destructif (rouge) pour le bouton de confirmation */
  destructive?: boolean
}

interface ConfirmDialogState {
  open: boolean
  options: ConfirmOptions
  resolve: ((ok: boolean) => void) | null
}

const DEFAULT_STATE: ConfirmDialogState = {
  open: false,
  options: { title: '' },
  resolve: null,
}

/**
 * Hook useConfirmDialog — expose une fonction `confirm()` asynchrone et
 * le JSX de la modale à rendre une seule fois dans le composant parent.
 *
 * Avantage sur window.confirm() : rendu in-app (pas de fenêtre navigateur),
 * style cohérent avec l'app, supporte contenu riche, accessible (focus trap,
 * aria), et non-bloquant (Promise).
 */
export function useConfirmDialog() {
  const [state, setState] = useState<ConfirmDialogState>(DEFAULT_STATE)

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setState({ open: true, options, resolve })
    })
  }, [])

  const handleClose = useCallback((ok: boolean) => {
    // On lit la resolve courante via le setter fonctionnel pour éviter la
    // dépendance [state.resolve] qui ferait recréer ce callback à chaque
    // ouverture (et déclencherait react-hooks/preserve-manual-memoization).
    setState((prev) => {
      prev.resolve?.(ok)
      return { open: false, options: { title: '' }, resolve: null }
    })
  }, [])

  const dialog: ReactNode = (
    <AlertDialog
      open={state.open}
      onOpenChange={(open) => {
        if (!open) handleClose(false)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{state.options.title}</AlertDialogTitle>
          {state.options.description && (
            <AlertDialogDescription>
              {state.options.description}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={() => handleClose(false)}
            disabled={state.options.confirmLabel === undefined && false}
          >
            {state.options.cancelLabel ?? 'Annuler'}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => handleClose(true)}
            className={cn(
              state.options.destructive &&
                'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive'
            )}
          >
            {state.options.confirmLabel ?? 'Confirmer'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return { confirm, dialog }
}
