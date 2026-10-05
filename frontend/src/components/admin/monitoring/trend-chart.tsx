// trend-chart.tsx — Barres empilées « Événements/jour × sévérité » (7 jours).
// Isolé de system-tab pour lazy-loader recharts (bundle initial allégé).

'use client'

import {
  Bar,
  BarChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { SEVERITY_CONFIG, type Severity, type TrendPoint } from './types'

export function TrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} role="img" aria-label="Événements par jour et sévérité sur 7 jours">
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: string) => v.slice(5)}
        />
        <YAxis allowDecimals={false} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={24} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
          formatter={(value: number | string, name: string) => [
            value,
            SEVERITY_CONFIG[name as Severity]?.label ?? name,
          ]}
        />
        <Legend
          wrapperStyle={{ fontSize: 11 }}
          formatter={(value: string) => SEVERITY_CONFIG[value as Severity]?.label ?? value}
        />
        <Bar dataKey="critical" stackId="a" fill="#ef4444" name="Critique" />
        <Bar dataKey="error" stackId="a" fill="#f59e0b" name="Erreur" />
        <Bar dataKey="warning" stackId="a" fill="#eab308" name="Avertissement" />
        <Bar dataKey="info" stackId="a" fill="#14b8a6" name="Info" />
      </BarChart>
    </ResponsiveContainer>
  )
}
