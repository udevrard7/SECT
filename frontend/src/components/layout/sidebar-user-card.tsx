'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  User, Settings, LogOut, Repeat, ChevronsUpDown,
} from 'lucide-react'

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { useAuthStore, type UserRole } from '@/stores/auth-store'
import { useSwitchAccountStore } from '@/stores/switch-account-store'
import { PAGE_ROUTES, getSettingsPageId, type PageId } from '@/lib/routes'

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrateur',
  RESPONSABLE: 'Responsable des études',
  ENSEIGNANT: 'Enseignant',
  ETUDIANT: 'Étudiant',
}

/**
 * SidebarUserCard — Carte utilisateur en bas de la sidebar (pattern Linear /
 * Vercel / Notion / Discord).
 *
 * Trigger : avatar + nom + rôle + chevron. En mode « rail d'icônes »
 * (sidebar collapsed), seul l'avatar est affiché.
 *
 * Popover vers le haut (side="top") :
 *  - En-tête : avatar, nom, email, badge rôle
 *  - « Mon profil » (User)
 *  - « Paramètres » (Settings) — masqué pour ENSEIGNANT/ÉTUDIANT
 *  - « Changer de compte » (Repeat) → ouvre le SwitchAccountDialog
 *  - « Déconnexion » (LogOut, rouge)
 *
 * Accessibilité :
 *  - Popover radix (focus management, Esc, clic extérieur)
 *  - aria-label sur le trigger
 *  - Fermeture du popover après chaque navigation
 */
export function SidebarUserCard() {
  const { user, logout } = useAuthStore()
  const router = useRouter()
  const openSwitchAccount = useSwitchAccountStore((s) => s.openDialog)
  const [open, setOpen] = useState(false)

  if (!user) return null

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const settingsPageId = getSettingsPageId(user.role)

  const navigateTo = (pageId: PageId) => {
    const route = PAGE_ROUTES[pageId]
    setOpen(false)
    if (route) router.push(route)
  }

  const handleSwitchAccount = () => {
    setOpen(false)
    openSwitchAccount()
  }

  const handleLogout = () => {
    setOpen(false)
    logout()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={`Menu du compte ${user.name}`}
          className={cn(
            'group/user-card relative flex w-full items-center gap-2.5 rounded-xl p-2 transition-all duration-200',
            'hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0',
            open && 'bg-sidebar-accent'
          )}
        >
          <div className="relative shrink-0">
            <Avatar className="h-8 w-8 ring-1 ring-sidebar-border">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            {/* Point de présence en ligne */}
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-sidebar bg-primary" />
          </div>

          <div className="flex flex-1 flex-col gap-0.5 min-w-0 text-left group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-medium truncate leading-tight text-sidebar-foreground">
              {user.name}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-primary truncate">
              {ROLE_LABELS[user.role]}
            </span>
          </div>

          <ChevronsUpDown className="h-4 w-4 shrink-0 text-sidebar-foreground/40 group-hover/user-card:text-sidebar-foreground/70 transition-colors group-data-[collapsible=icon]:hidden" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-72 p-0 rounded-xl shadow-2xl border-border"
      >
        {/* ─── En-tête : identité complète ─── */}
        <div className="flex items-center gap-3 px-3 py-3 bg-sidebar rounded-t-xl">
          <Avatar className="h-10 w-10 shrink-0 ring-2 ring-primary/30">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate text-sidebar-foreground">{user.name}</p>
            <p className="text-xs text-sidebar-foreground/60 truncate">{user.email}</p>
          </div>
        </div>
        <div className="px-3 pb-2 -mt-1 bg-sidebar">
          <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-primary/15 text-primary">
            {ROLE_LABELS[user.role]}
          </span>
        </div>

        <Separator />

        {/* ─── Actions ─── */}
        <div className="p-1.5">
          <button
            onClick={() => navigateTo('profil')}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-foreground/80 hover:bg-muted hover:text-foreground transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <User className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>Mon profil</span>
          </button>

          {settingsPageId && (
            <button
              onClick={() => navigateTo(settingsPageId)}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-foreground/80 hover:bg-muted hover:text-foreground transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Settings className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span>Paramètres</span>
            </button>
          )}

          <button
            onClick={handleSwitchAccount}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-foreground/80 hover:bg-muted hover:text-foreground transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Repeat className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>Changer de compte</span>
          </button>
        </div>

        <Separator />

        {/* ─── Déconnexion ─── */}
        <div className="p-1.5">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/5 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>Déconnexion</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
