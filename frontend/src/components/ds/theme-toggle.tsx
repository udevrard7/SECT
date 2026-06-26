'use client'

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
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
      className="rounded-lg hover:bg-muted/60 h-9 w-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Sun className="h-[18px] w-[18px] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-muted-foreground" />
      <Moon className="absolute h-[18px] w-[18px] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-muted-foreground" />
    </Button>
  )
}
