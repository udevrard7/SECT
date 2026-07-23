import { create } from 'zustand'

/**
 * État d'ouverture du dialog « Changer de compte » (Switch Account).
 *
 * Le dialog est rendu une seule fois au niveau du `AuthenticatedLayout`
 * (pattern singleton, comme le toaster shadcn) et peut être ouvert depuis
 * n'importe quel composant sans prop drilling — typiquement le bouton
 * « Switch Account » du header et l'entrée de menu de la carte utilisateur
 * de la sidebar.
 */
interface SwitchAccountState {
  open: boolean
  setOpen: (open: boolean) => void
  openDialog: () => void
  closeDialog: () => void
}

export const useSwitchAccountStore = create<SwitchAccountState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  openDialog: () => set({ open: true }),
  closeDialog: () => set({ open: false }),
}))
