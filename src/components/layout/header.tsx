'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import {
  LogOut, User, Settings, ChevronRight,
  Search,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { SidebarControl } from '@/components/layout/sidebar-control'
import { NotificationBell } from '@/components/layout/notification-bell'
import { ThemeToggle } from '@/components/ds'
import { useAuthStore, type UserRole } from '@/stores/auth-store'
import { NAV_ITEMS, NAV_CATEGORIES, PROFILE_PAGE, PAGE_ROUTES, ROUTE_TO_PAGE, type PageId } from '@/lib/routes'

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrateur',
  RESPONSABLE: 'Responsable des études',
  ENSEIGNANT: 'Enseignant',
  ETUDIANT: 'Étudiant',
}

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

export function AppHeader() {
  const { user, logout } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()
  const now = useClock()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)

  // Formatage heure/date (memoized — doit être avant early return)
  const { timeStr, dateStr } = useMemo(() => ({
    timeStr: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    dateStr: `${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}`,
  }), [now])

  if (!user) return null

  const currentPageId = ROUTE_TO_PAGE[pathname] ?? 'dashboard'
  const categories = NAV_CATEGORIES[user.role] ?? []
  let parentCategory = ''
  for (const cat of categories) {
    if (cat.items.some((item) => item.id === currentPageId)) {
      parentCategory = cat.label
      break
    }
  }

  const navItems = NAV_ITEMS[user.role] ?? []
  const currentNavItem = navItems.find((item) => item.id === currentPageId)
  const pageTitle = currentPageId === 'profil'
    ? PROFILE_PAGE.label
    : (currentNavItem?.label ?? 'Tableau de bord')

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const navigateTo = (pageId: PageId) => {
    const route = PAGE_ROUTES[pageId]
    if (route) router.push(route)
  }

  // Recherche rapide dans les pages accessibles
  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      const allItems = navItems
      const match = allItems.find(item =>
        item.label.toLowerCase().includes(query) ||
        item.id.toLowerCase().includes(query)
      )
      if (match) {
        navigateTo(match.id as PageId)
        setSearchQuery('')
      }
    }
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
          {parentCategory && currentPageId !== 'dashboard' && (
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

        {/* ─── Barre de recherche centrale ─── */}
        <div className="flex-1 max-w-md mx-auto hidden lg:flex items-center">
          <div className={`relative w-full transition-all duration-300 ${searchFocused ? 'scale-105' : ''}`}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sidebar-foreground/40 transition-colors" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearch}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Rechercher une page, un étudiant, une épreuve…"
              className="w-full h-9 pl-10 pr-4 rounded-xl bg-sidebar-accent/50 border border-sidebar-border/50 text-sm text-sidebar-foreground placeholder:text-sidebar-foreground/35 focus:bg-sidebar-accent focus:border-primary/40 focus:ring-2 focus:ring-primary/15 transition-all outline-none"
            />
            {/* Raccourci clavier */}
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden xl:flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono text-sidebar-foreground/30 border border-sidebar-border/50 bg-sidebar/50">
              ⌘K
            </kbd>
          </div>
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
        <div className="flex items-center gap-0.5">
          {/* Theme toggle */}
          <ThemeToggle />

          {/* Notifications — composant réel connecté aux APIs /api/alertes & /api/notifications/admin */}
          <NotificationBell className="h-9 w-9 rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent" />

          {/* Séparateur */}
          <div className="h-5 w-px bg-sidebar-border mx-1.5" />

          {/* User dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 h-9 px-1.5 rounded-lg hover:bg-sidebar-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="bg-primary text-primary-foreground text-[10px] font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden sm:flex flex-col items-start leading-tight">
                  <span className="text-xs font-semibold text-sidebar-foreground truncate max-w-[100px]">{user.name}</span>
                  <span className="text-[10px] text-sidebar-foreground/50">{ROLE_LABELS[user.role]}</span>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 rounded-xl border-border" align="end" forceMount>
              <DropdownMenuLabel className="font-normal py-3">
                <div className="flex flex-col space-y-1.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-semibold leading-none">{user.name}</p>
                      <p className="text-xs leading-none text-muted-foreground mt-0.5">{user.email}</p>
                    </div>
                  </div>
                  <span className="inline-flex self-start text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-primary/10 text-primary-text">
                    {ROLE_LABELS[user.role]}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => navigateTo('profil')} className="cursor-pointer rounded-md">
                  <User className="mr-2 h-4 w-4" />
                  <span>Mon profil</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    const settingsPage = user.role === 'ADMIN' ? 'configuration' : user.role === 'RESPONSABLE' ? 'parametres' : 'profil'
                    navigateTo(settingsPage)
                  }}
                  className="cursor-pointer rounded-md"
                >
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Paramètres</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => logout()} className="cursor-pointer text-destructive focus:text-destructive rounded-md">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Déconnexion</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
