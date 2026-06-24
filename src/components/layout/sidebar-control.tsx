'use client'

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useSidebar } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

/**
 * SidebarControl — Bouton de bascule de la sidebar (collapse/expand).
 *
 * Design Savane EdTech :
 *   - Icône dynamique : PanelLeftOpen (sidebar fermée) / PanelLeftClose (sidebar ouverte)
 *   - Fond translucide qui devient vert lime au survol
 *   - Tooltip natif (title) pour accessibilité
 *   - Taille tactile 36px (h-9 w-9)
 *   - Couleurs sidebar-foreground (blanc sur bleu nuit)
 *
 * Placement : dans le header, à gauche (avant le breadcrumb).
 */
export function SidebarControl({ className }: { className?: string }) {
  const { state, toggleSidebar } = useSidebar()
  const isOpen = state === 'expanded'
  const Icon = isOpen ? PanelLeftClose : PanelLeftOpen

  return (
    <button
      onClick={toggleSidebar}
      aria-label={isOpen ? 'Réduire la sidebar' : 'Agrandir la sidebar'}
      title={isOpen ? 'Réduire la sidebar' : 'Agrandir la sidebar'}
      className={cn(
        'h-9 w-9 shrink-0 rounded-lg flex items-center justify-center',
        'text-sidebar-foreground/60 hover:text-sidebar-foreground',
        'hover:bg-sidebar-accent transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar',
        className
      )}
    >
      <Icon className="h-[18px] w-[18px] transition-transform duration-200 hover:scale-110" />
    </button>
  )
}
