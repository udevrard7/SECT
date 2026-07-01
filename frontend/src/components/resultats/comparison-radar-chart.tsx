// [35m══════════════════════════════════════════════════════════════════════════════
// ComparisonRadarChart  Graphique radar pour comparer les performances par type de question
// Palette africaine : vert lime (primary), terre cuite (secondary), or (gold), bleu nuit (info)
// [35m══════════════════════════════════════════════════════════════════════════════

'use client'

import { useMemo } from 'react'
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

// [36mCouleurs basées sur la palette Savane EdTech[0m
const RADAR_COLORS = {
  primary: 'hsl(var(--chart-1))', // Vert lime
  secondary: 'hsl(var(--chart-2))', // Terre cuite
  gold: 'hsl(var(--chart-3))', // Or
  info: 'hsl(var(--chart-5))', // Rouge (pour contraste)
}

interface RadarData {
  subject: string
  value: number
  fullMark: number
}

interface ComparisonRadarChartProps {
  data: RadarData[]
  height?: number
  title?: string
  description?: string
}

/**
 * ComparisonRadarChart  Affiche un graphique radar pour comparer les performances.
 *
 * @param data  Tableau de données avec subject (nom), value (valeur), fullMark (note max).
 * @param height  Hauteur du graphique (par défaut: 300px).
 * @param title  Titre de la carte (par défaut: "Comparaison par type").
 * @param description  Description (par défaut: "Moyenne /20 par type de question").
 *
 * @example
 * ```tsx
 * <ComparisonRadarChart
 *   data={[
 *     { subject: 'QCM', value: 15, fullMark: 20 },
 *     { subject: 'Ouvert', value: 12, fullMark: 20 },
 *     { subject: 'Vrai/Faux', value: 18, fullMark: 20 },
 *     { subject: 'Appariement', value: 14, fullMark: 20 },
 *   ]}
 *   title="Performance par type de question"
 * />
 * ```
 */
export function ComparisonRadarChart({
  data,
  height = 300,
  title = 'Comparaison par type',
  description = 'Moyenne /20 par type de question',
}: ComparisonRadarChartProps) {
  // Vérifier si les données sont vides
  const isEmpty = useMemo(() => data.length === 0, [data])

  // Calculer la moyenne globale pour la ligne de référence
  const globalAverage = useMemo(
    () => data.reduce((acc, item) => acc + item.value, 0) / (data.length || 1),
    [data]
  )

  return (
    <Card className="ds-kente-top">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-display tracking-tight">
          <div className="h-4 w-4 rounded-full bg-gradient-to-r from-chart-1 to-chart-3" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-full w-full" style={{ minHeight: height }}>
          {isEmpty ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              <p>Aucune donnée disponible pour la comparaison</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {/* BUGFIX (LAYOUT-RADAR-1) : margins augmentées (20 au lieu de 10)
                  pour laisser de l'espace aux labels QCU/QCM/QRC/CODE autour du radar.
                  Avant, les labels se superposaient aux dots du radar sur petit conteneur. */}
              <RadarChart data={data} margin={{ top: 20, right: 20, left: 20, bottom: 20 }}>
                <PolarGrid
                  gridType="polygon"
                  stroke="hsl(var(--muted))"
                  strokeWidth={1}
                />
                {/* tick fontSize 11 (au lieu de 12) pour réduire l'encombrement */}
                <PolarAngleAxis
                  dataKey="subject"
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 11, fontWeight: 500 }}
                  tickLine={false}
                />
                <PolarRadiusAxis
                  angle={45}
                  domain={[0, 20]}
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${value}`}
                />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const entry = payload[0].payload as RadarData
                    return (
                      <div className="rounded-lg border bg-background px-3 py-2 shadow-md">
                        <p className="text-sm font-medium">{entry.subject}</p>
                        <p className="text-sm text-muted-foreground">
                          Moyenne: <span className="font-semibold text-foreground">{entry.value}/20</span>
                        </p>
                      </div>
                    )
                  }}
                />
                {/* Ligne de référence à la moyenne globale.
                    dot r=3 (au lieu de 4) pour réduire la superposition avec les labels. */}
                <Radar
                  name="Moyenne"
                  dataKey="value"
                  stroke="hsl(var(--chart-1))"
                  fill="hsl(var(--chart-1) / 0.2)"
                  fillOpacity={0.6}
                  dot={{ r: 3, fill: 'hsl(var(--chart-1))' }}
                  activeDot={{ r: 5, fill: 'hsl(var(--chart-1))' }}
                />
                {/* Ligne de référence (10/20) */}
                <PolarRadiusAxis
                  angle={45}
                  domain={[0, 20]}
                  stroke="none"
                  tick={false}
                  tickLine={false}
                  axisLine={{ stroke: 'hsl(var(--success-text) / 0.3)', strokeDasharray: '4 4' }}
                />
              </RadarChart>
            </ResponsiveContainer>
          )}
        </div>
        {/* Légende personnalisée
            BUGFIX (LAYOUT-RADAR-1) : flex-wrap + justify-center + gap-x-4 gap-y-2
            (au lieu de ml-auto sur la moyenne) pour éviter que la moyenne se
            superpose aux autres items sur petit conteneur. Chaque item a
            whitespace-nowrap pour ne pas se casser. */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          {data.map((item, index) => (
            <div key={`radar-legend-${index}`} className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
              <div
                className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-current"
                style={{ backgroundColor: RADAR_COLORS.primary }}
              />
              <span className="text-xs text-muted-foreground">
                {item.subject}: <span className="font-semibold text-foreground">{item.value}/20</span>
              </span>
            </div>
          ))}
          <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
            <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-success/20 border border-success-text" />
            <span className="text-xs text-muted-foreground">
              Moyenne: <span className="font-semibold text-success-text">{globalAverage.toFixed(1)}/20</span>
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
