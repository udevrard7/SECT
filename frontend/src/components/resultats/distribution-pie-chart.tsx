// ─────────────────────────────────────────────────────────────
// DistributionPieChart — composant décoratif conservé pour rétro-
// compatibilité. L'overview-tab utilise désormais CorrectionDonutChart
// (données réelles). Ce composant reste pour les consommateurs externes.
// Palette : tokens DS uniquement (aucun hex brut).
// ─────────────────────────────────────────────────────────────

'use client'

import { useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useChartColors } from './resultats-charts'

interface DistributionData {
  name: string
  value: number
}

interface DistributionPieChartProps {
  data: DistributionData[]
  height?: number
}

export function DistributionPieChart({ data, height = 288 }: DistributionPieChartProps) {
  const colors = useChartColors()

  // Palette 4-tier alignée sur le score (or / vert / orange / rouge)
  const palette = useMemo(
    () => [colors.gold, colors.primary, colors.warning, colors.destructive],
    [colors.gold, colors.primary, colors.warning, colors.destructive]
  )

  const total = useMemo(() => data.reduce((acc, item) => acc + item.value, 0), [data])
  const formattedData = useMemo(
    () =>
      data.map((item) => ({
        ...item,
        percentage: total > 0 ? (item.value / total) * 100 : 0,
      })),
    [data, total]
  )
  const isEmpty = total === 0

  return (
    <Card className="ds-kente-top">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-display tracking-tight">
          <span className="inline-block h-3 w-3 rounded-full bg-primary" />
          Répartition des notes
        </CardTitle>
        <CardDescription className="tabular-nums">
          {total > 0
            ? `${data.length} tranche(s) parmi ${total} copies`
            : 'Aucune donnée disponible'}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-full w-full" style={{ minHeight: height }}>
          {isEmpty ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              <p>Aucune donnée de répartition disponible</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={formattedData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percentage }: { name?: string; percentage?: number }) =>
                    percentage && percentage > 5 ? `${name} (${Math.round(percentage)}%)` : ''
                  }
                  labelLine={false}
                  stroke={colors.background}
                  strokeWidth={2}
                >
                  {formattedData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={palette[index % palette.length]} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const entry = payload[0].payload as DistributionData & { percentage: number }
                    return (
                      <div className="rounded-lg border bg-background px-3 py-2 shadow-md">
                        <p className="text-sm font-medium">{entry.name}</p>
                        <p className="text-sm text-muted-foreground tabular-nums">
                          {entry.value} étudiant(s) ({entry.percentage.toFixed(1)}%)
                        </p>
                      </div>
                    )
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        {/* Légende personnalisée */}
        <div className="mt-4 flex flex-wrap gap-4">
          {formattedData.map((item, index) => (
            <div key={`legend-${index}`} className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: palette[index % palette.length] }}
              />
              <span className="text-xs text-muted-foreground tabular-nums">
                {item.name} ({item.value} · {item.percentage.toFixed(1)}%)
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
