'use client'

import { useState, useMemo } from 'react'
import {
  BookOpen,
  GraduationCap,
  Hash,
  Layers,
  CalendarRange,
  FolderOpen,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  type GroupByField,
  NIVEAU_LABELS,
  SESSION_EXAMEN_LABELS,
  SESSION_EXAMEN_COLORS,
  NIVEAU_COLORS,
} from './classification-types'

// ─── Types ───

/** A generic epreuve that has optional classification fields */
interface GroupableEpreuve {
  id: string
  filiere?: { id: string; nom: string; code: string | null } | null
  niveau?: string | null
  uniteEnseignement?: { id: string; nom: string; code: string | null } | null
  sessionExamen?: string | null
  anneeAcademiqueId?: string | null
  anneeAcademique?: { id: string; libelle: string } | null
  [key: string]: unknown
}

interface EpreuveGroupedViewProps<T extends GroupableEpreuve> {
  epreuves: T[]
  groupBy: GroupByField
  renderCard: (epreuve: T) => React.ReactNode
}

// ─── Group icon resolver ───

function getGroupIcon(groupBy: GroupByField) {
  switch (groupBy) {
    case 'filiere':
      return BookOpen
    case 'niveau':
      return GraduationCap
    case 'ue':
      return Hash
    case 'sessionExamen':
      return Layers
    case 'anneeAcademique':
      return CalendarRange
  }
}

// ─── Group label resolver ───

function getGroupLabel(
  groupBy: GroupByField,
  groupKey: string
): string {
  switch (groupBy) {
    case 'filiere':
      return groupKey
    case 'niveau':
      return NIVEAU_LABELS[groupKey] || groupKey
    case 'ue':
      return groupKey
    case 'sessionExamen':
      return SESSION_EXAMEN_LABELS[groupKey] || groupKey
    case 'anneeAcademique':
      return groupKey
  }
}

// ─── Group color resolver ───

function getGroupColorClasses(
  groupBy: GroupByField,
  groupKey: string
): string {
  switch (groupBy) {
    case 'sessionExamen':
      return (
        SESSION_EXAMEN_COLORS[groupKey] ||
        'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-800'
      )
    case 'niveau':
      return (
        NIVEAU_COLORS[groupKey] ||
        'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-800'
      )
    default:
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800'
  }
}

// ─── Grouping logic ───

interface Group<T> {
  key: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  colorClasses: string
  items: T[]
}

function groupEpreuves<T extends GroupableEpreuve>(
  epreuves: T[],
  groupBy: GroupByField
): Group<T>[] {
  const grouped = new Map<string, T[]>()
  const nonClassees: T[] = []

  for (const epreuve of epreuves) {
    let groupKey: string | null = null

    switch (groupBy) {
      case 'filiere':
        groupKey = epreuve.filiere?.nom ?? null
        break
      case 'niveau':
        groupKey = epreuve.niveau ?? null
        break
      case 'ue':
        groupKey = epreuve.uniteEnseignement
          ? `${epreuve.uniteEnseignement.code} — ${epreuve.uniteEnseignement.nom}`
          : null
        break
      case 'sessionExamen':
        groupKey = epreuve.sessionExamen ?? null
        break
      case 'anneeAcademique':
        groupKey = epreuve.anneeAcademique?.libelle ?? null
        break
    }

    if (groupKey) {
      const existing = grouped.get(groupKey) || []
      existing.push(epreuve)
      grouped.set(groupKey, existing)
    } else {
      nonClassees.push(epreuve)
    }
  }

  const Icon = getGroupIcon(groupBy)

  // Sort groups alphabetically
  const sortedKeys = Array.from(grouped.keys()).sort((a, b) =>
    a.localeCompare(b, 'fr')
  )

  const groups: Group<T>[] = sortedKeys.map((key) => ({
    key,
    label: getGroupLabel(groupBy, key),
    icon: Icon,
    colorClasses: getGroupColorClasses(groupBy, key),
    items: grouped.get(key)!,
  }))

  // Add "Non classées" group at the end
  if (nonClassees.length > 0) {
    groups.push({
      key: '__non_classees__',
      label: 'Non classées',
      icon: FolderOpen,
      colorClasses:
        'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800',
      items: nonClassees,
    })
  }

  return groups
}

// ─── Component ───

export function EpreuveGroupedView<T extends GroupableEpreuve>({
  epreuves,
  groupBy,
  renderCard,
}: EpreuveGroupedViewProps<T>) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const groups = useMemo(
    () => groupEpreuves(epreuves, groupBy),
    [epreuves, groupBy]
  )

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const expandAll = () => {
    setExpandedGroups(new Set(groups.map((g) => g.key)))
  }

  const collapseAll = () => {
    setExpandedGroups(new Set())
  }

  if (epreuves.length === 0) {
    return null
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className="gap-1 text-xs bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800"
        >
          <Layers className="h-3 w-3" />
          {groups.length} groupe{groups.length > 1 ? 's' : ''}
        </Badge>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={expandAll}
        >
          Tout développer
        </button>
        <span className="text-muted-foreground">·</span>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={collapseAll}
        >
          Tout réduire
        </button>
      </div>

      {/* Groups */}
      <div className="space-y-3">
        {groups.map((group) => {
          const isExpanded = expandedGroups.has(group.key)
          const IconComp = group.icon

          return (
            <Collapsible
              key={group.key}
              open={isExpanded}
              onOpenChange={() => toggleGroup(group.key)}
            >
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className={`flex w-full items-center gap-2.5 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${group.colorClasses} hover:opacity-90`}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0" />
                  )}
                  <IconComp className="h-4 w-4 shrink-0" />
                  <span className="truncate">{group.label}</span>
                  <Badge
                    variant="secondary"
                    className="ml-auto shrink-0 text-[10px] px-1.5 py-0 bg-white/60 dark:bg-black/30"
                  >
                    {group.items.length}
                  </Badge>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-2 pl-2">
                  {group.items.map((epreuve) => (
                    <div key={epreuve.id}>{renderCard(epreuve)}</div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )
        })}
      </div>
    </div>
  )
}
