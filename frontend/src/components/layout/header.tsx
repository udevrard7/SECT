'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import {
  ChevronRight, Search, LogOut, LifeBuoy, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SidebarControl } from '@/components/layout/sidebar-control'
import { NotificationBell } from '@/components/layout/notification-bell'
import { InstallButton } from '@/components/layout/install-button'
import { CommandPalette } from '@/components/layout/command-palette'
import { ThemeToggle } from '@/components/ds'
import { useAuthStore } from '@/stores/auth-store'
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
 * La carte utilisateur (avatar + nom + menu profil/paramètres) a été
 * déplacée vers le bas de la sidebar (`SidebarUserCard`), pattern moderne
 * type Linear/Vercel/Notion. Le header ne porte plus que des actions
 * transverses, sans séparateur vertical visible (look épuré) :
 *  - thème, notifications, horloge, recherche (⌘K)
 *  - « Déconnexion » : logout + redirect vers /login
 *
 * Le bascule de compte (Switch Account) reste accessible depuis la carte
 * utilisateur de la sidebar (popover → « Changer de compte »).
 */
export function AppHeader() {
  const { user, logout } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()
  const now = useClock()
  const [paletteOpen, setPaletteOpen] = useState(false)
  // ASSISTANCE-MODE-FRONTEND : l'ADMIN en mode assistance a un etablissementId
  // non vide (le backend /api/auth/assistance-mode a régénéré les tokens JWT
  // avec etablissementId positionné). On expose un badge "Mode assistance" +
  // un bouton "Quitter" pour revenir à la session ADMIN normale.
  const [exitLoading, setExitLoading] = useState(false)
  const inAssistanceMode = user?.role === 'ADMIN' && !!user?.etablissementId

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
  // ASSISTANCE-MODE-FRONTEND : en mode assistance, on résout le contexte avec
  // le rôle EFFECTIF (RESPONSABLE) pour que le fil d'Ariane et le titre
  // correspondent aux pages réellement accessibles dans la sidebar.
  const { pageTitle, parentCategory } = getPageContext(
    pathname,
    user.role,
    user.etablissementId,
  )

  // Déconnexion : logout du compte courant puis redirect vers /login.
  const handleLogout = async () => {
    await logout()
    router.push('/login')
  }

  // ASSISTANCE-MODE-FRONTEND : quitte le mode assistance. Le backend
  // /api/auth/exit-assistance-mode régénère des tokens JWT avec
  // etablissementId="" → l'ADMIN retrouve sa session d'origine. On met à jour
  // l'auth store avec le nouveau user (etablissementId vide) puis on redirige
  // vers /dashboard (vue ADMIN restaurée).
  const handleExitAssistanceMode = async () => {
    setExitLoading(true)
    try {
      const res = await fetch('/api/go-auth/exit-assistance-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.user) {
        throw new Error(data?.error || 'Impossible de quitter le mode assistance')
      }
      useAuthStore.setState({
        user: {
          id: data.user.id,
          email: data.user.email ?? '',
          name: data.user.name ?? '',
          role: data.user.role,
          etablissementId: data.user.etablissementId ?? null,
          filiereId: data.user.filiereId ?? null,
          etablissement: data.user.etablissement ?? null,
          filiere: data.user.filiere ?? null,
          image: data.user.image ?? null,
          actif: data.user.actif,
          matricule: data.user.matricule ?? null,
          mustChangePwd: data.user.mustChangePwd,
          derniereConnexion: data.user.derniereConnexion ?? null,
        },
      })
      toast.success('Mode assistance désactivé', {
        description: 'Vous êtes de retour sur votre session ADMIN.',
      })
      router.push('/dashboard')
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Une erreur est survenue.',
      })
    } finally {
      setExitLoading(false)
    }
  }

  return (
    <header className="flex flex-col shrink-0 sticky top-0 z-30">
      {/* Bande kente tricolore */}
      <div className="h-[3px] w-full ds-african-divider" />

      {/* Header h-14 — bleu nuit, sans séparateur vertical (look épuré) */}
      <div className="flex h-14 items-center gap-2.5 bg-sidebar border-b border-sidebar-border px-3">

        {/* Sidebar control */}
        <SidebarControl className="-ml-1" />

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
        <div className="hidden xl:flex flex-col items-end leading-tight">
          <span className="text-base font-mono font-bold text-sidebar-foreground tabular-nums">
            {timeStr}
          </span>
          <span className="text-xs text-sidebar-foreground/70 capitalize font-medium">
            {dateStr}
          </span>
        </div>

        {/* ─── Actions droite ─── */}
        <div className="flex items-center gap-1.5">
          {/* ASSISTANCE-MODE-FRONTEND : badge + bouton "Quitter" quand l'ADMIN */}
          {/* est en mode assistance (etablissementId non vide). Le badge amber */}
          {/* rappelle visuellement que la session est contextuelle à un étab. */}
          {inAssistanceMode && (
            <div className="flex items-center gap-1.5 mr-1 pr-1.5 border-r border-sidebar-border/60">
              <Badge
                className="hidden sm:flex items-center gap-1 bg-warning/15 text-warning border-warning/40"
                title="Vous naviguez en tant qu'ADMIN sur les données d'un établissement"
              >
                <LifeBuoy className="h-3 w-3" />
                Mode assistance
              </Badge>
              {/* Version compacte (mobile) : icône seule */}
              <Badge
                className="sm:hidden bg-warning/15 text-warning border-warning/40 px-1.5"
                title="Mode assistance"
              >
                <LifeBuoy className="h-3 w-3" />
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleExitAssistanceMode}
                disabled={exitLoading}
                className="h-9 gap-1.5 px-2.5 text-warning hover:text-warning hover:bg-warning/10 rounded-lg"
                aria-label="Quitter le mode assistance"
                title="Quitter le mode assistance"
              >
                {exitLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4" />
                )}
                <span className="hidden md:inline text-xs font-medium">Quitter</span>
              </Button>
            </div>
          )}

          {/* Theme toggle */}
          <ThemeToggle />

          {/* Installer SECT (PWA) — visible uniquement si le navigateur permet l'installation */}
          <InstallButton />

          {/* Notifications — composant réel connecté aux APIs /api/alertes & /api/notifications/admin */}
          <NotificationBell className="h-9 w-9 rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent" />

          {/* Déconnexion — logout + redirect vers /login */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="h-9 gap-1.5 px-2.5 text-sidebar-foreground/70 hover:text-destructive hover:bg-destructive/5 rounded-lg"
            aria-label="Se déconnecter"
            title="Se déconnecter"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline text-xs font-medium">Déconnexion</span>
          </Button>
        </div>
      </div>

      {/* Command palette (⌘K) — recherche fuzzy des pages accessibles au rôle */}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </header>
  )
}
