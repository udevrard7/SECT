// ─────────────────────────────────────────────────────────────
// Composants de charts partagés pour les Résultats & Analyses
// ─────────────────────────────────────────────────────────────

'use client'

import { useMemo } from 'react'
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
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { getBarColor, getSuccessRateColor } from '@/lib/resultats-utils'
import type { ScoreBin, QuestionSuccess, EvolutionPoint } from '@/types/resultats'

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
      <p className="text-sm text-muted-foreground">
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
        Taux de réussite : <span className="font-semibold text-foreground">{payload[0].value}%</span>
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
  noteTotal = 20,
  onBarClick,
  activeBin,
}: DistributionChartProps) {
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
            stroke="#10b981"
            strokeDasharray="4 4"
            strokeWidth={1.5}
            label={{
              value: 'Reçu',
              position: 'top',
              fill: '#10b981',
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
                fill={getBarColor(entry.midpoint)}
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
                fill={getSuccessRateColor(entry.taux)}
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
  const chartData = useMemo(() => data, [data])

  if (chartData.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground" style={{ minHeight: height }}>
        Aucune donnée d&apos;évolution disponible
      </div>
    )
  }

  return (
    <div className="h-full w-full" style={{ minHeight: height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="evolutionGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
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
            cursor={{ stroke: '#10b981', strokeWidth: 1, strokeDasharray: '4 4' }}
            content={({ active, payload, label }) => {
              if (!active || !payload || !payload.length) return null
              const point = payload[0]?.payload as EvolutionPoint | undefined
              return (
                <div className="rounded-lg border bg-background px-3 py-2 shadow-md">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-sm text-muted-foreground">
                    Moyenne : <span className="font-semibold text-foreground">{(payload[0].value as number)?.toFixed(1)}/20</span>
                  </p>
                  {point && (
                    <p className="text-xs text-muted-foreground">{point.count} évaluation(s)</p>
                  )}
                </div>
              )
            }}
          />
          <ReferenceLine y={10} stroke="#10b981" strokeDasharray="4 4" strokeWidth={1} />
          <Area
            type="monotone"
            dataKey="moyenne"
            stroke="#10b981"
            strokeWidth={2.5}
            fill="url(#evolutionGrad)"
            dot={{ r: 3, fill: '#10b981', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
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
  color?: string
}

export function ComparisonChart({ data, height = 280, color = '#14b8a6' }: ComparisonChartProps) {
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
                    Moyenne : <span className="font-semibold text-foreground">{(payload[0].value as number)?.toFixed(1)}/20</span>
                  </p>
                  {point?.count !== undefined && (
                    <p className="text-xs text-muted-foreground">{point.count} copie(s)</p>
                  )}
                </div>
              )
            }}
          />
          <ReferenceLine x={10} stroke="#10b981" strokeDasharray="4 4" strokeWidth={1} />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} fill={color} barSize={22} />
        </BarChart>
      </ResponsiveContainer>
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
