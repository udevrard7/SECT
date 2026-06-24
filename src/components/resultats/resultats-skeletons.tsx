// ─────────────────────────────────────────────────────────────
// Skeletons de chargement pour la page Résultats & Analyses
// ─────────────────────────────────────────────────────────────

'use client'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { PulseSkeleton } from '@/components/ds'

export function KpiSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <PulseSkeleton className="h-10 w-10 shrink-0 rounded-lg" variant="card" />
              <div className="flex-1 space-y-2">
                <PulseSkeleton className="h-3 w-20" />
                <PulseSkeleton className="h-7 w-16" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function ChartSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <PulseSkeleton className="h-5 w-48" />
        <PulseSkeleton className="mt-1 h-3 w-32" />
      </CardHeader>
      <CardContent className="pt-0">
        <PulseSkeleton className="h-64 w-full rounded-md" />
      </CardContent>
    </Card>
  )
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <PulseSkeleton className="h-5 w-40" />
            <PulseSkeleton className="h-3 w-56" />
          </div>
          <PulseSkeleton className="h-8 w-32" />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          <PulseSkeleton className="h-10 w-full" />
          {Array.from({ length: rows }).map((_, i) => (
            <PulseSkeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <KpiSkeleton />
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
      <TableSkeleton rows={5} />
    </div>
  )
}

export function PageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <PulseSkeleton className="h-8 w-72" />
          <PulseSkeleton className="h-4 w-56" />
        </div>
        <PulseSkeleton className="h-9 w-28" />
      </div>
      {/* Tabs skeleton */}
      <PulseSkeleton className="h-10 w-96" />
      <OverviewSkeleton />
    </div>
  )
}
