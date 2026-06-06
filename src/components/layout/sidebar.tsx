'use client'

import { useState } from 'react'
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
  BookOpen,
  Activity,
  Receipt,
  ChevronDown,
  Trash2,
  Wrench,
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useNavigationStore, NAV_CATEGORIES } from '@/stores/navigation-store'
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
  BookOpen,
  Activity,
  Receipt,
  ChevronDown,
  Trash2,
  Wrench,
}

// ─── Modern Role Color System ───
const ROLE_COLORS: Record<UserRole, {
  gradient: string
  accent: string
  accentLight: string
  badge: string
  badgeText: string
  avatarRing: string
  avatarBg: string
  avatarText: string
  headerAccent: string
  glowDot: string
  activeBg: string
  activeText: string
  categoryIcon: string
  sidebarBg: string
  sidebarBorder: string
}> = {
  ADMIN: {
    gradient: 'from-rose-950 via-slate-950 to-slate-900',
    accent: 'text-rose-400',
    accentLight: 'text-rose-300',
    badge: 'bg-rose-500/15 text-rose-400 border-rose-500/20',
    badgeText: 'text-rose-400',
    avatarRing: 'ring-rose-500/50',
    avatarBg: 'bg-gradient-to-br from-rose-500 to-rose-700 text-white',
    avatarText: 'text-white',
    headerAccent: 'bg-gradient-to-r from-rose-500 via-rose-400 to-amber-400',
    glowDot: 'bg-rose-400',
    activeBg: 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/15',
    activeText: 'text-rose-400',
    categoryIcon: 'text-rose-400/60',
    sidebarBg: 'bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900',
    sidebarBorder: 'border-slate-800/60',
  },
  RESPONSABLE: {
    gradient: 'from-amber-950 via-slate-950 to-slate-900',
    accent: 'text-amber-400',
    accentLight: 'text-amber-300',
    badge: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    badgeText: 'text-amber-400',
    avatarRing: 'ring-amber-500/50',
    avatarBg: 'bg-gradient-to-br from-amber-500 to-orange-600 text-white',
    avatarText: 'text-white',
    headerAccent: 'bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400',
    glowDot: 'bg-amber-400',
    activeBg: 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/15',
    activeText: 'text-amber-400',
    categoryIcon: 'text-amber-400/60',
    sidebarBg: 'bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900',
    sidebarBorder: 'border-slate-800/60',
  },
  ENSEIGNANT: {
    gradient: 'from-emerald-950 via-slate-950 to-slate-900',
    accent: 'text-emerald-400',
    accentLight: 'text-emerald-300',
    badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    badgeText: 'text-emerald-400',
    avatarRing: 'ring-emerald-500/50',
    avatarBg: 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white',
    avatarText: 'text-white',
    headerAccent: 'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400',
    glowDot: 'bg-emerald-400',
    activeBg: 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15',
    activeText: 'text-emerald-400',
    categoryIcon: 'text-emerald-400/60',
    sidebarBg: 'bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900',
    sidebarBorder: 'border-slate-800/60',
  },
  ETUDIANT: {
    gradient: 'from-violet-950 via-slate-950 to-slate-900',
    accent: 'text-violet-400',
    accentLight: 'text-violet-300',
    badge: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
    badgeText: 'text-violet-400',
    avatarRing: 'ring-violet-500/50',
    avatarBg: 'bg-gradient-to-br from-violet-500 to-purple-600 text-white',
    avatarText: 'text-white',
    headerAccent: 'bg-gradient-to-r from-violet-500 via-purple-400 to-fuchsia-400',
    glowDot: 'bg-violet-400',
    activeBg: 'bg-violet-500/10 text-violet-400 hover:bg-violet-500/15',
    activeText: 'text-violet-400',
    categoryIcon: 'text-violet-400/60',
    sidebarBg: 'bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900',
    sidebarBorder: 'border-slate-800/60',
  },
}

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Admin',
  RESPONSABLE: 'Responsable',
  ENSEIGNANT: 'Enseignant',
  ETUDIANT: 'Étudiant',
}

export function AppSidebar() {
  const { currentPage, setCurrentPage } = useNavigationStore()
  const { user } = useAuthStore()

  if (!user) return null

  const categories = NAV_CATEGORIES[user.role] ?? []
  const colors = ROLE_COLORS[user.role]

  // Get user initials for avatar fallback
  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <Sidebar collapsible="icon" className={`${colors.sidebarBg} ${colors.sidebarBorder} border-r`}>
      {/* ─── Header with logo ─── */}
      <SidebarHeader className="p-4 pb-3 border-b border-slate-800/40">
        <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-xl" />
            <img
              src="/logo.svg"
              alt="SECT"
              className="relative h-9 w-9 shrink-0 rounded-xl brightness-110"
            />
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-white">SECT</span>
              <div className={`h-1.5 w-1.5 rounded-full ${colors.glowDot} animate-pulse`} />
            </div>
            <span className="text-[10px] text-slate-400 tracking-widest uppercase font-medium">
              Évaluation IA
            </span>
          </div>
        </div>
      </SidebarHeader>

      {/* ─── Navigation ─── */}
      <SidebarContent className="px-2 py-3 scrollbar-thin">
        {categories.map((category) => (
          <NavCategoryGroup
            key={category.id}
            category={category}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            colors={colors}
          />
        ))}
      </SidebarContent>

      {/* ─── Footer with user info ─── */}
      <SidebarFooter className="p-3 border-t border-slate-800/40">
        <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
          <div className="relative">
            <Avatar className="h-8 w-8 shrink-0 shadow-lg shadow-black/20">
              <AvatarFallback className={`${colors.avatarBg} text-xs font-bold`}>
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-slate-950 ${colors.glowDot}`} />
          </div>
          <div className="flex flex-col gap-0.5 group-data-[collapsible=icon]:hidden min-w-0">
            <span className="text-sm font-medium truncate leading-tight text-slate-200">{user.name}</span>
            <span className={`text-[10px] font-medium uppercase tracking-wider ${colors.badgeText}`}>
              {ROLE_LABELS[user.role]}
            </span>
          </div>
        </div>
      </SidebarFooter>

      <SidebarRail className="after:bg-slate-600" />
    </Sidebar>
  )
}

// ─── Category group component with collapsible behavior ───
function NavCategoryGroup({
  category,
  currentPage,
  onPageChange,
  colors,
}: {
  category: {
    id: string
    label: string
    icon: string
    items: { id: string; label: string; icon: string; badge?: string | number }[]
    defaultOpen?: boolean
  }
  currentPage: string
  onPageChange: (page: import('@/stores/navigation-store').PageId) => void
  colors: typeof ROLE_COLORS[UserRole]
}) {
  // Auto-expand if the category contains the current page
  const hasActiveItem = category.items.some((item) => item.id === currentPage)
  const [isOpen, setIsOpen] = useState(category.defaultOpen ?? true)
  const shouldForceOpen = hasActiveItem

  const CategoryIcon = ICON_MAP[category.icon]
  const isOverview = category.id.endsWith('-overview')

  // For the "Overview" category with just Dashboard, render flat
  if (isOverview && category.items.length === 1) {
    const item = category.items[0]
    const ItemIcon = ICON_MAP[item.icon]
    const isActive = currentPage === item.id

    return (
      <SidebarGroup className="py-1">
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={isActive}
                tooltip={item.label}
                onClick={() => onPageChange(item.id as import('@/stores/navigation-store').PageId)}
                className={`rounded-lg transition-all duration-200 ${
                  isActive
                    ? `${colors.activeBg} shadow-sm`
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                {ItemIcon && <ItemIcon className="size-4" />}
                <span className="font-medium">{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    )
  }

  return (
    <Collapsible
      open={shouldForceOpen || isOpen}
      onOpenChange={setIsOpen}
      className="group/category"
    >
      <SidebarGroup className="py-0.5">
        {/* Category header */}
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center gap-2.5 px-2 py-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500 hover:text-slate-300 transition-colors rounded-lg group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            {CategoryIcon && (
              <CategoryIcon className={`size-3.5 shrink-0 ${colors.categoryIcon}`} />
            )}
            <span className="flex-1 text-left group-data-[collapsible=icon]:hidden">
              {category.label}
            </span>
            <ChevronDown className="size-3 shrink-0 transition-transform duration-200 text-slate-600 group-data-[collapsible=icon]:hidden group-open/category:rotate-180 group-open/category:text-slate-400" />
          </button>
        </CollapsibleTrigger>

        {/* Category items */}
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {category.items.map((item) => {
                const ItemIcon = ICON_MAP[item.icon]
                const isActive = currentPage === item.id

                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={item.label}
                      onClick={() => onPageChange(item.id as import('@/stores/navigation-store').PageId)}
                      className={`pl-7 rounded-lg transition-all duration-200 group-data-[collapsible=icon]:pl-0 ${
                        isActive
                          ? `${colors.activeBg} shadow-sm`
                          : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                      }`}
                    >
                      {ItemIcon && <ItemIcon className="size-4" />}
                      <span className="text-[13px]">{item.label}</span>
                      {item.badge !== undefined && (
                        <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0 h-4 bg-white/5 text-slate-400 border-0">
                          {item.badge}
                        </Badge>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  )
}
