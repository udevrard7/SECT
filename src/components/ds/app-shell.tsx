'use client'

import { useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { UserStats, type UserStatsData } from './user-stats'

/**
 * Élément de navigation pour l'AppShell.
 */
export interface NavItem {
  id: string
  label: string
  icon: LucideIcon
  href?: string
  badge?: number
}

/**
 * Section de navigation (groupe d'items avec un titre).
 */
export interface NavSection {
  title?: string
  items: NavItem[]
}

export interface AppShellProps {
  /** Logo / nom de l'app affiché en tête de sidebar */
  brand: { name: string; logo?: ReactNode }
  /** Sections de navigation (chaque section a un titre optionnel + des items) */
  sections: NavSection[]
  /** Item de navigation actif (son id) */
  activeId?: string
  /** Callback au clic sur un item de nav */
  onNavigate?: (item: NavItem) => void
  /** Stats utilisateur affichées dans la topbar (XP, streak, niveau) */
  userStats?: UserStatsData
  /** Avatar + nom utilisateur pour la topbar */
  user: { name: string; avatarUrl?: string; role?: string }
  /** Actions de la topbar (notifications, settings, logout…) */
  topbarActions?: ReactNode
  /** Contenu principal */
  children: ReactNode
  /** Élément sticky en bas de sidebar (ex: upgrade CTA) */
  sidebarFooter?: ReactNode
}

/**
 * AppShell — Layout applicatif principal du Design System.
 *
 * Architecture :
 *   - Desktop (md+) : sidebar fixe 260px à gauche + topbar sticky + main area
 *   - Mobile (<md) : topbar sticky + bottom nav flottante (glassmorphism) +
 *     drawer latéral (Sheet) pour la nav complète
 *
 * Style hybride :
 *   - Modern Clean Dashboard : grille claire, sidebar délimitée
 *   - Glassmorphism (subtil) : topbar sticky + bottom nav mobile uniquement
 *   - Gamification : UserStats (XP/streak/niveau) intégré dans la topbar
 *
 * Accessibilité :
 *   - Navigation clavier complète, focus visible (ring)
 *   - aria-label sur les boutons icônes
 *   - role="navigation" sur la sidebar
 *
 * Performance :
 *   - Pas de layout shift (sidebar width fixe, topbar sticky)
 *   - AnimatePresence pour le drawer mobile (montage/démontage propre)
 */
export function AppShell({
  brand,
  sections,
  activeId,
  onNavigate,
  userStats,
  user,
  topbarActions,
  children,
  sidebarFooter,
}: AppShellProps) {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)

  const allItems = sections.flatMap((s) => s.items)
  // Bottom nav mobile : on affiche max 5 items (les plus importants)
  const bottomNavItems = allItems.slice(0, 5)

  const handleItemClick = (item: NavItem) => {
    onNavigate?.(item)
    setMobileDrawerOpen(false)
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* ════════ SIDEBAR (desktop) ════════ */}
      <aside
        className="hidden md:flex w-[260px] shrink-0 flex-col border-r border-border bg-card"
        role="navigation"
        aria-label="Navigation principale"
      >
        {/* Brand */}
        <div className="flex h-16 items-center gap-2.5 px-5 border-b border-border">
          {brand.logo ?? (
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
              {brand.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <span className="font-display text-lg font-bold tracking-tight">
            {brand.name}
          </span>
        </div>

        {/* Nav sections */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin">
          {sections.map((section, idx) => (
            <div key={idx} className="mb-5">
              {section.title && (
                <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.title}
                </p>
              )}
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon
                  const isActive = item.id === activeId
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => handleItemClick(item)}
                        className={cn(
                          'w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                          isActive
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-foreground/70 hover:bg-accent hover:text-accent-foreground'
                        )}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <Icon className="h-[18px] w-[18px] shrink-0" />
                        <span className="flex-1 text-left">{item.label}</span>
                        {item.badge !== undefined && item.badge > 0 && (
                          <span
                            className={cn(
                              'min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center',
                              isActive
                                ? 'bg-primary-foreground/20 text-primary-foreground'
                                : 'bg-secondary text-secondary-foreground'
                            )}
                          >
                            {item.badge > 99 ? '99+' : item.badge}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Footer sidebar */}
        {sidebarFooter && (
          <div className="border-t border-border p-3">{sidebarFooter}</div>
        )}
      </aside>

      {/* ════════ MAIN COLUMN ════════ */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* ── Topbar (sticky, glassmorphism) ── */}
        <header className="sticky top-0 z-30 h-16 ds-glass border-b border-border flex items-center gap-3 px-4 md:px-6">
          {/* Mobile menu trigger */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileDrawerOpen(true)}
            aria-label="Ouvrir le menu"
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Brand (mobile only, dans la topbar) */}
          <div className="md:hidden flex items-center gap-2">
            <span className="font-display font-bold tracking-tight">{brand.name}</span>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* User stats (gamification) — hidden on small screens */}
          {userStats && (
            <div className="hidden sm:block">
              <UserStats stats={userStats} compact />
            </div>
          )}

          {/* Topbar actions */}
          {topbarActions && <div className="flex items-center gap-1">{topbarActions}</div>}

          {/* User avatar */}
          <div className="flex items-center gap-2 pl-2 border-l border-border">
            <div className="hidden sm:block text-right">
              <p className="text-xs font-semibold leading-tight">{user.name}</p>
              {user.role && (
                <p className="text-[10px] text-muted-foreground leading-tight">{user.role}</p>
              )}
            </div>
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="h-8 w-8 rounded-full object-cover border border-border"
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center text-xs font-bold">
                {user.name.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
        </header>

        {/* ── Main content area ── */}
        <main className="flex-1 overflow-auto p-4 md:p-6">
          {children}
        </main>
      </div>

      {/* ════════ BOTTOM NAV (mobile) — glassmorphism ════════ */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 ds-glass border-t border-border"
        aria-label="Navigation mobile"
      >
        <div className="flex items-stretch justify-around h-16 max-w-md mx-auto">
          {bottomNavItems.map((item) => {
            const Icon = item.icon
            const isActive = item.id === activeId
            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(item)}
                className={cn(
                  'flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon className="h-5 w-5" />
                <span className="truncate max-w-[60px]">{item.label}</span>
              </button>
            )
          })}
        </div>
      </nav>

      {/* ════════ DRAWER MOBILE (Sheet simplifié) ════════ */}
      <AnimatePresence>
        {mobileDrawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden fixed inset-0 z-40 bg-black/50"
              onClick={() => setMobileDrawerOpen(false)}
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="md:hidden fixed inset-y-0 left-0 z-50 w-[280px] bg-card border-r border-border flex flex-col"
              role="dialog"
              aria-label="Menu navigation"
            >
              {/* Drawer header */}
              <div className="flex h-16 items-center justify-between px-5 border-b border-border">
                <span className="font-display text-lg font-bold tracking-tight">{brand.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileDrawerOpen(false)}
                  aria-label="Fermer le menu"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              {/* Drawer nav */}
              <nav className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin">
                {sections.map((section, idx) => (
                  <div key={idx} className="mb-5">
                    {section.title && (
                      <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {section.title}
                      </p>
                    )}
                    <ul className="space-y-0.5">
                      {section.items.map((item) => {
                        const Icon = item.icon
                        const isActive = item.id === activeId
                        return (
                          <li key={item.id}>
                            <button
                              onClick={() => handleItemClick(item)}
                              className={cn(
                                'w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                                isActive
                                  ? 'bg-primary text-primary-foreground'
                                  : 'text-foreground/70 hover:bg-accent'
                              )}
                            >
                              <Icon className="h-[18px] w-[18px] shrink-0" />
                              <span className="flex-1 text-left">{item.label}</span>
                              {item.badge !== undefined && item.badge > 0 && (
                                <span className="min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center bg-secondary text-secondary-foreground">
                                  {item.badge > 99 ? '99+' : item.badge}
                                </span>
                              )}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Spacer for bottom nav on mobile (avoids content hidden behind nav) */}
      <div className="md:hidden h-16 shrink-0" aria-hidden="true" />
    </div>
  )
}
