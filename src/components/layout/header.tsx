'use client'

import { useRouter, usePathname } from 'next/navigation'
import { LogOut, User, Settings, ChevronRight } from 'lucide-react'

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
import { ThemeToggle } from '@/components/ds'
import { useAuthStore, type UserRole } from '@/stores/auth-store'
import { NAV_ITEMS, NAV_CATEGORIES, PROFILE_PAGE, PAGE_ROUTES, ROUTE_TO_PAGE, type PageId } from '@/lib/routes'
import { NotificationBell } from '@/components/layout/notification-bell'
import { PushNotificationManager } from '@/components/pwa/push-notification-manager'

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrateur',
  RESPONSABLE: 'Responsable des études',
  ENSEIGNANT: 'Enseignant',
  ETUDIANT: 'Étudiant',
}

export function AppHeader() {
  const { user, logout } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()

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

  return (
    <header className="flex flex-col shrink-0 sticky top-0 z-30">
      {/* Bande kente tricolore (vert/terre/or) */}
      <div className="h-[3px] w-full ds-african-divider" />

      {/* Header compact h-12 — fond bleu nuit */}
      <div className="flex h-12 items-center gap-2 bg-sidebar border-b border-sidebar-border px-3">
        {/* Sidebar toggle */}
        <SidebarTrigger className="-ml-1 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-lg" />

        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {parentCategory && currentPageId !== 'dashboard' && (
            <>
              <span className="text-[11px] text-sidebar-foreground/40 hidden sm:inline truncate">
                {parentCategory}
              </span>
              <ChevronRight className="h-3 w-3 text-sidebar-foreground/30 hidden sm:block shrink-0" />
            </>
          )}
          <h1 className="text-sm font-semibold truncate font-display tracking-tight text-sidebar-foreground">
            {pageTitle}
          </h1>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5">
          <ThemeToggle />
          <NotificationBell />
          <PushNotificationManager />

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
