'use client'

import { useRouter } from 'next/navigation'
import {
  LayoutDashboard, Users, Building2, Settings, FileText, GraduationCap,
  ClipboardCheck, BarChart3, Bell, FileUp, Sparkles, Library, ClipboardList,
  PenTool, TrendingUp, FileCheck, Award, CreditCard, Shield, KeyRound,
  Layers, UserCheck, BookMarked, BookOpen, Activity, Receipt, Trash2,
  Wrench, ScrollText, CalendarClock, User, LogOut, type LucideIcon,
} from 'lucide-react'

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { useAuthStore, type UserRole } from '@/stores/auth-store'
import { NAV_CATEGORIES, PAGE_ROUTES, PROFILE_PAGE, getEffectiveRole, type PageId } from '@/lib/routes'

// ─── Map nom d'icône (string dans routes.ts) -> composant Lucide ───
const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard, Users, Building2, Settings, FileText, GraduationCap,
  ClipboardCheck, BarChart3, Bell, FileUp, Sparkles, Library, ClipboardList,
  PenTool, TrendingUp, FileCheck, Award, CreditCard, Shield, KeyRound,
  Layers, UserCheck, BookMarked, BookOpen, Activity, Receipt, Trash2,
  Wrench, ScrollText, CalendarClock,
}

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrateur',
  RESPONSABLE: 'Responsable des études',
  ENSEIGNANT: 'Enseignant',
  ETUDIANT: 'Étudiant',
}

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * CommandPalette — Recherche rapide de pages avec raccourci ⌘K / Ctrl+K.
 *
 * Liste toutes les pages accessibles au rôle de l'utilisateur (regroupées par
 * catégorie de navigation), plus le profil et la déconnexion. La recherche
 * est fuzzy (gérée par cmdk) sur le libellé et l'id de la page.
 *
 * L'ouverture se fait via le trigger de recherche du header ou le raccourci
 * clavier global (branché dans AppHeader).
 */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter()
  const { user, logout } = useAuthStore()

  if (!user) return null

  // ASSISTANCE-MODE-FRONTEND : en mode assistance, l'ADMIN voit les pages
  // RESPONSABLE dans la command palette (cohérent avec la sidebar).
  const effectiveRole = getEffectiveRole(user.role, user.etablissementId)
  const categories = NAV_CATEGORIES[effectiveRole] ?? []

  const goTo = (pageId: PageId) => {
    const route = PAGE_ROUTES[pageId]
    onOpenChange(false)
    if (route) router.push(route)
  }

  const handleLogout = () => {
    onOpenChange(false)
    logout()
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Recherche de pages"
      description="Recherchez et accédez à une page de votre espace SECT."
    >
      <CommandInput placeholder="Rechercher une page…" />
      <CommandList>
        <CommandEmpty>Aucune page ne correspond à votre recherche.</CommandEmpty>

        {/* Pages de navigation, regroupées par catégorie */}
        {categories.map((category) => {
          const HeadingIcon = ICON_MAP[category.icon] ?? LayoutDashboard
          return (
            <CommandGroup
              key={category.id}
              heading={`${category.label} — ${ROLE_LABELS[effectiveRole]}`}
            >
              {category.items.map((item) => {
                const Icon = ICON_MAP[item.icon] ?? LayoutDashboard
                return (
                  <CommandItem
                    key={item.id}
                    value={`${item.label} ${item.id}`}
                    onSelect={() => goTo(item.id)}
                    className="cursor-pointer"
                  >
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span>{item.label}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          )
        })}

        <CommandSeparator />

        {/* Actions de compte */}
        <CommandGroup heading="Compte">
          <CommandItem
            value={`profil ${PROFILE_PAGE.label} compte`}
            onSelect={() => goTo('profil')}
            className="cursor-pointer"
          >
            <User className="h-4 w-4 text-muted-foreground" />
            <span>{PROFILE_PAGE.label}</span>
          </CommandItem>
          <CommandItem
            value="déconnexion logout se déconnecter"
            onSelect={handleLogout}
            className="cursor-pointer text-destructive data-[selected=true]:text-destructive"
          >
            <LogOut className="h-4 w-4" />
            <span>Déconnexion</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
