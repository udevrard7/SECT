'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import {
  ChevronRight, Search, Repeat, LogIn,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { SidebarControl } from '@/components/layout/sidebar-control'
import { NotificationBell } from '@/components/layout/notification-bell'
import { CommandPalette } from '@/components/layout/command-palette'
import { ThemeToggle } from '@/components/ds'
import { useAuthStore } from '@/stores/auth-store'
import { useSwitchAccountStore } from '@/stores/switch-account-store'
import { getPageContext } from '@/lib/routes'

// ─── Horloge temps réel ───
function useClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    // Tick 30s : l'affichage ne montre que HH:MM, inutile de re-rendre chaque seconde.
    // Divise par 30 le nombre de re-renders du header (60/min -> 2/min).
    const interval = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(interval)
  }, [])
  return now
}

const DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
const MONTHS = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc']

/**
 * AppHeader — Barre supérieure de l'espace authentifié.
 *
 * La carte utilisateur (avatar + nom + menu profil/paramètres/déconnexion)
 * a été déplacée vers le bas de la sidebar (`SidebarUserCard`), pattern
 * moderne type Linear/Vercel/Notion. Le header ne porte plus que des
 * actions transverses :
 *  - thème, notifications, horloge, recherche (⌘K)
 *  - « Switch Account » : ouvre le `SwitchAccountDialog` (basculer vers un
 *    autre compte sans repasser par la page de login)
 *  - « Login » : déconnexion + redirect vers /login (se reconnecter avec un
 *    autre compte via le formulaire classique)
 */
export function AppHeader() {
  const { user, logout } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()
  const now = useClock()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const openSwitchAccount = useSwitchAccountStore((s) => s.openDialog)

  // Formatage heure/date (memoized — doit être avant early return)
  const { timeStr, dateStr } = useMemo(() => ({
    timeStr: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    dateStr: `${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}`,
  }), [now])

  // Raccourci clavier global : ⌘K (macOS) / Ctrl+K (autres) bascule la palette.
  // Hook placé avant l'early return pour respecter les Rules of Hooks.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  if (!user) return null

  // ─── Contexte de page factorisé (fil d'Ariane + titre) ───
  // Centralise la résolution du PageId canonique, du titre et de la catégorie
  // parente. Évite les collisions de ROUTE_TO_PAGE (plusieurs PageId mappés
  // vers la même route) en partant de NAV_CATEGORIES[user.role].
  const { pageTitle, parentCategory } = getPageContext(pathname, user.role)

  // « Login » : déconnexion du compte courant puis redirect vers /login.
  const handleLogin = async () => {
    await logout()
    router.push('/login')
  }

  return (
    <header className="flex flex-col shrink-0 sticky top-0 z-30">
      {/* Bande kente tricolore */}
      <div className="h-[3px] w-full ds-african-divider" />

      {/* Header h-14 — bleu nuit */}
      <div className="flex h-14 items-center gap-2 bg-sidebar border-b border-sidebar-border px-3">

        {/* Sidebar control */}
        <SidebarControl className="-ml-1" />

        {/* Séparateur */}
        <div className="h-5 w-px bg-sidebar-border mx-1" />

        {/* Breadcrumb */}
        <div className="hidden md:flex items-center gap-1.5 min-w-0">
          {parentCategory && (
            <>
              <span className="text-[11px] text-sidebar-foreground/40 truncate">
                {parentCategory}
              </span>
              <ChevronRight className="h-3 w-3 text-sidebar-foreground/30 shrink-0" />
            </>
          )}
          <h1 className="text-sm font-semibold truncate font-display tracking-tight text-sidebar-foreground">
            {pageTitle}
          </h1>
        </div>

        {/* Mobile : juste le titre */}
        <h1 className="md:hidden text-sm font-semibold truncate font-display tracking-tight text-sidebar-foreground flex-1">
          {pageTitle}
        </h1>

        {/* ─── Déclencheur de recherche (ouvre la command palette ⌘K) ─── */}
        <div className="flex-1 max-w-md mx-auto hidden lg:flex items-center">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label="Ouvrir la recherche (⌘K)"
            className="group flex w-full h-9 items-center gap-2.5 rounded-xl bg-sidebar-accent/50 border border-sidebar-border/50 px-3 text-sm text-sidebar-foreground/40 hover:bg-sidebar-accent hover:border-primary/40 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/15"
          >
            <Search className="h-4 w-4 text-sidebar-foreground/40 transition-colors group-hover:text-sidebar-foreground/60" />
            <span className="truncate">Rechercher une page…</span>
            <kbd className="ml-auto hidden xl:flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono text-sidebar-foreground/30 border border-sidebar-border/50 bg-sidebar/50 pointer-events-none">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* ─── Espace flexible (pousse les éléments suivants à droite) ─── */}
        <div className="flex-1 lg:flex-none" />

        {/* ─── Horloge (desktop uniquement) ─── */}
        <div className="hidden xl:flex flex-col items-end leading-tight mr-1">
          <span className="text-sm font-mono font-semibold text-sidebar-foreground/80 tabular-nums">
            {timeStr}
          </span>
          <span className="text-[10px] text-sidebar-foreground/40 capitalize">
            {dateStr}
          </span>
        </div>

        {/* Séparateur */}
        <div className="hidden xl:block h-5 w-px bg-sidebar-border mx-1" />

        {/* ─── Actions droite ─── */}
        <div className="flex items-center gap-1.5">
          {/* Theme toggle */}
          <ThemeToggle />

          {/* Notifications — composant réel connecté aux APIs /api/alertes & /api/notifications/admin */}
          <NotificationBell className="h-9 w-9 rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent" />

          {/* Séparateur */}
          <div className="h-5 w-px bg-sidebar-border mx-0.5" />

          {/* Switch Account — ouvre le dialog de bascule de compte */}
          <Button
            variant="ghost"
            size="sm"
            onClick={openSwitchAccount}
            className="h-9 gap-1.5 px-2.5 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-lg"
            aria-label="Changer de compte"
            title="Changer de compte"
          >
            <Repeat className="h-4 w-4" />
            <span className="hidden sm:inline text-xs font-medium">Switch</span>
          </Button>

          {/* Login — déconnexion + redirect vers /login */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogin}
            className="h-9 gap-1.5 px-2.5 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-lg"
            aria-label="Se connecter avec un autre compte"
            title="Se connecter avec un autre compte"
          >
            <LogIn className="h-4 w-4" />
            <span className="hidden sm:inline text-xs font-medium">Login</span>
          </Button>
        </div>
      </div>

      {/* Command palette (⌘K) — recherche fuzzy des pages accessibles au rôle */}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </header>
  )
}
