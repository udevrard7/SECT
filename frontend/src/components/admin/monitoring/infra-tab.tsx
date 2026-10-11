'use client'

// infra-tab.tsx — SECT-INFRA-MONITOR-1 (11/10) : onglet « Infrastructure »
// de la console super admin (/monitoring).
//
// AVANT : le module P5 (ADR-0012) regardait l'APPLICATION — requêtes,
// score, workers. L'infrastructure décisionnelle de l'option C (ADR-0013)
// — réplique 5433, backups chiffrés, VM, DR voie D, CU Neon — n'était
// visible NULLE PART dans le produit (seulement dans les ops hors prod).
// APRÈS : six panneaux console, alimentés par GET /api/monitoring/infra.
//
// DISCIPLINE CU (§13.3, leçon de la sonde) — inscrite dans l'UI :
//   • tout est mesuré LOCALEMENT (réplique 5433, /proc, staging backup) ;
//   • Neon = control plane seul (optionnel, cache 5 min) ;
//   • la sonde primaire est un BOUTON (un ping par clic, jamais auto).
//
// Style : console d'observabilité du module (mono uppercase, Cards,
// badges chip) — cohérent avec system-tab.tsx.

import { useState } from 'react'
import {
  Activity,
  Database,
  DatabaseBackup,
  Gauge,
  HardDrive,
  Info,
  MemoryStick,
  Radar,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import type { InfraData } from './types'
import { formatUptimeLong } from './utils'
import { probePrimaryNeon, useInfraStatus } from './use-monitoring'

function bytesToGB(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(1)
}

function minutesLabel(min: number | null | undefined): string {
  if (min == null) return '—'
  if (min < 1) return '< 1 min'
  if (min < 90) return `${Math.round(min)} min`
  return `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')}`
}

function hoursLabel(h: number | null | undefined): string {
  if (h == null) return '—'
  return `${Math.round(h)} h`
}

function pctTone(pct: number, warnBelow: number): string {
  if (pct < warnBelow) return 'text-destructive'
  if (pct < warnBelow * 1.5) return 'text-warning'
  return 'text-success-text dark:text-success-text/80'
}

/** Barre d'usage (disque/mémoire) — fine, couleur selon marge. */
function UsageBar({ label, freePct, warnBelow }: { label: string; freePct: number; warnBelow: number }) {
  const usedPct = Math.max(0, Math.min(100, 100 - freePct))
  const barTone =
    freePct < warnBelow ? 'bg-destructive' : freePct < warnBelow * 1.5 ? 'bg-warning' : 'bg-success'
  return (
    <div>
      <div className="flex items-baseline justify-between font-mono text-[11px]">
        <span className="text-muted-foreground uppercase tracking-[0.08em]">{label}</span>
        <span className="tabular-nums">
          <span className={pctTone(freePct, warnBelow)}>{freePct.toFixed(1)} %</span>
          <span className="text-muted-foreground"> libre</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${label} : ${usedPct.toFixed(0)} % utilisé`}>
        <div className={`h-full rounded-full ${barTone}`} style={{ width: `${usedPct}%` }} />
      </div>
    </div>
  )
}

function KV({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 font-mono text-[11px]">
      <span className="shrink-0 text-muted-foreground uppercase tracking-[0.06em]">{k}</span>
      <span className={`truncate text-right tabular-nums ${tone ?? ''}`}>{v}</span>
    </div>
  )
}

function PanelShell({
  icon,
  title,
  badge,
  children,
}: {
  icon: React.ReactNode
  title: string
  badge?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-mono text-[12px] font-semibold uppercase tracking-[0.08em]">
          {icon}
          {title}
          {badge}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">{children}</CardContent>
    </Card>
  )
}

export function InfraTab({ autoRefresh }: { autoRefresh: boolean }) {
  const infraQuery = useInfraStatus(autoRefresh)
  const data = infraQuery.data ?? null
  const [probing, setProbing] = useState(false)

  const handleProbePrimary = async () => {
    setProbing(true)
    try {
      const probe = await probePrimaryNeon()
      if (probe.up) {
        toast.success(`Primaire Neon joignable — ${probe.latencyMs} ms`, {
          description: 'Un ping data volontaire : le compute est désormais éveillé (il se rendormira selon la grille).',
        })
      } else {
        toast.error('Primaire Neon injoignable', {
          description: probe.err ?? 'Vérifier /api/health/db et le status Neon avant toute décision DR (runbook §3.8-B).',
        })
      }
      await infraQuery.refetch()
    } catch {
      toast.error('Échec de la sonde primaire', { description: 'L’endpoint /api/monitoring/infra?probe=primary a refusé la requête.' })
    } finally {
      setProbing(false)
    }
  }

  if (infraQuery.isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-3">
              <div className="h-4 w-40 rounded bg-muted" />
            </CardHeader>
            <CardContent className="space-y-2">
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j} className="h-3 rounded bg-muted" style={{ opacity: 1 - j * 0.15 }} />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (infraQuery.isError || !data) {
    return (
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.08em] text-destructive">
            <TriangleAlert className="h-4 w-4" aria-hidden="true" />
            Infrastructure indisponible
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            L&apos;endpoint <code className="rounded bg-muted px-1 font-mono text-xs">GET /api/monitoring/infra</code> n&apos;a pas
            répondu (403 = rôle non ADMIN). Les mesures d&apos;infrastructure étant LOCALES, cet échec ne consomme aucune CU Neon.
          </p>
          <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={() => void infraQuery.refetch()}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Réessayer
          </Button>
        </CardContent>
      </Card>
    )
  }

  const r = data.replica
  const b = data.backups
  const n = data.neon
  const drTone =
    data.dr.voieD === 'PRETE'
      ? 'bg-success/10 text-success-text border-success/40'
      : data.dr.voieD === 'PARTIELLE'
        ? 'bg-warning/10 text-warning border-warning/40'
        : 'bg-destructive/10 text-destructive border-destructive/40'

  return (
    <div className="space-y-4">
      {/* Bandeau DR voie D — la décision qui justifie toute l'architecture */}
      <Card className={data.dr.voieD === 'PRETE' ? 'border-success/40' : 'border-warning/40'}>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="flex items-center gap-3">
            <ShieldCheck
              className={`h-5 w-5 shrink-0 ${data.dr.voieD === 'PRETE' ? 'text-success-text' : 'text-warning'}`}
              aria-hidden="true"
            />
            <div>
              <div className="flex items-center gap-2 font-mono text-[12px] font-semibold uppercase tracking-[0.08em]">
                Reprise DR — voie D (réplique pré-positionnée)
                <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${drTone}`}>{data.dr.voieD}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{data.dr.detail}</p>
            </div>
          </div>
          {r && (
            <div className="text-right font-mono text-[11px] text-muted-foreground">
              RPO vécu&nbsp;
              <span
                className={`font-bold tabular-nums ${
                  r.dataFreshnessMin != null && r.dataFreshnessMin > 45 ? 'text-destructive' : 'text-success-text'
                }`}
              >
                {minutesLabel(r.dataFreshnessMin)}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {/* ── Neon (primaire, control plane) ── */}
        <PanelShell
          icon={<Database className="h-4 w-4 text-primary" aria-hidden="true" />}
          title="Neon — primaire (control plane)"
          badge={
            n ? (
              n.endpointState === 'idle' ? (
                <Badge className="border-success/40 bg-success/10 text-[10px] text-success-text">DORT</Badge>
              ) : n.endpointState === 'active' ? (
                <Badge className="border-warning/40 bg-warning/10 text-[10px] text-warning">ÉVEILLÉ</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">?</Badge>
              )
            ) : (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">NON CONFIGURÉ</Badge>
            )
          }
        >
          {n && n.configured ? (
            <>
              <KV k="Endpoint" v={n.endpointState === 'idle' ? 'idle (grille M1 respectée)' : n.endpointState || '—'} />
              <KV k="Compute 24 h" v={`${(n.compute24hS / 3600).toFixed(2)} CU-h`} />
              <KV k="Cycle (1ᵉʳ du mois)" v={`${(n.cycleComputeS / 3600).toFixed(1)} / ${n.quotaCUS} CU-h`} />
              <Separator />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Mesuré via l&apos;API console (control plane) — <strong>ne réveille jamais le compute</strong>. Seuil de
                ré-examen&nbsp;: 3,5 CU/j soutenu (ADR-0013 §13.6).{' '}
                {n.err && <span className="text-warning">Avertissement API : {n.err}</span>}
              </p>
            </>
          ) : (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Clés <code className="rounded bg-muted px-1 font-mono">NEON_API_KEY</code> +{' '}
              <code className="rounded bg-muted px-1 font-mono">NEON_PROJECT_ID</code> absentes du{' '}
              <code className="rounded bg-muted px-1 font-mono">.env</code> — section en dégradation affichée
              (jamais silencieuse). La mesure locale (réplique, backups, VM) reste complète sans ces clés.
            </p>
          )}
          <Separator />
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">Sonder le primaire (1 ping, l&apos;éveille)</p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 font-mono text-[10px] uppercase"
              disabled={probing}
              onClick={() => void handleProbePrimary()}
            >
              <Radar className="h-3 w-3" aria-hidden="true" />
              {probing ? 'sondage…' : 'sonder'}
            </Button>
          </div>
          {data.primary && (
            <KV
              k="Dernière sonde"
              v={data.primary.up ? `UP · ${data.primary.latencyMs} ms` : `DOWN`}
              tone={data.primary.up ? 'text-success-text' : 'text-destructive'}
            />
          )}
        </PanelShell>

        {/* ── Réplique locale (voie D) ── */}
        <PanelShell
          icon={<ServerCog className="h-4 w-4 text-primary" aria-hidden="true" />}
          title="Réplique locale — sect_replica (5433)"
          badge={
            r ? (
              r.up ? (
                <Badge className="border-success/40 bg-success/10 text-[10px] text-success-text">UP</Badge>
              ) : (
                <Badge className="border-destructive/40 bg-destructive/10 text-[10px] text-destructive">DOWN</Badge>
              )
            ) : (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">OFF</Badge>
            )
          }
        >
          {r ? (
            <>
              <KV
                k="RPO vécu (données)"
                v={minutesLabel(r.dataFreshnessMin)}
                tone={r.dataFreshnessMin != null && r.dataFreshnessMin > 45 ? 'text-destructive' : undefined}
              />
              <KV k="Dernier WAL appliqué" v={minutesLabel(r.lastApplyMin)} />
              <KV k="Workers actifs" v={`${r.activeWorkers} (fenêtre grille : 2)`} />
              <KV k="Tables applicatives" v={`${r.tablesApp} / 84`} />
              <KV k="Taille base" v={`${r.dbSizeMB} Mo`} />
              {r.err && <p className="text-[11px] text-destructive">{r.err}</p>}
              <Separator />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Lectures analytiques en service : <span className="font-semibold">{data.readSource === 'replica' ? 'OUI — 0 CU consommé' : 'repli primaire'}</span>.
                Règle système&nbsp;: fraîcheur ≥ 90 min = alerte (3 fenêtres grille manquées).
              </p>
            </>
          ) : (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              <code className="rounded bg-muted px-1 font-mono">REPLICA_DATABASE_URL</code> vide sur cette instance —
              standby API-only (Render) ou réplique non configurée. Les métriques correspondantes sont
              INDISPONIBLES, jamais à zéro.
            </p>
          )}
        </PanelShell>

        {/* ── Backups chiffrés (voie B) ── */}
        <PanelShell
          icon={<DatabaseBackup className="h-4 w-4 text-primary" aria-hidden="true" />}
          title="Backups chiffrés — voie B"
          badge={
            b ? (
              b.ageH != null && b.ageH < 36 ? (
                <Badge className="border-success/40 bg-success/10 text-[10px] text-success-text">FRAIS</Badge>
              ) : (
                <Badge className="border-destructive/40 bg-destructive/10 text-[10px] text-destructive">PÉRIMÉ</Badge>
              )
            ) : (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">ILLISIBLE</Badge>
            )
          }
        >
          {b ? (
            <>
              <KV
                k="Dernier backup (last_success)"
                v={hoursLabel(b.ageH)}
                tone={b.ageH != null && b.ageH >= 36 ? 'text-destructive' : undefined}
              />
              <KV k="Horodaté" v={b.lastSuccessAt ? new Date(b.lastSuccessAt).toLocaleString('fr-FR') : '—'} />
              <KV k="Test de restauration" v={b.lastRestoreTest ? `marker ${b.lastRestoreTest} ✓` : 'aucun marker'} />
              {b.err && <p className="text-[11px] text-warning">{b.err}</p>}
              <Separator />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Pipeline age → Object Storage OCI (nightly 03:32, rétention 30 j + 12 mensuels). Seuil alerte 36 h —
                aligné sur le watchdog §5-3. La clé physique (escrow) reste requise pour tout restore.
              </p>
            </>
          ) : (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Staging <code className="rounded bg-muted px-1 font-mono">/state/backup</code> non monté — le montage
              compose (SECT-INFRA-MONITOR-1) n&apos;est pas appliqué sur cette instance.
            </p>
          )}
        </PanelShell>

        {/* ── VM hôte ── */}
        <PanelShell icon={<HardDrive className="h-4 w-4 text-primary" aria-hidden="true" />} title="VM OCI — hôte">
          <KV k="Uptime" v={formatUptimeLong(data.vm.uptimeS)} />
          <KV k="Charge (1/5/15)" v={`${data.vm.load1.toFixed(2)} / ${data.vm.load5.toFixed(2)} / ${data.vm.load15.toFixed(2)}`} />
          <KV k="CPU vus" v={`${data.vm.cpus}`} />
          <div className="space-y-2.5 pt-1">
            <UsageBar label="Disque" freePct={data.vm.diskFreePct} warnBelow={15} />
            <UsageBar label="Mémoire" freePct={data.vm.memFreePct} warnBelow={10} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {bytesToGB(data.vm.diskFreeBytes)} Go libres / {bytesToGB(data.vm.diskTotalBytes)} Go ·{' '}
            {bytesToGB(data.vm.memFreeBytes)} Go RAM disponibles / {bytesToGB(data.vm.memTotalBytes)} Go
          </p>
          <Separator />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Le maillon fragile (ADR-0013 §3) : un disque plein tuerait API + réplique + DR simultanément — règle
            système à 15&nbsp;%.
          </p>
        </PanelShell>

        {/* ── API (cette instance) ── */}
        <PanelShell icon={<Activity className="h-4 w-4 text-primary" aria-hidden="true" />} title="API — instance interrogée">
          <KV k="Uptime process" v={formatUptimeLong(data.api.uptimeS)} />
          <KV k="Goroutines" v={`${data.api.goroutines}`} />
          <KV k="Heap Go" v={`${data.api.heapMB.toFixed(1)} Mo`} />
          <KV k="CPU (runtime)" v={`${data.api.numCPU}`} />
          <Separator />
          <KV k="Source de lecture" v={data.readSource} tone="text-primary" />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Mesuré à {new Date(data.generatedAt).toLocaleTimeString('fr-FR')} — sur l&apos;instance qui répond (VM
            primaire en nominal, Render en bascule P2).
          </p>
        </PanelShell>

        {/* ── Discipline CU (pédagogie permanente) ── */}
        <PanelShell icon={<Gauge className="h-4 w-4 text-primary" aria-hidden="true" />} title="Discipline CU (§13.3)">
          <div className="space-y-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
            <p className="flex gap-2">
              <span className="text-success-text">✓</span>
              Tous les panneaux ci-dessus sont mesurés <strong>localement</strong> (réplique 5433, /proc, staging) —
              0 CU consommé.
            </p>
            <p className="flex gap-2">
              <span className="text-success-text">✓</span>
              Neon via <strong>control plane uniquement</strong> (API console, cache 5 min) — ne réveille pas le
              compute.
            </p>
            <p className="flex gap-2">
              <span className="text-warning">⚠</span>
              La sonde primaire est <strong>volontaire</strong> (bouton) : chaque ping data réveille le compute pour
              ~5 min — le quota 100 CU-h/cycle n&apos;est pas inépuisable.
            </p>
            <p className="flex gap-2">
              <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              Règles système 000136 : replica-fraicheur (90 min), backup-fraicheur (36 h), disque-libre (15 %) —
              évaluées par l&apos;AlertingWorker toutes les 2 min, alertes Discord.
            </p>
          </div>
        </PanelShell>
      </div>
    </div>
  )
}
