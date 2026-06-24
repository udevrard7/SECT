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

// ─── Role display names ───
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

  // Determine current page ID from URL
  const currentPageId = ROUTE_TO_PAGE[pathname] ?? 'dashboard'

  // Find the current page label and breadcrumb
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

  // Get user initials for avatar fallback
  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  // Navigate to a page using Next.js router
  const navigateTo = (pageId: PageId) => {
    const route = PAGE_ROUTES[pageId]
    if (route) router.push(route)
  }

  return (
    <header className="flex flex-col shrink-0 sticky top-0 z-30">
      {/* ─── Accent bar : motif africain (vert lime + terre cuite + or) ─── */}
      <div className="h-[3px] w-full ds-african-divider" />

      {/* ─── Header content — fond opaque pour lisibilité ─── */}
      <div className="flex h-14 items-center gap-2 bg-card border-b border-border px-4">
        {/* Sidebar toggle */}
        <SidebarTrigger className="-ml-1 hover:bg-muted/60" />
        <div className="h-5 w-px bg-border mx-1" />

        {/* Breadcrumb / Page title */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {parentCategory && currentPageId !== 'dashboard' && (
            <>
              <span className="text-xs text-muted-foreground hidden sm:inline truncate">
                {parentCategory}
              </span>
              <ChevronRight className="h-3 w-3 text-muted-foreground/50 hidden sm:block shrink-0" />
            </>
          )}
          <h1 className="text-sm font-semibold truncate font-display tracking-tight">{pageTitle}</h1>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-0.5">
          {/* Theme toggle (DS) */}
          <ThemeToggle />

          {/* Notifications in-app */}
          <NotificationBell />

          {/* Push notifications PWA (activation) */}
          <PushNotificationManager />

          {/* User dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full hover:bg-muted/60">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="bg-primary text-primary-foreground text-[10px] font-bold">
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
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
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
