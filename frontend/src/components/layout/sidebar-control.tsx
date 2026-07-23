'use client'

import { useState, useEffect, useRef } from 'react'
import { PanelLeftClose, PanelLeftOpen, PanelLeftDashed, Menu } from 'lucide-react'
import { useSidebar } from '@/components/ui/sidebar'
import { useIsMobile } from '@/hooks/use-mobile'
import { useSidebarModeStore, type SidebarMode } from '@/stores/sidebar-store'
import { cn } from '@/lib/utils'

const MODES: { id: SidebarMode; label: string; icon: typeof PanelLeftClose; description: string }[] = [
  { id: 'expanded', label: 'Étendu', icon: PanelLeftClose, description: 'Sidebar toujours visible' },
  { id: 'collapsed', label: 'Réduit', icon: PanelLeftOpen, description: 'Sidebar toujours masquée' },
  { id: 'hover', label: 'Survol', icon: PanelLeftDashed, description: "S'ouvre au survol" },
]

/**
 * SidebarControl — Contrôle de la sidebar.
 *
 * Comportement adaptatif mobile/desktop :
 *   - **Mobile** (<768px) : bouton hamburger (icône Menu) qui appelle
 *     `toggleSidebar()` → ouvre/ferme la Sheet sidebar native de shadcn.
 *     La Sheet est gérée par le composant <Sidebar> qui, en mode mobile,
 *     render un <Sheet> au lieu du <div> fixe desktop.
 *   - **Desktop** (≥768px) : dropdown avec 3 modes (Étendu/Réduit/Survol)
 *     comme auparavant.
 *
 * BUGFIX (SIDEBAR-MOBILE) : avant, le SidebarControl utilisait uniquement
 * `setOpen()` qui ne fonctionne QUE pour le mode desktop (le state `open`
 * contrôle la sidebar fixe). Sur mobile, c'est `openMobile` + `setOpenMobile()`
 * qui contrôlent la Sheet. La fonction `toggleSidebar()` gère les deux
 * correctement. L'ancien code ouvrait un dropdown inutile sur mobile au lieu
 * d'ouvrir la sidebar Sheet.
 */
export function SidebarControl({ className }: { className?: string }) {
  const { state, setOpen, toggleSidebar } = useSidebar()
  const isMobile = useIsMobile()
  const mode = useSidebarModeStore((s) => s.mode)
  const setMode = useSidebarModeStore((s) => s.setMode)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Au montage et à chaque changement de mode, on synchronise l'état `open`
  // de la sidebar avec le mode persisté. Uniquement sur desktop.
  useEffect(() => {
    if (!isMobile) {
      setOpen(mode === 'expanded')
    }
  }, [mode, isMobile, setOpen])

  // Sync mode avec l'état réel de la sidebar : en mode 'hover' le radio
  // reste sur 'Survol' même quand la sidebar s'ouvre au survol.
  const currentMode: SidebarMode = mode === 'hover' ? 'hover' : (state === 'expanded' ? 'expanded' : 'collapsed')

  // Fermeture au clic extérieur (dropdown desktop)
  useEffect(() => {
    if (!dropdownOpen) return
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDropdownOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [dropdownOpen])

  // Applique le mode sélectionné : persiste le mode dans le store et bascule
  // l'état `open` de la sidebar. Uniquement pertinent sur desktop.
  const applyMode = (newMode: SidebarMode) => {
    setMode(newMode)
    setDropdownOpen(false)

    if (newMode === 'expanded') {
      setOpen(true)
    } else {
      setOpen(false)
    }
  }

  // ─── Mobile : bouton hamburger simple ───
  if (isMobile) {
    return (
      <button
        onClick={toggleSidebar}
        aria-label="Ouvrir le menu"
        title="Ouvrir le menu"
        className={cn(
          'h-9 w-9 rounded-lg flex items-center justify-center',
          'text-sidebar-foreground/60 hover:text-sidebar-foreground',
          'hover:bg-sidebar-accent transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar',
          className
        )}
      >
        <Menu className="h-[18px] w-[18px]" />
      </button>
    )
  }

  // ─── Desktop : dropdown avec 3 modes ───
  const CurrentIcon = MODES.find((m) => m.id === currentMode)?.icon ?? PanelLeftClose

  return (
    <div ref={dropdownRef} className={cn('relative shrink-0', className)}>
      {/* Bouton principal */}
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        aria-label="Contrôle de la sidebar"
        title="Contrôle de la sidebar"
        aria-expanded={dropdownOpen}
        className={cn(
          'h-9 w-9 rounded-lg flex items-center justify-center',
          'text-sidebar-foreground/60 hover:text-sidebar-foreground',
          'hover:bg-sidebar-accent transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar',
          dropdownOpen && 'bg-sidebar-accent text-sidebar-foreground'
        )}
      >
        <CurrentIcon className="h-[18px] w-[18px] transition-transform duration-200 hover:scale-110" />
      </button>

      {/* Dropdown */}
      {dropdownOpen && (
        <div className="absolute top-full left-0 mt-2 w-52 bg-card rounded-xl shadow-2xl border border-border overflow-hidden z-50">
          {/* Header */}
          <div className="px-3 py-2 border-b border-border">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Contrôle de la sidebar
            </p>
          </div>

          {/* Options */}
          <div className="p-1.5">
            {MODES.map((m) => {
              const Icon = m.icon
              const isSelected = currentMode === m.id
              return (
                <button
                  key={m.id}
                  onClick={() => applyMode(m.id)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors text-left',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isSelected
                      ? 'bg-primary/10 text-primary-text'
                      : 'hover:bg-muted text-foreground/70'
                  )}
                >
                  {/* Radio indicator */}
                  <span
                    className={cn(
                      'shrink-0 h-4 w-4 rounded-full border-2 flex items-center justify-center transition-colors',
                      isSelected ? 'border-primary' : 'border-muted-foreground/30'
                    )}
                  >
                    {isSelected && <span className="h-2 w-2 rounded-full bg-primary" />}
                  </span>

                  {/* Icon */}
                  <Icon className={cn('h-4 w-4 shrink-0', isSelected ? 'text-primary-text' : 'text-muted-foreground')} />

                  {/* Label + description */}
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm font-medium', isSelected ? 'text-primary-text' : 'text-foreground/80')}>
                      {m.label}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">{m.description}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
