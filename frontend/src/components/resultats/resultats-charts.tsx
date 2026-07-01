// ─────────────────────────────────────────────────────────────
// Composants de charts partagés pour les Résultats & Analyses
// Identité Savane EdTech : palette africaine via tokens CSS
// (jamais de hex brut — résolution via getComputedStyle pour Recharts).
// ─────────────────────────────────────────────────────────────

'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTheme } from 'next-themes'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  AreaChart,
  Area,
  ReferenceLine,
  PieChart,
  Pie,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import type { ScoreBin, QuestionSuccess, EvolutionPoint } from '@/types/resultats'

// ─── Résolution des tokens CSS en valeurs réelles (dark mode safe) ───
// Recharts ne supporte pas `var(--token)` pour les attributs de présentation
// SVG (fill, stroke, stop-color). On lit donc la valeur calculée via
// getComputedStyle et on se ré-abonne aux changements de thème via next-themes.

interface ChartColors {
  primary: string
  secondary: string
  gold: string
  warning: string
  destructive: string
  info: string
  muted: string
  background: string
}

const FALLBACK_COLORS: ChartColors = {
  primary: '#84CC16',
  secondary: '#C2410C',
  gold: '#D4A017',
  warning: '#F5A623',
  destructive: '#D0021B',
  info: '#2C3E50',
  muted: '#E0E0E0',
  background: '#FFFFFF',
}

function resolveColors(): ChartColors {
  if (typeof window === 'undefined') return FALLBACK_COLORS
  const root = document.documentElement
  const get = (name: string, fallback: string) => {
    const v = getComputedStyle(root).getPropertyValue(name).trim()
    return v || fallback
  }
  return {
    primary: get('--primary', FALLBACK_COLORS.primary),
    secondary: get('--secondary', FALLBACK_COLORS.secondary),
    gold: get('--gold', FALLBACK_COLORS.gold),
    warning: get('--warning', FALLBACK_COLORS.warning),
    destructive: get('--destructive', FALLBACK_COLORS.destructive),
    info: get('--info', FALLBACK_COLORS.info),
    muted: get('--border', FALLBACK_COLORS.muted),
    background: get('--background', FALLBACK_COLORS.background),
  }
}

/**
 * useChartColors — résout les tokens CSS en valeurs RGB/hex réelles.
 * Recalcule au montage et à chaque changement de thème next-themes.
 *
 * NOTE : la lecture de getComputedStyle est impossible côté serveur (SSR),
 * donc on initialise avec des valeurs de fallback puis on relit après
 * l'hydration. C'est le pattern standard pour les hooks dépendant du DOM
 * côté client (cf. theme-toggle.tsx dans la même codebase).
 */
export function useChartColors(): ChartColors {
  const { resolvedTheme } = useTheme()
  const [colors, setColors] = useState<ChartColors>(FALLBACK_COLORS)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture DOM côté client après hydration (getComputedStyle indisponible en SSR)
    setColors(resolveColors())
  }, [resolvedTheme])

  return colors
}

// ─── Helpers de couleurs 3-tier (utilisant valeurs résolues) ───

export function getBarColorResolved(scoreOn20: number, c: ChartColors): string {
  if (scoreOn20 >= 16) return c.gold
  if (scoreOn20 >= 10) return c.primary
  return c.destructive
}

export function getSuccessRateColorResolved(rate: number, c: ChartColors): string {
  if (rate >= 70) return c.primary
  if (rate >= 40) return c.warning
  return c.destructive
}

// ─── Tooltip personnalisé réutilisable ───

interface TooltipProps {
  active?: boolean
  payload?: Array<{ value: number; payload?: Record<string, unknown> }>
  label?: string
  suffix?: string
  labelFormatter?: (label: string) => string
}

export function ChartTooltip({ active, payload, label, suffix = '', labelFormatter }: TooltipProps) {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md">
      <p className="text-sm font-medium">{labelFormatter ? labelFormatter(label ?? '') : label}</p>
      <p className="text-sm text-muted-foreground tabular-nums">
        {payload[0].value}
        {suffix}
      </p>
    </div>
  )
}

export function SuccessRateTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload || !payload.length) return null
  const data = payload[0]?.payload as QuestionSuccess | undefined
  return (
    <div className="max-w-xs rounded-lg border bg-background px-3 py-2 shadow-md">
      <p className="text-sm font-medium">{label}</p>
      <p className="text-sm text-muted-foreground">
        Taux de réussite : <span className="font-semibold text-foreground tabular-nums">{payload[0].value}%</span>
      </p>
      {data?.type && (
        <p className="mt-1 text-xs text-muted-foreground">Type : {data.type}</p>
      )}
      {data?.enonce && (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground italic">
          « {data.enonce} »
        </p>
      )}
    </div>
  )
}

// ─── Histogramme de distribution des notes ───

interface DistributionChartProps {
  data: ScoreBin[]
  height?: number
  noteTotal?: number
  onBarClick?: (bin: ScoreBin) => void
  activeBin?: string | null
}

export function DistributionChart({
  data,
  height = 280,
  noteTotal: _noteTotal = 20,
  onBarClick,
  activeBin,
}: DistributionChartProps) {
  const colors = useChartColors()

  return (
    <div className="h-full w-full" style={{ minHeight: height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted/60" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11 }}
            className="text-muted-foreground"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11 }}
            className="text-muted-foreground"
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: 'hsl(var(--muted) / 0.4)', radius: 4 }}
            content={<ChartTooltip suffix=" étudiant(s)" />}
          />
          <ReferenceLine
            x="10-12"
            stroke={colors.primary}
            strokeDasharray="4 4"
            strokeWidth={1.5}
            label={{
              value: 'Reçu',
              position: 'top',
              fill: colors.primary,
              fontSize: 10,
            }}
          />
          <Bar
            dataKey="count"
            radius={[6, 6, 0, 0]}
            cursor={onBarClick ? 'pointer' : 'default'}
            onClick={(_: unknown, idx: number) => onBarClick?.(data[idx])}
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={getBarColorResolved(entry.midpoint, colors)}
                opacity={activeBin && activeBin !== entry.name ? 0.3 : 1}
                className="transition-opacity"
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Taux de réussite par question ───

interface QuestionSuccessChartProps {
  data: QuestionSuccess[]
  height?: number
  onBarClick?: (q: QuestionSuccess) => void
  activeIndex?: number | null
}

export function QuestionSuccessChart({
  data,
  height = 280,
  onBarClick,
  activeIndex,
}: QuestionSuccessChartProps) {
  const colors = useChartColors()

  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground" style={{ minHeight: height }}>
        Aucune donnée de question disponible
      </div>
    )
  }

  return (
    <div className="h-full w-full" style={{ minHeight: height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted/60" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11 }}
            className="text-muted-foreground"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11 }}
            className="text-muted-foreground"
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            cursor={{ fill: 'hsl(var(--muted) / 0.4)', radius: 4 }}
            content={<SuccessRateTooltip />}
          />
          <Bar
            dataKey="taux"
            radius={[6, 6, 0, 0]}
            cursor={onBarClick ? 'pointer' : 'default'}
            onClick={(_: unknown, idx: number) => onBarClick?.(data[idx])}
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={getSuccessRateColorResolved(entry.taux, colors)}
                opacity={activeIndex !== null && activeIndex !== undefined && activeIndex !== index ? 0.3 : 1}
                className="transition-opacity"
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Évolution temporelle (AreaChart) ───

interface EvolutionChartProps {
  data: EvolutionPoint[]
  height?: number
}

export function EvolutionChart({ data, height = 280 }: EvolutionChartProps) {
  const colors = useChartColors()
  const chartData = useMemo(() => data, [data])

  if (chartData.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground" style={{ minHeight: height }}>
        Aucune donnée d&apos;évolution disponible
      </div>
    )
  }

  const gradId = `evolutionGrad-${colors.primary.replace(/[^a-z0-9]/gi, '')}`

  return (
    <div className="h-full w-full" style={{ minHeight: height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={colors.primary} stopOpacity={0.35} />
              <stop offset="95%" stopColor={colors.primary} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted/60" vertical={false} />
          <XAxis
            dataKey="mois"
            tick={{ fontSize: 11 }}
            className="text-muted-foreground"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[0, 20]}
            tick={{ fontSize: 11 }}
            className="text-muted-foreground"
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${v}`}
          />
          <Tooltip
            cursor={{ stroke: colors.primary, strokeWidth: 1, strokeDasharray: '4 4' }}
            content={({ active, payload, label }) => {
              if (!active || !payload || !payload.length) return null
              const point = payload[0]?.payload as EvolutionPoint | undefined
              return (
                <div className="rounded-lg border bg-background px-3 py-2 shadow-md">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-sm text-muted-foreground">
                    Moyenne : <span className="font-semibold text-foreground tabular-nums">{(payload[0].value as number)?.toFixed(1)}/20</span>
                  </p>
                  {point && (
                    <p className="text-xs text-muted-foreground tabular-nums">{point.count} évaluation(s)</p>
                  )}
                </div>
              )
            }}
          />
          <ReferenceLine y={10} stroke={colors.primary} strokeDasharray="4 4" strokeWidth={1} />
          <Area
            type="monotone"
            dataKey="moyenne"
            stroke={colors.primary}
            strokeWidth={2.5}
            fill={`url(#${gradId})`}
            dot={{ r: 3, fill: colors.primary, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: colors.primary, stroke: colors.background, strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Comparaison cross-exam (BarChart horizontal) ───

interface ComparisonBar {
  name: string
  value: number
  count?: number
}

interface ComparisonChartProps {
  data: ComparisonBar[]
  height?: number
  /** Accent sémantique DS (utilisé si `color` n'est pas fourni). */
  accent?: 'primary' | 'secondary' | 'gold' | 'info'
  /**
   * Couleur explicite (legacy) — conservée pour rétro-compatibilité avec
   * les consommateurs externes (ex. enseignant-dashboard). À éviter dans
   * le module resultats : préférez `accent`.
   */
  color?: string
}

export function ComparisonChart({
  data,
  height = 280,
  accent = 'secondary',
  color,
}: ComparisonChartProps) {
  const colors = useChartColors()
  const accentColor = color ?? colors[accent]

  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground" style={{ minHeight: height }}>
        Aucune donnée de comparaison disponible
      </div>
    )
  }

  return (
    <div className="h-full w-full" style={{ minHeight: height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 5, right: 16, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted/60" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 20]}
            tick={{ fontSize: 11 }}
            className="text-muted-foreground"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 11 }}
            className="text-muted-foreground"
            tickLine={false}
            axisLine={false}
            width={140}
          />
          <Tooltip
            cursor={{ fill: 'hsl(var(--muted) / 0.4)', radius: 4 }}
            content={({ active, payload, label }) => {
              if (!active || !payload || !payload.length) return null
              const point = payload[0]?.payload as ComparisonBar | undefined
              return (
                <div className="rounded-lg border bg-background px-3 py-2 shadow-md">
                  <p className="max-w-[200px] truncate text-sm font-medium">{label}</p>
                  <p className="text-sm text-muted-foreground">
                    Moyenne : <span className="font-semibold text-foreground tabular-nums">{(payload[0].value as number)?.toFixed(1)}/20</span>
                  </p>
                  {point?.count !== undefined && (
                    <p className="text-xs text-muted-foreground tabular-nums">{point.count} copie(s)</p>
                  )}
                </div>
              )
            }}
          />
          <ReferenceLine x={10} stroke={colors.primary} strokeDasharray="4 4" strokeWidth={1} />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} fill={accentColor} barSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Donut "Taux de correction" (remplace le pie chart simulé) ───

interface CorrectionDonutProps {
  total: number
  corrigees: number
  height?: number
}

export function CorrectionDonutChart({ total, corrigees, height = 220 }: CorrectionDonutProps) {
  const colors = useChartColors()
  const pending = Math.max(0, total - corrigees)
  const rate = total > 0 ? Math.round((corrigees / total) * 100) : 0

  const data = useMemo(
    () => [
      { name: 'Corrigées', value: corrigees, color: colors.primary },
      { name: 'En attente', value: pending, color: colors.muted },
    ],
    [corrigees, pending, colors.primary, colors.muted]
  )

  if (total === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground" style={{ minHeight: height }}>
        Aucune copie à corriger
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3" style={{ minHeight: height }}>
      <div className="relative w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
              nameKey="name"
              stroke={colors.background}
              strokeWidth={2}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const entry = payload[0].payload as { name: string; value: number }
                return (
                  <div className="rounded-lg border bg-background px-3 py-2 shadow-md">
                    <p className="text-sm font-medium">{entry.name}</p>
                    <p className="text-sm text-muted-foreground tabular-nums">{entry.value} copie(s)</p>
                  </div>
                )
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Légende centrale */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="font-mono text-3xl font-bold tabular-nums text-success-text">{rate}%</p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">corrigées</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-primary" />
          <span className="text-muted-foreground tabular-nums">Corrigées ({corrigees})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
          <span className="text-muted-foreground tabular-nums">En attente ({pending})</span>
        </div>
      </div>
    </div>
  )
}

// ─── Card wrapper pour charts ───

interface ChartCardProps {
  title: string
  description?: string
  icon?: React.ReactNode
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}

export function ChartCard({ title, description, icon, action, className, children }: ChartCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              {icon}
              {title}
            </CardTitle>
            {description && <CardDescription className="mt-1">{description}</CardDescription>}
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  )
}
