// kpi-row.tsx — KPIs d'en-tête + bandeau critique (SECT-MONITORING-UI-1).
//
// Source de vérité UNIQUE : GET /api/monitoring/overview → kpis (ADR-0011) —
// les mêmes compteurs que la carte « Santé plateforme » du dashboard admin.
// Accents DYNAMIQUES (plus de warning figé) + NOUVEAU KPI « Backlog
// autorisations » (composante réelle du score : −1/attente, cap −10).
// État d'erreur honnête : overview indisponible → « — », accent neutre
// (jamais de 0 vert fabriqué quand la donnée manque).

import {
  Activity,
  AlertOctagon,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  HeartPulse,
  ShieldAlert,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/ds'
import type { OverviewData } from './types'
import { scoreAccent } from './utils'

export function KpiRow({
  overview,
  loading,
}: {
  overview: OverviewData | null
  loading: boolean
}) {
  const k = overview?.kpis
  const score = overview?.score.score ?? 0
  // Erreur honnête : overview indisponible (et pas en cours de chargement)
  // → valeurs « — », accents neutres.
  const unavailable = !overview && !loading
  const v = (n: number | undefined) => (unavailable ? '—' : (n ?? 0))
  const acc = (ok: boolean, bad: 'warning' | 'danger') =>
    unavailable ? ('primary' as const) : ok ? ('success' as const) : bad

  return (
    <div
      className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6"
      aria-label="Indicateurs clés de santé plateforme"
    >
      <StatCard
        label="Score santé"
        value={overview ? `${overview.score.score}` : '—'}
        suffix={overview ? '%' : ''}
        icon={HeartPulse}
        accent={unavailable ? 'primary' : scoreAccent(score)}
        loading={loading}
        index={0}
        hint={
          overview
            ? overview.score.verdict === 'BONNE_SANTE'
              ? 'Plateforme en bonne santé'
              : overview.score.verdict === 'ATTENTION'
                ? 'Attention requise'
                : 'Action urgente requise'
            : unavailable
              ? 'Vue système indisponible'
              : 'Score backend partagé avec le dashboard'
        }
      />
      <StatCard
        label="Événements actifs"
        value={v(k?.activeEvents)}
        icon={Activity}
        accent={acc((k?.activeEvents ?? 0) === 0, 'warning')}
        loading={loading}
        index={1}
        hint={overview ? `${k?.warningEvents ?? 0} avertissement(s)` : '…'}
      />
      <StatCard
        label="Critiques"
        value={v(k?.criticalEvents)}
        icon={AlertOctagon}
        accent={acc((k?.criticalEvents ?? 0) === 0, 'danger')}
        loading={loading}
        index={2}
        hint={
          overview
            ? (k?.criticalEvents ?? 0) === 0
              ? 'Aucun — rien d’urgent'
              : 'Action urgente requise'
            : '…'
        }
      />
      <StatCard
        label="Erreurs"
        value={v(k?.errorEvents)}
        icon={XCircle}
        accent={acc((k?.errorEvents ?? 0) === 0, 'danger')}
        loading={loading}
        index={3}
        hint={overview ? 'Erreurs actives (5xx suivies)' : '…'}
      />
      <StatCard
        label="Résolus (24 h)"
        value={v(k?.resolved24h)}
        icon={CheckCircle2}
        accent={unavailable ? 'primary' : 'success'}
        loading={loading}
        index={4}
        hint={overview ? `${k?.resolvedToday ?? 0} aujourd'hui` : '…'}
      />
      <StatCard
        label="Backlog autorisations"
        value={v(k?.autorisationsEnAttente)}
        icon={ClipboardList}
        accent={
          unavailable
            ? 'primary'
            : (k?.autorisationsEnAttente ?? 0) === 0
              ? 'success'
              : (k?.autorisationsEnAttente ?? 0) >= 10
                ? 'danger'
                : 'warning'
        }
        loading={loading}
        index={5}
        hint={overview ? `${k?.autorisationsActives ?? 0} active(s) · −1 pt/attente (cap 10)` : '…'}
      />
    </div>
  )
}

/** Bandeau d'action immédiate — uniquement si des CRITICAUX sont actifs. */
export function CriticalBanner({
  criticalCount,
  onGoToAlerts,
}: {
  criticalCount: number
  onGoToAlerts: () => void
}) {
  if (criticalCount <= 0) return null
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 sm:flex-row sm:items-center sm:justify-between dark:bg-destructive/20"
    >
      <div className="flex items-start gap-3 min-w-0">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/15">
          <ShieldAlert className="h-5 w-5 text-destructive animate-pulse" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-destructive">
            {criticalCount} événement{criticalCount > 1 ? 's' : ''} critique{criticalCount > 1 ? 's' : ''} actif{criticalCount > 1 ? 's' : ''}
          </p>
          <p className="text-xs text-muted-foreground">
            Intervention immédiate requise — chaque critique actif pénalise le score de −5 (plafond
            −30) et notifie les ADMIN.
          </p>
        </div>
      </div>
      <Button
        size="sm"
        className="gap-1.5 bg-destructive hover:bg-destructive/90 text-destructive-foreground shrink-0"
        onClick={onGoToAlerts}
      >
        Traiter maintenant
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
    </div>
  )
}
