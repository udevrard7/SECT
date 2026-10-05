'use client'

// hero.tsx — Panneau « salle des machines » du module /monitoring
// (SECT-MONITORING-UI-2 — refonte visuelle console d'observabilité).
//
// Identité : panneau sombre PERMANENT (indépendant du thème clair/sombre
// de l'app) avec grille technique — le module monitoring devient
// visuellement « la salle des machines » de SECT, par opposition aux
// pages métier claires. Signature Savane conservée : liseré kente en
// tête de panneau.
//
// Source de vérité INCHANGÉE (ADR-0011) : GET /api/monitoring/overview →
// score (même formule backend que la carte « Santé plateforme » du
// dashboard admin) + kpis. Aucune valeur fabriquée : overview
// indisponible → tuiles « — » neutres.

import { useEffect, useState } from 'react'
import { ArrowRight, ClipboardList, HeartPulse, RefreshCw, Siren } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { OverviewData, Verdict } from './types'

// ─── Palette console (littérale — sombre permanent) ───

const SCORE_COLOR: Record<'good' | 'mid' | 'bad', { stroke: string; text: string }> = {
  good: { stroke: '#a3e635', text: 'text-lime-400' }, // lime Savane
  mid: { stroke: '#fbbf24', text: 'text-amber-400' },
  bad: { stroke: '#f87171', text: 'text-red-400' },
}

function scoreTone(score: number): 'good' | 'mid' | 'bad' {
  if (score >= 80) return 'good'
  if (score >= 50) return 'mid'
  return 'bad'
}

const VERDICT_LABEL: Record<Verdict, string> = {
  BONNE_SANTE: 'Bonne santé',
  ATTENTION: 'Attention requise',
  URGENT: 'Action urgente',
}

// ─── Jauge en arc 240° (SVG) ───

function ArcGauge({ score, loading }: { score: number; loading: boolean }) {
  // Géométrie : arc de 240° (ouverture en bas), départ à 150° horaire.
  const R = 84
  const CX = 110
  const CY = 112
  const SWEEP = 240
  const C = 2 * Math.PI * R
  const arcLen = (C * SWEEP) / 360
  const valueLen = (arcLen * Math.min(100, Math.max(0, score))) / 100
  const tone = SCORE_COLOR[scoreTone(score)]

  // Révélation animée après montage (CSS transition sur dashoffset).
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setRevealed(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  // Graduations 0 / 25 / 50 / 75 / 100
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const a = ((150 + SWEEP * f) * Math.PI) / 180
    return {
      x1: CX + (R - 9) * Math.cos(a),
      y1: CY + (R - 9) * Math.sin(a),
      x2: CX + (R + 9) * Math.cos(a),
      y2: CY + (R + 9) * Math.sin(a),
      label: String(Math.round(f * 100)),
      lx: CX + (R + 21) * Math.cos(a),
      ly: CY + (R + 21) * Math.sin(a),
      anchor: (Math.abs(Math.cos(a)) < 0.3 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end') as 'middle' | 'start' | 'end',
    }
  })

  return (
    <div className="relative w-[220px] h-[170px] shrink-0 select-none" role="img" aria-label={`Score santé plateforme : ${score} sur 100`}>
      <svg viewBox="0 0 220 190" className="h-full w-full overflow-visible">
        {/* Piste de fond */}
        <circle
          cx={CX}
          cy={CY}
          r={R}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={13}
          strokeLinecap="round"
          strokeDasharray={`${arcLen} ${C}`}
          transform={`rotate(150 ${CX} ${CY})`}
        />
        {/* Arc de valeur */}
        {!loading && (
          <circle
            className="mon-gauge-arc"
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke={tone.stroke}
            strokeWidth={13}
            strokeLinecap="round"
            strokeDasharray={`${valueLen} ${C}`}
            strokeDashoffset={revealed ? 0 : valueLen}
            transform={`rotate(150 ${CX} ${CY})`}
            style={{ filter: `drop-shadow(0 0 6px ${tone.stroke}55)` }}
          />
        )}
        {/* Graduations */}
        {ticks.map((t) => (
          <g key={t.label}>
            <line x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="rgba(255,255,255,0.25)" strokeWidth={1.5} />
            <text
              x={t.lx}
              y={t.ly}
              fill="rgba(228,228,231,0.45)"
              fontSize={9}
              fontFamily="var(--font-jetbrains), monospace"
              textAnchor={t.anchor}
              dominantBaseline="middle"
            >
              {t.label}
            </text>
          </g>
        ))}
      </svg>
      {/* Valeur centrale */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-3">
        {loading ? (
          <div className="h-10 w-20 animate-pulse rounded bg-white/10" aria-hidden="true" />
        ) : (
          <p className={`font-mono text-[42px] font-bold leading-none tabular-nums ${tone.text}`}>
            {score}
            <span className="text-lg font-medium text-zinc-500">/100</span>
          </p>
        )}
        <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.22em] text-zinc-500">
          Score santé
        </p>
      </div>
    </div>
  )
}

// ─── Tuile KPI sombre ───

function KpiTile({
  label,
  value,
  hint,
  tone,
  loading,
}: {
  label: string
  value: string
  hint?: string
  tone: 'good' | 'mid' | 'bad' | 'neutral'
  loading: boolean
}) {
  const valueClass =
    tone === 'good' ? 'text-lime-400' : tone === 'mid' ? 'text-amber-400' : tone === 'bad' ? 'text-red-400' : 'text-zinc-100'
  const dotClass = tone === 'good' ? 'bg-lime-400' : tone === 'mid' ? 'bg-amber-400' : tone === 'bad' ? 'bg-red-400 animate-pulse' : 'bg-zinc-600'
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 sm:px-4 sm:py-3.5">
      <p className="flex items-center gap-1.5 font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-zinc-500">
        <span className={`h-1 w-1 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
        {label}
      </p>
      {loading ? (
        <div className="mt-2 h-7 w-12 animate-pulse rounded bg-white/10" aria-hidden="true" />
      ) : (
        <p className={`mt-1 font-mono text-2xl font-bold leading-none tabular-nums sm:text-[28px] ${valueClass}`}>{value}</p>
      )}
      {hint && <p className="mt-1.5 truncate font-mono text-[10px] text-zinc-600">{hint}</p>}
    </div>
  )
}

// ─── Panneau héro ───

export function ConsoleHero({
  overview,
  loading,
  autoRefresh,
  onToggleAutoRefresh,
  onRefresh,
  isRefreshing,
  lastRefreshLabel,
  activeAlertCount,
  onGoToAlerts,
}: {
  overview: OverviewData | null
  loading: boolean
  autoRefresh: boolean
  onToggleAutoRefresh: (v: boolean) => void
  onRefresh: () => void
  isRefreshing: boolean
  lastRefreshLabel: string
  activeAlertCount: number
  onGoToAlerts: () => void
}) {
  const k = overview?.kpis
  const score = overview?.score.score ?? 0
  const verdict = overview?.score.verdict
  const unavailable = !overview && !loading
  const tone = unavailable ? 'neutral' : scoreTone(score)
  const penalties = (overview?.score.breakdown ?? []).filter((c) => c.penalty < 0)

  return (
    <section
      aria-label="Tableau de contrôle — santé plateforme"
      className="mon-console -mx-4 -mt-4 overflow-hidden rounded-b-2xl border-b border-white/[0.06] text-zinc-200 md:-mx-6 md:-mt-6"
    >
      {/* Signature kente (lien avec l'identité Savane) */}
      <div className="ds-kente-strip h-[3px] opacity-80" aria-hidden="true" />

      {/* ─── Rail supérieur : LIVE + identité + contrôles ─── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/[0.06] px-4 py-2.5 sm:px-6">
        <span className="flex items-center gap-2">
          {autoRefresh ? (
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-lime-400" />
            </span>
          ) : (
            <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
          )}
          <span
            className={`font-mono text-[10px] font-semibold uppercase tracking-[0.22em] ${
              autoRefresh ? 'text-lime-400' : 'text-amber-400'
            }`}
          >
            {autoRefresh ? 'En direct' : 'Suspendu'}
          </span>
        </span>
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500 sm:inline">
          Monitoring · Plateforme SECT
        </span>
        <span className="ml-auto flex items-center gap-3">
          <span className="hidden font-mono text-[10px] text-zinc-500 md:inline" title={overview?.generatedAt ?? undefined}>
            MAJ {lastRefreshLabel}
          </span>
          <span className="flex items-center gap-2">
            <Switch
              id="auto-refresh"
              checked={autoRefresh}
              onCheckedChange={onToggleAutoRefresh}
              className="data-[state=checked]:bg-lime-600"
              aria-label="Actualisation automatique toutes les 30 secondes"
            />
            <Label htmlFor="auto-refresh" className="cursor-pointer font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              Auto 30s
            </Label>
          </span>
          <Button
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="h-7 gap-1.5 border-white/15 bg-white/[0.06] font-mono text-[10px] uppercase tracking-wider text-zinc-300 hover:border-white/25 hover:bg-white/[0.12] hover:text-zinc-100"
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            Actualiser
          </Button>
        </span>
      </div>

      {/* ─── Zone principale : jauge + verdict + tuiles KPI ─── */}
      <div className="flex flex-col items-center gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:items-stretch lg:gap-8">
        {/* Jauge + verdict */}
        <div className="flex flex-col items-center justify-center gap-3 lg:w-[260px] lg:shrink-0">
          <ArcGauge score={score} loading={loading} />
          {!loading && overview && (
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] ${
                tone === 'good'
                  ? 'border-lime-400/30 bg-lime-400/10 text-lime-400'
                  : tone === 'mid'
                    ? 'border-amber-400/30 bg-amber-400/10 text-amber-400'
                    : 'border-red-400/30 bg-red-400/10 text-red-400'
              }`}
            >
              <HeartPulse className="h-3 w-3" aria-hidden="true" />
              {VERDICT_LABEL[verdict ?? 'ATTENTION']}
            </span>
          )}
          {unavailable && (
            <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">
              Vue système indisponible
            </p>
          )}
        </div>

        {/* Tuiles KPI — même source que la carte dashboard (ADR-0011) */}
        <div
          className="grid w-full grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5"
          aria-label="Indicateurs clés de santé plateforme"
        >
          <KpiTile
            label="Événements actifs"
            value={unavailable ? '—' : String(k?.activeEvents ?? 0)}
            hint={overview ? `${k?.warningEvents ?? 0} avertissement(s)` : undefined}
            tone={unavailable ? 'neutral' : (k?.activeEvents ?? 0) === 0 ? 'good' : 'mid'}
            loading={loading}
          />
          <KpiTile
            label="Critiques"
            value={unavailable ? '—' : String(k?.criticalEvents ?? 0)}
            hint={overview ? ((k?.criticalEvents ?? 0) === 0 ? 'Rien d’urgent' : '−5 pts chacun (cap −30)') : undefined}
            tone={unavailable ? 'neutral' : (k?.criticalEvents ?? 0) === 0 ? 'good' : 'bad'}
            loading={loading}
          />
          <KpiTile
            label="Erreurs"
            value={unavailable ? '—' : String(k?.errorEvents ?? 0)}
            hint={overview ? 'Erreurs 5xx suivies' : undefined}
            tone={unavailable ? 'neutral' : (k?.errorEvents ?? 0) === 0 ? 'good' : 'bad'}
            loading={loading}
          />
          <KpiTile
            label="Résolus 24 h"
            value={unavailable ? '—' : String(k?.resolved24h ?? 0)}
            hint={overview ? `${k?.resolvedToday ?? 0} aujourd’hui` : undefined}
            tone="good"
            loading={loading}
          />
          <KpiTile
            label="Backlog autoris."
            value={unavailable ? '—' : String(k?.autorisationsEnAttente ?? 0)}
            hint={overview ? `${k?.autorisationsActives ?? 0} active(s) · −1 pt/attente` : undefined}
            tone={
              unavailable
                ? 'neutral'
                : (k?.autorisationsEnAttente ?? 0) === 0
                  ? 'good'
                  : (k?.autorisationsEnAttente ?? 0) >= 10
                    ? 'bad'
                    : 'mid'
            }
            loading={loading}
          />
        </div>
      </div>

      {/* ─── Rail inférieur : décomposition du score + alertes ─── */}
      <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] px-4 py-2.5 sm:px-6">
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-600">
          Décomposition
        </span>
        {loading ? (
          <span className="h-5 w-40 animate-pulse rounded bg-white/10" aria-hidden="true" />
        ) : penalties.length === 0 ? (
          <span className="rounded border border-lime-400/20 bg-lime-400/[0.08] px-2 py-0.5 font-mono text-[10px] text-lime-400/90">
            Aucune pénalité active
          </span>
        ) : (
          penalties
            .slice()
            .sort((a, b) => a.penalty - b.penalty)
            .map((c) => (
              <span
                key={c.label}
                title={c.detail}
                className="rounded border border-red-400/20 bg-red-400/[0.08] px-2 py-0.5 font-mono text-[10px] tabular-nums text-red-300/90"
              >
                {c.penalty} · {c.label}
              </span>
            ))
        )}
        <span className="ml-auto flex items-center gap-2">
          <ClipboardList className="h-3 w-3 text-zinc-600" aria-hidden="true" />
          <span className="font-mono text-[10px] text-zinc-600">
            Formule backend v2 · partagée avec le dashboard
          </span>
        </span>
      </div>

      {/* ─── Barre d'alarme critique (remplace l'ancien bandeau) ─── */}
      {(overview?.kpis.criticalEvents ?? 0) > 0 && (
        <div
          role="alert"
          className="flex flex-col gap-2 border-t border-red-500/30 bg-red-950/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6"
        >
          <span className="flex min-w-0 items-start gap-2.5">
            <Siren className="mt-0.5 h-4 w-4 shrink-0 animate-pulse text-red-400" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block font-mono text-xs font-semibold uppercase tracking-[0.12em] text-red-300">
                {overview?.kpis.criticalEvents} événement(s) critique(s) actif(s) — intervention immédiate
              </span>
              <span className="block font-mono text-[10px] text-red-400/70">
                Chaque critique : −5 pts (plafond −30) · notification ADMIN envoyée
              </span>
            </span>
          </span>
          <AlarmCta onClick={onGoToAlerts} />
        </div>
      )}

      {/* Pastille alertes actives (file dédiée — cohérente avec l'onglet) */}
      {activeAlertCount > 0 && (
        <div className="flex items-center gap-2 border-t border-amber-400/20 bg-amber-400/[0.06] px-4 py-2 sm:px-6">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden="true" />
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-amber-300/90">
            File d'alertes : {activeAlertCount} événement(s) CRITIQUE / ERREUR / AVERTISSEMENT actif(s)
          </span>
        </div>
      )}
    </section>
  )
}

/** CTA de la barre d'alarme — navigation vers l'onglet Alertes. */
function AlarmCta({ onClick }: { onClick?: () => void }) {
  return (
    <Button
      size="sm"
      onClick={onClick}
      className="h-8 shrink-0 gap-1.5 bg-red-500 font-mono text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-red-400"
    >
      Traiter maintenant
      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Button>
  )
}
