'use client'

import { useTheme } from 'next-themes'
import { Moon, Sun, LogOut, User, Settings, ChevronRight } from 'lucide-react'

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
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useAuthStore, type UserRole } from '@/stores/auth-store'
import { useNavigationStore, NAV_ITEMS, NAV_CATEGORIES, PROFILE_PAGE } from '@/stores/navigation-store'
import { NotificationBell } from '@/components/layout/notification-bell'

// ─── Role display names ───
const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrateur',
  RESPONSABLE: 'Responsable des études',
  ENSEIGNANT: 'Enseignant',
  ETUDIANT: 'Étudiant',
}

// ─── Modern role color for header accent ───
const ROLE_HEADER_COLORS: Record<UserRole, {
  accentBar: string
  avatarBg: string
  roleText: string
  searchFocus: string
}> = {
  ADMIN: {
    accentBar: 'bg-gradient-to-r from-rose-500 via-rose-400 to-amber-400',
    avatarBg: 'bg-gradient-to-br from-rose-500 to-rose-700 text-white',
    roleText: 'text-rose-600 dark:text-rose-400',
    searchFocus: 'focus-within:ring-rose-500/20',
  },
  RESPONSABLE: {
    accentBar: 'bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400',
    avatarBg: 'bg-gradient-to-br from-amber-500 to-orange-600 text-white',
    roleText: 'text-amber-600 dark:text-amber-400',
    searchFocus: 'focus-within:ring-amber-500/20',
  },
  ENSEIGNANT: {
    accentBar: 'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400',
    avatarBg: 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white',
    roleText: 'text-emerald-600 dark:text-emerald-400',
    searchFocus: 'focus-within:ring-emerald-500/20',
  },
  ETUDIANT: {
    accentBar: 'bg-gradient-to-r from-violet-500 via-purple-400 to-fuchsia-400',
    avatarBg: 'bg-gradient-to-br from-violet-500 to-purple-600 text-white',
    roleText: 'text-violet-600 dark:text-violet-400',
    searchFocus: 'focus-within:ring-violet-500/20',
  },
}

export function AppHeader() {
  const { theme, setTheme } = useTheme()
  const { user, logout } = useAuthStore()
  const { currentPage, setCurrentPage } = useNavigationStore()

  if (!user) return null

  const colors = ROLE_HEADER_COLORS[user.role]

  // Find the current page label and breadcrumb
  const categories = NAV_CATEGORIES[user.role] ?? []
  let parentCategory = ''
  for (const cat of categories) {
    if (cat.items.some((item) => item.id === currentPage)) {
      parentCategory = cat.label
      break
    }
  }

  const navItems = NAV_ITEMS[user.role] ?? []
  const currentNavItem = navItems.find((item) => item.id === currentPage)
  const pageTitle = currentPage === 'profil'
    ? PROFILE_PAGE.label
    : (currentNavItem?.label ?? 'Tableau de bord')

  // Get user initials for avatar fallback
  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <header className="flex flex-col shrink-0">
      {/* ─── Accent bar ─── */}
      <div className={`h-[2px] w-full ${colors.accentBar}`} />

      {/* ─── Header content ─── */}
      <div className="flex h-14 items-center gap-2 bg-background/80 backdrop-blur-md border-b border-border/50 px-4">
        {/* Sidebar toggle */}
        <SidebarTrigger className="-ml-1 hover:bg-muted/60" />
        <div className="h-5 w-px bg-border mx-1" />

        {/* Breadcrumb / Page title */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {parentCategory && currentPage !== 'dashboard' && (
            <>
              <span className="text-xs text-muted-foreground hidden sm:inline truncate">
                {parentCategory}
              </span>
              <ChevronRight className="h-3 w-3 text-muted-foreground/50 hidden sm:block shrink-0" />
            </>
          )}
          <h1 className="text-sm font-semibold truncate">{pageTitle}</h1>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-0.5">
          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="Changer le thème"
            className="rounded-lg hover:bg-muted/60 h-9 w-9"
          >
            <Sun className="h-[18px] w-[18px] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-muted-foreground" />
            <Moon className="absolute h-[18px] w-[18px] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-muted-foreground" />
          </Button>

          {/* Notifications */}
          <NotificationBell />

          {/* User dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full hover:bg-muted/60">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className={`${colors.avatarBg} text-[10px] font-bold`}>
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 rounded-xl" align="end" forceMount>
              <DropdownMenuLabel className="font-normal py-3">
                <div className="flex flex-col space-y-1.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className={`${colors.avatarBg} text-xs font-bold`}>
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-semibold leading-none">{user.name}</p>
                      <p className="text-xs leading-none text-muted-foreground mt-0.5">
                        {user.email}
                      </p>
                    </div>
                  </div>
                  <span className={`inline-flex self-start text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-muted ${colors.roleText}`}>
                    {ROLE_LABELS[user.role]}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setCurrentPage('profil')} className="cursor-pointer rounded-md">
                  <User className="mr-2 h-4 w-4" />
                  <span>Mon profil</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    // Route to role-specific settings page
                    const settingsPage = user.role === 'ADMIN' ? 'configuration' : user.role === 'RESPONSABLE' ? 'parametres' : 'profil'
                    setCurrentPage(settingsPage as import('@/stores/navigation-store').PageId)
                  }}
                  className="cursor-pointer rounded-md"
                >
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Paramètres</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => logout()} className="cursor-pointer text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400 rounded-md">
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
