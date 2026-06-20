'use client'

import {
  BookOpen,
  GraduationCap,
  Layers,
  CalendarRange,
  Hash,
  BarChart3,
  FolderOpen,
  X,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import {
  type ClassificationStats,
  NIVEAU_LABELS,
  SESSION_EXAMEN_LABELS,
  SESSION_EXAMEN_COLORS,
  NIVEAU_COLORS,
} from './classification-types'

// ─── Types ───

interface ActiveFilter {
  dimension: 'filiere' | 'niveau' | 'sessionExamen' | 'anneeAcademique'
  value: string
}

interface ClassificationStatsProps {
  stats: ClassificationStats
  activeFilters?: ActiveFilter[]
  onFilterClick?: (filter: ActiveFilter) => void
  onFilterRemove?: (dimension: ActiveFilter['dimension'], value: string) => void
}

// ─── Chip component ───

interface StatsChipProps {
  label: string
  count: number
  colorClasses?: string
  isActive?: boolean
  onClick?: () => void
  onRemove?: () => void
}

function StatsChip({
  label,
  count,
  colorClasses,
  isActive,
  onClick,
  onRemove,
}: StatsChipProps) {
  const defaultColor =
    'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-800'

  return (
    <button
      type="button"
      className={`group inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap ${
        isActive
          ? 'ring-2 ring-emerald-400 ring-offset-1 dark:ring-emerald-500 dark:ring-offset-background'
          : ''
      } ${colorClasses || defaultColor} hover:opacity-90`}
      onClick={onClick}
    >
      <span>{label}</span>
      <span
        className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full text-[10px] font-bold ${
          isActive
            ? 'bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-200'
            : 'bg-black/10 dark:bg-white/10'
        } px-1`}
      >
        {count}
      </span>
      {isActive && onRemove && (
        <X
          className="h-3 w-3 shrink-0 opacity-60 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
        />
      )}
    </button>
  )
}

// ─── Dimension section component ───

interface DimensionSectionProps {
  title: string
  icon: React.ComponentType<{ className?: string }>
  chips: Array<{
    key: string
    label: string
    count: number
    colorClasses?: string
  }>
  activeFilterValue?: string
  onChipClick?: (key: string) => void
  onChipRemove?: () => void
}

function DimensionSection({
  title,
  icon: Icon,
  chips,
  activeFilterValue,
  onChipClick,
  onChipRemove,
}: DimensionSectionProps) {
  if (chips.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h4>
        <Badge
          variant="secondary"
          className="text-[10px] px-1.5 py-0 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
        >
          {chips.length}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <StatsChip
            key={chip.key}
            label={chip.label}
            count={chip.count}
            colorClasses={chip.colorClasses}
            isActive={activeFilterValue === chip.key}
            onClick={() => onChipClick?.(chip.key)}
            onRemove={activeFilterValue === chip.key ? onChipRemove : undefined}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Main component ───

export function ClassificationStatsView({
  stats,
  activeFilters = [],
  onFilterClick,
  onFilterRemove,
}: ClassificationStatsProps) {
  const getActiveFilter = (dimension: ActiveFilter['dimension']) =>
    activeFilters.find((f) => f.dimension === dimension)?.value

  // Build chips for each dimension
  const filiereChips = stats.byFiliere
    .sort((a, b) => a.filiereNom.localeCompare(b.filiereNom, 'fr'))
    .map((f) => ({
      key: f.filiereId,
      label: f.filiereCode ? `${f.filiereCode} — ${f.filiereNom}` : f.filiereNom,
      count: f.count,
      colorClasses:
        'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800',
    }))

  const niveauChips = stats.byNiveau
    .sort((a, b) => {
      const order = ['L1', 'L2', 'L3', 'M1', 'M2', 'DOCTORAT']
      return order.indexOf(a.niveau) - order.indexOf(b.niveau)
    })
    .map((n) => ({
      key: n.niveau,
      label: NIVEAU_LABELS[n.niveau] || n.niveau,
      count: n.count,
      colorClasses: NIVEAU_COLORS[n.niveau],
    }))

  const sessionChips = stats.bySessionExamen
    .sort((a, b) => a.sessionExamen.localeCompare(b.sessionExamen))
    .map((s) => ({
      key: s.sessionExamen,
      label: SESSION_EXAMEN_LABELS[s.sessionExamen] || s.sessionExamen,
      count: s.count,
      colorClasses: SESSION_EXAMEN_COLORS[s.sessionExamen],
    }))

  const anneeChips = stats.byAnneeAcademique
    .sort((a, b) => b.libelle.localeCompare(a.libelle))
    .map((a) => ({
      key: a.anneeAcademiqueId,
      label: a.libelle,
      count: a.count,
      colorClasses:
        'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/20 dark:text-teal-300 dark:border-teal-800',
    }))

  const hasAnyData =
    filiereChips.length > 0 ||
    niveauChips.length > 0 ||
    sessionChips.length > 0 ||
    anneeChips.length > 0

  if (!hasAnyData && stats.total === 0) {
    return null
  }

  return (
    <Card className="border-emerald-200 bg-gradient-to-r from-emerald-50/80 to-teal-50/80 dark:border-emerald-900 dark:from-emerald-950/30 dark:to-teal-950/30">
      <CardContent className="p-4 md:p-5">
        {/* Header row */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/50">
              <BarChart3 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold">Distribution</p>
              <p className="text-[10px] text-muted-foreground">
                Répartition par catégorie
              </p>
            </div>
          </div>
          <Separator orientation="vertical" className="hidden h-8 sm:block" />
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="gap-1 bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800"
            >
              <BarChart3 className="h-3 w-3" />
              {stats.total} épreuve{stats.total > 1 ? 's' : ''}
            </Badge>
            {stats.nonClassees > 0 && (
              <Badge
                variant="outline"
                className="gap-1 bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800"
              >
                <FolderOpen className="h-3 w-3" />
                {stats.nonClassees} non classée{stats.nonClassees > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>

        {/* Dimension chips - horizontally scrollable on mobile */}
        <ScrollArea className="w-full">
          <div className="space-y-4 pb-2">
            <DimensionSection
              title="Par filière"
              icon={BookOpen}
              chips={filiereChips}
              activeFilterValue={getActiveFilter('filiere')}
              onChipClick={(key) =>
                onFilterClick?.({ dimension: 'filiere', value: key })
              }
              onChipRemove={() =>
                onFilterRemove?.(
                  'filiere',
                  getActiveFilter('filiere') || ''
                )
              }
            />

            <DimensionSection
              title="Par niveau"
              icon={GraduationCap}
              chips={niveauChips}
              activeFilterValue={getActiveFilter('niveau')}
              onChipClick={(key) =>
                onFilterClick?.({ dimension: 'niveau', value: key })
              }
              onChipRemove={() =>
                onFilterRemove?.(
                  'niveau',
                  getActiveFilter('niveau') || ''
                )
              }
            />

            <DimensionSection
              title="Par session"
              icon={Layers}
              chips={sessionChips}
              activeFilterValue={getActiveFilter('sessionExamen')}
              onChipClick={(key) =>
                onFilterClick?.({ dimension: 'sessionExamen', value: key })
              }
              onChipRemove={() =>
                onFilterRemove?.(
                  'sessionExamen',
                  getActiveFilter('sessionExamen') || ''
                )
              }
            />

            <DimensionSection
              title="Par année"
              icon={CalendarRange}
              chips={anneeChips}
              activeFilterValue={getActiveFilter('anneeAcademique')}
              onChipClick={(key) =>
                onFilterClick?.({ dimension: 'anneeAcademique', value: key })
              }
              onChipRemove={() =>
                onFilterRemove?.(
                  'anneeAcademique',
                  getActiveFilter('anneeAcademique') || ''
                )
              }
            />
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        {/* UE summary (compact) */}
        {stats.byUniteEnseignement.length > 0 && (
          <>
            <Separator className="my-3" />
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Par unité d&apos;enseignement
                </h4>
                <Badge
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                >
                  {stats.byUniteEnseignement.length}
                </Badge>
              </div>
              <ScrollArea className="w-full">
                <div className="flex flex-wrap gap-1.5 pb-1">
                  {stats.byUniteEnseignement
                    .sort((a, b) => a.ueCode.localeCompare(b.ueCode))
                    .map((ue) => (
                      <StatsChip
                        key={ue.ueId}
                        label={`${ue.ueCode} — ${ue.ueNom}`}
                        count={ue.count}
                        colorClasses="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800"
                      />
                    ))}
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
