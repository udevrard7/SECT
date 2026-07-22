import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

/**
 * Mode de comportement de la sidebar, partagé entre :
 *  - `SidebarControl` (header) : l'utilisateur sélectionne le mode via le
 *    dropdown (boutons radio Étendu / Réduit / Survol).
 *  - `AppSidebar` : attache les handlers de survol quand mode === 'hover'.
 *  - `AuthenticatedLayout` : Initialise `defaultOpen` du SidebarProvider pour
 *    éviter un flash au rechargement (le cookie shadcn `sidebar_state` n'est
 *    pas relu à l'init).
 *
 * Persistance : localStorage (`sect-sidebar-mode`) pour conserver le
 * choix de l'utilisateur entre les sessions. La réhydration est synchrone,
 * donc `mode` est disponible dès le premier render.
 */
export type SidebarMode = 'expanded' | 'collapsed' | 'hover'

interface SidebarModeState {
  mode: SidebarMode
  setMode: (mode: SidebarMode) => void
}

export const useSidebarModeStore = create<SidebarModeState>()(
  persist(
    (set) => ({
      mode: 'expanded',
      setMode: (mode) => set({ mode }),
    }),
    {
      name: 'sect-sidebar-mode',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
