'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
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
  ScrollText,
  type LucideIcon,
} from 'lucide-react'

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarRail,
} from '@/components/ui/sidebar'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/stores/auth-store'
import { useSidebarModeStore } from '@/stores/sidebar-store'
import { NAV_CATEGORIES, PAGE_ROUTES, getPageContext, type PageId } from '@/lib/routes'
import { useSidebar } from '@/components/ui/sidebar'
import { SidebarUserCard } from '@/components/layout/sidebar-user-card'

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
  ScrollText,
}

export function AppSidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const { user } = useAuthStore()
  const mode = useSidebarModeStore((s) => s.mode)
  const { setOpen, isMobile } = useSidebar()

  if (!user) return null

  // Résolution fiable du PageId canonique pour le highlighting de la sidebar.
  // Utilise getPageContext (part de NAV_CATEGORIES[user.role]) plutôt que
  // ROUTE_TO_PAGE, qui souffre de collisions (ex. /programme-academique est
  // mappé à 3 PageId différents, seul le dernier gagne de manière fragile).
  const { pageId: currentPageId } = getPageContext(pathname, user.role)
  const categories = NAV_CATEGORIES[user.role] ?? []

  // Handlers de survol — actifs uniquement en mode 'hover' sur desktop.
  // Au survol du rail d'icônes, la sidebar s'étend (setOpen(true)) ; à la
  // sortie, elle se réduit (setOpen(false)). Les props onMouseEnter /
  // onMouseLeave sont étendues par <Sidebar> sur son conteneur fixe.
  const handleMouseEnter = () => {
    if (!isMobile && mode === 'hover') setOpen(true)
  }
  const handleMouseLeave = () => {
    if (!isMobile && mode === 'hover') setOpen(false)
  }

  const navigateTo = (pageId: PageId) => {
    const route = PAGE_ROUTES[pageId]
    if (route) router.push(route)
  }

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-sidebar-border"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* ─── Header : Logo SECT + motif kente ─── */}
      <SidebarHeader className="p-0 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5 px-4 py-3 ds-kente-pattern">
          <div className="ds-logo-glow h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-[#65A30D] flex items-center justify-center shrink-0">
            <GraduationCap className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-sidebar-foreground">SECT</span>
              <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            </div>
            <span className="text-[10px] text-sidebar-foreground/50 tracking-widest uppercase font-medium">
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
            currentPageId={currentPageId}
            onNavigate={navigateTo}
          />
        ))}
      </SidebarContent>

      {/* ─── Footer : carte utilisateur (popover vers le haut) ─── */}
      <SidebarFooter className="p-2 border-t border-sidebar-border">
        <SidebarUserCard />
      </SidebarFooter>

      <SidebarRail className="after:bg-sidebar-border" />
    </Sidebar>
  )
}

// ─── Category group component ───
function NavCategoryGroup({
  category,
  currentPageId,
  onNavigate,
}: {
  category: {
    id: string
    label: string
    icon: string
    items: { id: string; label: string; icon: string; badge?: string | number }[]
    defaultOpen?: boolean
  }
  currentPageId: string
  onNavigate: (pageId: PageId) => void
}) {
  const hasActiveItem = category.items.some((item) => item.id === currentPageId)
  const [isOpen, setIsOpen] = useState(category.defaultOpen ?? true)
  const shouldForceOpen = hasActiveItem

  const CategoryIcon = ICON_MAP[category.icon]
  const isOverview = category.id.endsWith('-overview')

  // Dashboard flat (pas de collapsible)
  if (isOverview && category.items.length === 1) {
    const item = category.items[0]
    const ItemIcon = ICON_MAP[item.icon]
    const isActive = currentPageId === item.id

    return (
      <SidebarGroup className="py-1">
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={isActive}
                tooltip={item.label}
                onClick={() => onNavigate(item.id as PageId)}
                className={`rounded-lg transition-all duration-200 ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent'
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
          <button className="flex w-full items-center gap-2.5 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40 hover:text-sidebar-foreground/60 transition-colors rounded-lg group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            {CategoryIcon && (
              <CategoryIcon className="size-3.5 shrink-0 text-sidebar-foreground/30" />
            )}
            <span className="flex-1 text-left group-data-[collapsible=icon]:hidden">
              {category.label}
            </span>
            <ChevronDown className="size-3 shrink-0 transition-transform duration-200 text-sidebar-foreground/30 group-data-[collapsible=icon]:hidden group-open/category:rotate-180" />
          </button>
        </CollapsibleTrigger>

        {/* Category items */}
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {category.items.map((item) => {
                const ItemIcon = ICON_MAP[item.icon]
                const isActive = currentPageId === item.id

                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={item.label}
                      onClick={() => onNavigate(item.id as PageId)}
                      className={`pl-7 rounded-lg transition-all duration-200 group-data-[collapsible=icon]:pl-0 ${
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent'
                      }`}
                    >
                      {ItemIcon && <ItemIcon className="size-4" />}
                      <span className="text-[13px]">{item.label}</span>
                      {item.badge !== undefined && (
                        <Badge variant="secondary" className={`ml-auto text-[10px] px-1.5 py-0 h-4 border-0 ${
                          isActive
                            ? 'bg-primary-foreground/20 text-primary-foreground'
                            : 'bg-sidebar-accent text-sidebar-foreground/60'
                        }`}>
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
