'use client'

import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * ThemeToggle — Bouton de bascule clair/sombre réutilisable du DS.
 *
 * Utilise next-themes (attribute="class" strategy). Au clic, bascule
 * entre 'light' et 'dark' en persistant dans localStorage.
 *
 * Accessibilité :
 *   - aria-label descriptif
 *   - focus-visible (hérité du Button shadcn)
 *   - touch target h-9 w-9 (36px, acceptable pour bouton icône)
 *
 * Usage : <ThemeToggle /> dans topbarActions de AppShell, ou dans
 * AppHeader, ou n'importe où dans l'app.
 *
 * FIX (THEME-TOGGLE-VISIBILITY) : les icônes utilisaient text-muted-foreground
 * qui est invisible sur le fond du header (bg-sidebar). Remplacé par
 * text-sidebar-foreground/70 (cohérent avec NotificationBell et Déconnexion).
 * Ajout du guard mounted (standard next-themes) pour éviter le mismatch
 * d'hydration : theme est undefined au premier render serveur.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // next-themes : theme n'est disponible qu'après hydration (côté client).
  // Avant mounted, on rend un placeholder pour éviter le mismatch SSR.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pattern standard next-themes (mounted guard anti-hydration-mismatch)
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        disabled
        className="rounded-lg h-9 w-9 opacity-50"
        aria-label="Chargement du thème…"
      />
    )
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
      className="rounded-lg hover:bg-sidebar-accent h-9 w-9 text-sidebar-foreground/70 hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Sun className="h-[18px] w-[18px] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-[18px] w-[18px] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </Button>
  )
}
