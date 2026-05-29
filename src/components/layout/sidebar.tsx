'use client'

import {
  LayoutDashboard,
  Users,
  Building2,
  Settings,
  FileText,
  GraduationCap,
  ClipboardCheck,
  BarChart3,
  Bell,
  FileUp,
  Sparkles,
  Library,
  ClipboardList,
  PenTool,
  TrendingUp,
  FileCheck,
  Award,
  CreditCard,
  Shield,
  KeyRound,
  Layers,
  UserCheck,
  BookMarked,
  type LucideIcon,
} from 'lucide-react'

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarRail,
} from '@/components/ui/sidebar'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useNavigationStore, NAV_ITEMS } from '@/stores/navigation-store'
import { useAuthStore, type UserRole } from '@/stores/auth-store'

// ─── Icon mapping ───
const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  Users,
  Building2,
  Settings,
  FileText,
  GraduationCap,
  ClipboardCheck,
  BarChart3,
  Bell,
  FileUp,
  Sparkles,
  Library,
  ClipboardList,
  PenTool,
  TrendingUp,
  FileCheck,
  Award,
  CreditCard,
  Shield,
  KeyRound,
  Layers,
  UserCheck,
  BookMarked,
}

// ─── Role badge styling ───
const ROLE_BADGE_STYLES: Record<UserRole, string> = {
  ADMIN: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  RESPONSABLE: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  ENSEIGNANT: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  ETUDIANT: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
}

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Admin',
  RESPONSABLE: 'Responsable des études',
  ENSEIGNANT: 'Enseignant',
  ETUDIANT: 'Étudiant',
}

export function AppSidebar() {
  const { currentPage, setCurrentPage } = useNavigationStore()
  const { user } = useAuthStore()

  if (!user) return null

  const navItems = NAV_ITEMS[user.role] ?? []

  // Get user initials for avatar fallback
  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      {/* ─── Header ─── */}
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
          <img
            src="/logo.svg"
            alt="SECT"
            className="h-9 w-9 shrink-0 rounded-lg"
          />
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="text-lg font-bold tracking-tight">SECT</span>
            <span className="text-xs text-muted-foreground">Evaluation IA</span>
          </div>
        </div>
      </SidebarHeader>

      {/* ─── Navigation ─── */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const Icon = ICON_MAP[item.icon]
                const isActive = currentPage === item.id

                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={item.label}
                      onClick={() => setCurrentPage(item.id)}
                      className={
                        isActive
                          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-950/50'
                          : ''
                      }
                    >
                      {Icon && <Icon className="size-4" />}
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* ─── Footer with user info ─── */}
      <SidebarFooter className="p-4">
        <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs font-semibold dark:bg-emerald-900/30 dark:text-emerald-400">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-1 group-data-[collapsible=icon]:hidden min-w-0">
            <span className="text-sm font-medium truncate">{user.name}</span>
            <Badge
              variant="secondary"
              className={`text-[10px] px-1.5 py-0 h-4 w-fit ${ROLE_BADGE_STYLES[user.role]}`}
            >
              {ROLE_LABELS[user.role]}
            </Badge>
          </div>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
