// [35m══════════════════════════════════════════════════════════════════════════════
// DistributionPieChart  Graphique camembert pour la répartition des notes
// Palette africaine : vert lime (16-20), terre cuite (12-16), orange (8-12), rouge (0-8)
// [35m══════════════════════════════════════════════════════════════════════════════

'use client'

import { useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

// [36mCouleurs basées sur la palette Savane EdTech[0m
const CHART_COLORS = [
  'hsl(var(--chart-1))', // Vert lime (16-20: Excellent)
  'hsl(var(--chart-2))', // Terre cuite (12-16: Bon)
  'hsl(var(--chart-4))', // Orange (8-12: Moyen)
  'hsl(var(--chart-5))', // Rouge (0-8: Insuffisant)
]

interface DistributionData {
  name: string
  value: number
  color: string
}

interface DistributionPieChartProps {
  data: DistributionData[]
  height?: number
}

/**
 * DistributionPieChart  Affiche la répartition des notes sous forme de camembert.
 *
 * @param data  Tableau de données avec name, value et color.
 * @param height  Hauteur du graphique (par défaut: 288px).
 *
 * @example
 * ```tsx
 * <DistributionPieChart
 *   data={[
 *     { name: '16-20', value: 60, color: 'hsl(var(--chart-1))' },
 *     { name: '12-16', value: 30, color: 'hsl(var(--chart-2))' },
 *     { name: '8-12', value: 8, color: 'hsl(var(--chart-4))' },
 *     { name: '0-8', value: 2, color: 'hsl(var(--chart-5))' },
 *   ]}
 * />
 * ```
 */
export function DistributionPieChart({ data, height = 288 }: DistributionPieChartProps) {
  // Calcul du total pour les pourcentages
  const total = useMemo(() => data.reduce((acc, item) => acc + item.value, 0), [data])

  // Formattage des données pour le tooltip
  const formattedData = useMemo(
    () => data.map((item) => ({
      ...item,
      percentage: total > 0 ? (item.value / total) * 100 : 0,
    })),
    [data, total]
  )

  // Vérifier si toutes les valeurs sont à 0
  const isEmpty = useMemo(() => total === 0, [total])

  return (
    <Card className="ds-kente-top">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-display tracking-tight">
          <div className="h-4 w-4 rounded-full bg-gradient-to-r from-chart-1 to-chart-2" />
          Répartition des notes
        </CardTitle>
        <CardDescription>
          {total > 0
            ? `${data.length} tranche(s) de notes parmi ${total} copies`
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
                  label={({ name, percentage }) =>
                    percentage > 5 ? `${name} (${Math.round(percentage)}%)` : ''
                  }
                  labelLine={false}
                >
                  {formattedData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.color}
                      stroke="hsl(var(--background))"
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted) / 0.4)', radius: 4 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const entry = payload[0].payload as DistributionData & { percentage: number }
                    return (
                      <div className="rounded-lg border bg-background px-3 py-2 shadow-md">
                        <p className="text-sm font-medium">{entry.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {entry.value} étudiant(s) ({entry.percentage.toFixed(1)}%)
                        </p>
                      </div>
                    )
                  }}
                />
                <Legend
                  layout="vertical"
                  align="right"
                  verticalAlign="middle"
                  wrapperStyle={{ paddingLeft: '20px' }}
                  formatter={(value, entry) => (
                    <span className="text-sm">
                      <span
                        className="inline-block h-2 w-2 rounded-full mr-2"
                        style={{ backgroundColor: entry.color }}
                      />
                      {value}
                    </span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        {/* Légende personnalisée (plus lisible) */}
        <div className="mt-4 flex flex-wrap gap-4">
          {formattedData.map((item, index) => (
            <div key={`legend-${index}`} className="flex items-center gap-2">
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-xs text-muted-foreground">
                {item.name} ({item.value}  {item.percentage.toFixed(1)}%)
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
