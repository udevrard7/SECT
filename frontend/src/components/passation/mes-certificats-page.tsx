'use client'

/**
 * MesCertificatsPage — Refonte UI/UX (Savane EdTech)
 *
 * Refonte complète de la page « Mes certificats » (module Étudiant) en
 * respectant strictement l'identité visuelle existante :
 *  - Hero canonique `ds-kente-pattern` avec negative margins (aligné sur
 *    mes-epreuves / mes-resultats / mes-devoirs)
 *  - KPI cards `border-l-4` + icon chip `h-9 w-9` (pattern mes-devoirs)
 *  - Tabs canoniques `grid grid-cols-3 sm:inline-flex` avec count badges
 *    `font-mono tabular-nums`
 *  - Cartes certificat repensées en « diplômes miniatures » :
 *      * accent `ds-kente-top` (signature SECT)
 *      * glow par tier (`ds-glow-bronze` / `silver` / `gold`) cohérent avec
 *        le système de gamification (BadgeCard / RewardCenter)
 *      * ProgressRing SVG (composant DS) pour la note /20
 *      * code de vérification en `font-mono`
 *      * actions en footer (Télécharger / Partager / Imprimer)
 *  - Timeline standardisée (border-l-4 cards + dot tier)
 *  - Tableau progression UE conservé et nettoyé
 *  - Tous les états (loading / error / empty) au standard (border-dashed,
 *    PulseSkeleton, icon chip h-20 w-20)
 *  - Toutes les couleurs via tokens oklch (jamais de hex brut) — compatible
 *    mode clair/sombre
 *
 * Sources de données inchangées :
 *  - GET /api/certificats (liste des certificats de l'étudiant)
 *  - GET /api/validations-ue (UEs en cours / validées / non validées)
 *  - GET /api/certificats/[id]/pdf?orientation=landscape|portrait (PDF)
 *
 * Aucun changement de comportement fonctionnel (téléchargement, partage,
 * impression, batch ZIP, filtres, recherche) — seule la présentation change.
 */

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Download, Award, Shield, FileText, CheckCircle2, XCircle, Clock,
  Loader2, ScrollText, AlertCircle, TrendingUp, Trophy, Medal,
  Share2, Printer, Search, FolderDown, RotateCw,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PulseSkeleton, ProgressRing } from '@/components/ds'
import { toast } from 'sonner'

// ─── Types ───

type CertificatType = 'STANDARD' | 'AVANCE' | 'EXPERT'

interface Certificat {
  id: string
  type: CertificatType
  ueCode: string
  ueNom: string
  note: number
  mention: string
  dateEmission: string
  verificationUrl?: string
  etudiantNom?: string
}

type StatutUE = 'EN_COURS' | 'VALIDEE' | 'NON_VALIDEE'

interface ValidationUE {
  id: string
  ueCode: string
  ueNom: string
  creditsECTS: number
  epreuvesCompletees: number
  epreuvesTotal: number
  note: number | null
  statut: StatutUE
  certificatId: string | null
}

// ─── Tier system (aligné sur la gamification BadgeCard / RewardCenter) ───
//
// STANDARD → bronze, AVANCE → silver, EXPERT → gold
// On réutilise les tokens --bronze/--silver/--gold et les classes
// ds-glow-{tier} pour une cohérence forte avec le système de badges.
type Tier = 'bronze' | 'silver' | 'gold'

const TYPE_TO_TIER: Record<CertificatType, Tier> = {
  STANDARD: 'bronze',
  AVANCE: 'silver',
  EXPERT: 'gold',
}

interface TypeMeta {
  label: string
  icon: typeof Trophy
  tier: Tier
  // classe de teinte pour les chips / badges (surfaces claires)
  chipBg: string
  chipText: string
  ringAccent: 'primary' | 'info' | 'warning'
}

const TYPE_META: Record<CertificatType, TypeMeta> = {
  EXPERT: {
    label: 'Expert',
    icon: Trophy,
    tier: 'gold',
    chipBg: 'bg-gold/15',
    chipText: 'text-gold',
    ringAccent: 'warning',
  },
  AVANCE: {
    label: 'Avancé',
    icon: Medal,
    tier: 'silver',
    chipBg: 'bg-info/15',
    chipText: 'text-info',
    ringAccent: 'info',
  },
  STANDARD: {
    label: 'Standard',
    icon: Award,
    tier: 'bronze',
    chipBg: 'bg-success/15',
    chipText: 'text-success-text',
    ringAccent: 'primary',
  },
}

const STATUT_META: Record<StatutUE, { label: string; icon: typeof Clock; cls: string }> = {
  EN_COURS: { label: 'En cours', icon: Clock, cls: 'bg-warning/15 text-warning' },
  VALIDEE: { label: 'Validée', icon: CheckCircle2, cls: 'bg-success/15 text-success-text' },
  NON_VALIDEE: { label: 'Non validée', icon: XCircle, cls: 'bg-destructive/15 text-destructive' },
}

// ─── Skeleton ───

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border/60 p-5 space-y-4 ds-kente-top">
      <div className="flex justify-between">
        <PulseSkeleton className="h-11 w-11" variant="card" />
        <PulseSkeleton className="h-5 w-16" variant="default" />
      </div>
      <PulseSkeleton className="h-4 w-3/4" />
      <PulseSkeleton className="h-8 w-20" />
      <PulseSkeleton className="h-2 w-full" />
      <PulseSkeleton className="h-8 w-full" />
    </div>
  )
}

// ─── Composant : carte certificat (diplôme miniature) ───

function CertificatCard({
  cert,
  index,
  user,
  orientation,
  downloading,
  onDownload,
  onShare,
  onPrint,
}: {
  cert: Certificat
  index: number
  user: { name: string } | null
  orientation: 'landscape' | 'portrait'
  downloading: boolean
  onDownload: (id: string) => void
  onShare: (cert: Certificat) => void
  onPrint: (id: string) => void
}) {
  const meta = TYPE_META[cert.type]
  const Icon = meta.icon
  const date = new Date(cert.dateEmission)
  const notePercent = Math.min(100, Math.round((cert.note / 20) * 100))

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ delay: index * 0.06, duration: 0.3, ease: 'easeOut' }}
    >
      <div
        className={`group relative overflow-hidden rounded-xl border border-border/60 bg-card p-5 shadow-sm ds-kente-top ds-glow-${meta.tier} hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 ds-lift`}
      >
        {/* En-tête : tier icon + badge */}
        <div className="flex items-start justify-between mb-4 mt-1">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-lg shadow-md"
            style={{ backgroundColor: `var(--${meta.tier})` }}
          >
            <Icon className="h-5 w-5 text-white" />
          </div>
          <Badge variant="outline" className={`${meta.chipBg} ${meta.chipText} border-${meta.tier}/30`}>
            {meta.label}
          </Badge>
        </div>

        {/* Miniature diplôme */}
        <div className="relative mb-4 overflow-hidden rounded-lg border-2 border-double border-gold/30 bg-gradient-to-br from-background to-muted/30 p-4">
          <div className="absolute inset-1.5 border border-gold/20 rounded pointer-events-none" />
          <div className="relative flex items-center gap-4">
            {/* ProgressRing (note /20) */}
            <div className="shrink-0">
              <ProgressRing
                value={notePercent}
                size={64}
                strokeWidth={6}
                accent={meta.ringAccent}
                label={`${cert.note.toFixed(1)}`}
                sublabel="/20"
                index={index}
              />
            </div>
            {/* Identité */}
            <div className="flex-1 min-w-0 text-center">
              <p className="text-[8px] uppercase tracking-[2px] text-muted-foreground/70 font-semibold">
                Certificat de réussite
              </p>
              <p className="text-[10px] font-semibold text-foreground/80 truncate mt-0.5">
                {cert.etudiantNom || user?.name || '—'}
              </p>
              {cert.mention && (
                <Badge variant="outline" className="mt-1 text-[8px] px-1.5 py-0 h-4 bg-gold/10 text-gold border-gold/30">
                  {cert.mention}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* UE */}
        <div className="mb-3">
          <p className="font-mono text-[11px] text-muted-foreground">{cert.ueCode}</p>
          <h3 className="font-semibold text-sm leading-snug font-display line-clamp-2">{cert.ueNom}</h3>
        </div>

        {/* Code vérification + date */}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-3">
          <span className="font-mono">{cert.verificationUrl?.split('/').pop() ?? '—'}</span>
          <span>{date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1.5">
          <Button
            size="sm"
            className="w-full gap-1.5 text-xs ds-press"
            onClick={() => onDownload(cert.id)}
            disabled={downloading}
          >
            {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Télécharger PDF ({orientation === 'landscape' ? 'Paysage' : 'Portrait'})
          </Button>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" className="flex-1 gap-1 text-xs ds-press" onClick={() => onShare(cert)}>
              <Share2 className="h-3 w-3" /> Partager
            </Button>
            <Button size="sm" variant="outline" className="flex-1 gap-1 text-xs ds-press" onClick={() => onPrint(cert.id)} disabled={downloading}>
              <Printer className="h-3 w-3" /> Imprimer
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Composant principal ───

export function MesCertificatsPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape')
  const [activeTab, setActiveTab] = useState('certificats')
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<CertificatType | 'all'>('all')
  const [isBatchDownloading, setIsBatchDownloading] = useState(false)

  // ─── Fetch (TanStack Query) ───
  // BUGFIX (QUERY-CACHE-2) : migration de useEffect+fetch vers TanStack Query.
  const dataQuery = useQuery<{ certificats: Certificat[]; validations: ValidationUE[] }>({
    queryKey: ['mes-certificats', user?.id],
    queryFn: async () => {
      // Re-synchronise les validations (calcul côté serveur) avant lecture
      await fetch('/api/validations-ue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).catch(() => {})

      const [certRes, valRes] = await Promise.all([
        fetch('/api/certificats'),
        fetch('/api/validations-ue'),
      ])

      let certs: Certificat[] = []
      if (certRes.ok) {
        const d = await certRes.json()
        const raw: Record<string, unknown>[] = Array.isArray(d) ? d : d.certificats ?? []
        const validTypes: CertificatType[] = ['STANDARD', 'AVANCE', 'EXPERT']
        certs = raw.filter((c) => c && typeof c === 'object').map((c) => {
          const type = validTypes.includes(c.type as CertificatType) ? (c.type as CertificatType) : 'STANDARD'
          const code = (c.codeVerification as string) || ''
          return {
            id: String(c.id ?? ''),
            type,
            ueCode: String(c.ueCode ?? '—'),
            ueNom: String(c.ueNom ?? '—'),
            note: typeof c.noteFinale === 'number' ? c.noteFinale : 0,
            mention: typeof c.mention === 'string' ? c.mention : '',
            dateEmission: c.dateEmission ? String(c.dateEmission) : new Date().toISOString(),
            verificationUrl: code ? `${window.location.origin}/verify/${code}` : undefined,
            etudiantNom: typeof c.etudiantNom === 'string' ? c.etudiantNom : (user?.name || ''),
          }
        })
      }

      let vals: ValidationUE[] = []
      if (valRes.ok) {
        const d = await valRes.json()
        const raw: Record<string, unknown>[] = Array.isArray(d) ? d : d.validations ?? []
        const validStatuts: StatutUE[] = ['EN_COURS', 'VALIDEE', 'NON_VALIDEE']
        vals = raw.filter((v) => v && typeof v === 'object').map((v) => {
          const ue = (v.uniteEnseignement as Record<string, unknown> | null) ?? null
          const certs = Array.isArray(v.certificats) ? (v.certificats as Record<string, unknown>[]) : []
          const statut = validStatuts.includes(v.statut as StatutUE) ? (v.statut as StatutUE) : 'EN_COURS'
          const nf = typeof v.noteFinale === 'number' ? v.noteFinale : null
          return {
            id: String(v.id ?? ''),
            ueCode: String(ue?.code ?? '—'),
            ueNom: String(ue?.nom ?? '—'),
            creditsECTS: typeof ue?.creditsECTS === 'number' ? ue.creditsECTS : 0,
            epreuvesCompletees: typeof v.nbEpreuvesCompletees === 'number' ? v.nbEpreuvesCompletees : 0,
            epreuvesTotal: typeof v.nbEpreuvesTotal === 'number' ? v.nbEpreuvesTotal : 0,
            note: statut === 'EN_COURS' ? null : nf,
            statut,
            certificatId: certs.length > 0 ? String(certs[0].id ?? '') : null,
          }
        })
      }

      return { certificats: certs, validations: vals }
    },
    enabled: !!user?.id,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const certificats = dataQuery.data?.certificats ?? []
  const validations = dataQuery.data?.validations ?? []
  const loading = dataQuery.isLoading
  const error = dataQuery.error ? 'Impossible de charger vos certificats.' : null
  const refreshData = () => queryClient.invalidateQueries({ queryKey: ['mes-certificats', user?.id] })

  // ─── Stats ───

  const stats = useMemo(() => ({
    total: certificats.length,
    expert: certificats.filter((c) => c.type === 'EXPERT').length,
    avance: certificats.filter((c) => c.type === 'AVANCE').length,
    standard: certificats.filter((c) => c.type === 'STANDARD').length,
  }), [certificats])

  // ─── Download / Share / Print / Batch (inchangés) ───

  const handleDownload = async (id: string) => {
    setDownloadingId(id)
    try {
      const res = await fetch(`/api/certificats/${id}/pdf?orientation=${orientation}`)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url)
      toast.success(`Certificat téléchargé (${orientation === 'landscape' ? 'Paysage' : 'Portrait'})`)
    } catch {
      toast.error('Échec du téléchargement')
    } finally {
      setDownloadingId(null)
    }
  }

  const handleShare = async (cert: Certificat) => {
    const url = cert.verificationUrl || `${window.location.origin}/verify/${cert.id}`
    if (navigator.share) {
      try {
        await navigator.share({ title: `Certificat SECT — ${cert.ueNom}`, text: `Mon certificat ${cert.ueCode} (${cert.note}/20)`, url })
        toast.success('Lien partagé')
      } catch {
        // Annulation utilisateur — pas de toast
      }
    } else {
      await navigator.clipboard.writeText(url)
      toast.success('Lien copié', { description: 'URL de vérification copiée dans le presse-papier.' })
    }
  }

  const handlePrint = async (id: string) => {
    setDownloadingId(id)
    try {
      const res = await fetch(`/api/certificats/${id}/pdf?orientation=${orientation}`)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const iframe = document.createElement('iframe')
      iframe.style.display = 'none'
      iframe.src = url
      document.body.appendChild(iframe)
      iframe.onload = () => {
        iframe.contentWindow?.print()
        setTimeout(() => { document.body.removeChild(iframe); URL.revokeObjectURL(url) }, 1000)
      }
      toast.success('Impression lancée')
    } catch {
      toast.error("Échec de l'impression")
    } finally {
      setDownloadingId(null)
    }
  }

  const filteredCertificats = useMemo(() => {
    return certificats.filter(c => {
      if (typeFilter !== 'all' && c.type !== typeFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        return c.ueCode.toLowerCase().includes(q) || c.ueNom.toLowerCase().includes(q) || c.mention?.toLowerCase().includes(q)
      }
      return true
    })
  }, [certificats, typeFilter, searchQuery])

  const handleBatchDownload = async () => {
    if (filteredCertificats.length === 0) return
    setIsBatchDownloading(true)
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()

      const downloads = await Promise.all(
        filteredCertificats.map(async (cert) => {
          const res = await fetch(`/api/certificats/${cert.id}/pdf?orientation=${orientation}`)
          if (!res.ok) throw new Error(`Échec certificat ${cert.ueCode}`)
          const blob = await res.blob()
          const name = `certificat_${cert.ueCode}_${cert.ueNom.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30)}.pdf`
          return { name, blob }
        })
      )

      downloads.forEach(({ name, blob }) => zip.file(name, blob))
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = `certificats_sect_${new Date().toISOString().slice(0, 10)}.zip`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Téléchargement groupé', { description: `${downloads.length} certificats dans le ZIP.` })
    } catch (err) {
      toast.error('Échec du téléchargement groupé', { description: err instanceof Error ? err.message : 'Réessayez.' })
    } finally {
      setIsBatchDownloading(false)
    }
  }

  // ─── Loading ───

  if (loading) {
    return (
      <div className="space-y-6">
        <PulseSkeleton className="h-24 w-full" variant="card" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <PulseSkeleton key={i} variant="card" className="h-24" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    )
  }

  // ─── Error ───

  if (error) {
    return (
      <Card className="border-l-4 border-l-destructive">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h3 className="mt-4 font-display text-lg font-semibold tracking-tight">Erreur de chargement</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" className="mt-4 gap-2 ds-press" onClick={refreshData}>
            <RotateCw className="h-4 w-4" /> Réessayer
          </Button>
        </CardContent>
      </Card>
    )
  }

  // ─── KPI cards ───

  const kpiCards = [
    { label: 'Total', value: stats.total, icon: ScrollText, accent: 'primary' as const, border: 'border-l-primary' },
    { label: 'Expert', value: stats.expert, icon: Trophy, accent: 'warning' as const, border: 'border-l-gold' },
    { label: 'Avancé', value: stats.avance, icon: Medal, accent: 'info' as const, border: 'border-l-info' },
    { label: 'Standard', value: stats.standard, icon: Award, accent: 'success' as const, border: 'border-l-success' },
  ]

  // ─── Render ───

  return (
    <div className="space-y-6">
      {/* ─── Hero canonique (ds-kente-pattern, aligné sur les autres pages étudiant) ─── */}
      <div className="ds-kente-pattern -mx-4 -mt-4 rounded-lg px-4 py-4 sm:-mx-6 sm:px-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold/15 ds-logo-glow">
            <ScrollText className="h-6 w-6 text-gold" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
              Mes Certificats
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Téléchargez, partagez et vérifiez vos certificats de réussite
            </p>
          </div>
        </div>

        {/* Stats inline (desktop) */}
        <div className="flex items-center gap-2">
          {([
            { n: stats.expert, label: 'Expert', icon: Trophy, color: 'text-gold' },
            { n: stats.avance, label: 'Avancé', icon: Medal, color: 'text-info' },
            { n: stats.standard, label: 'Standard', icon: Award, color: 'text-success-text' },
          ] as const).map((s, i) => (
            <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-card/60 border border-border/50 backdrop-blur-sm">
              <s.icon className={`h-3.5 w-3.5 ${s.color}`} />
              <span className="text-sm font-bold font-mono tabular-nums">{s.n}</span>
              <span className="text-[10px] text-muted-foreground hidden sm:inline">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── KPI cards (pattern mes-devoirs : border-l-4 + icon chip) ─── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {kpiCards.map((kpi, i) => {
          const KIcon = kpi.icon
          return (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.05, ease: 'easeOut' }}
            >
              <Card className={`border-l-4 ${kpi.border}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-${kpi.accent}/10`}>
                      <KIcon className={`h-4 w-4 text-${kpi.accent === 'success' ? 'success-text' : kpi.accent}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-mono text-2xl font-bold tabular-nums leading-none">{kpi.value}</p>
                      <p className="text-xs text-muted-foreground mt-1">{kpi.label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </div>

      {/* ─── Tabs canoniques + actions ─── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 sm:inline-flex sm:w-auto">
            <TabsTrigger value="certificats" className="gap-1.5">
              <Award className="h-4 w-4" />
              <span className="hidden sm:inline">Certificats</span>
              <span className="sm:hidden">Cert.</span>
              {stats.total > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 min-w-5 justify-center bg-primary/15 px-1 text-[10px] font-bold text-primary-text font-mono tabular-nums">
                  {stats.total}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="timeline" className="gap-1.5">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">Parcours</span>
              <span className="sm:hidden">Parc.</span>
            </TabsTrigger>
            <TabsTrigger value="progression" className="gap-1.5">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Progression UE</span>
              <span className="sm:hidden">UE</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Orientation toggle */}
          <div className="flex gap-1 bg-muted/50 rounded-lg p-0.5">
            <button
              onClick={() => setOrientation('landscape')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ds-press ${orientation === 'landscape' ? 'bg-background shadow-sm text-primary-text' : 'text-muted-foreground'}`}
            >📐 Paysage</button>
            <button
              onClick={() => setOrientation('portrait')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ds-press ${orientation === 'portrait' ? 'bg-background shadow-sm text-primary-text' : 'text-muted-foreground'}`}
            >📄 Portrait</button>
          </div>

          {/* Batch download */}
          {certificats.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs ds-press"
              onClick={handleBatchDownload}
              disabled={isBatchDownloading}
            >
              {isBatchDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderDown className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">Tout télécharger</span>
              <span className="sm:hidden">ZIP</span>
            </Button>
          )}
        </div>
      </div>

      {/* ─── Tab : Certificats ─── */}
      {activeTab === 'certificats' && (
        <>
          {/* Search & filter bar */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par UE, code ou mention…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <div className="flex gap-1.5">
              {(['all', 'STANDARD', 'AVANCE', 'EXPERT'] as const).map((t) => {
                const meta = t === 'all' ? null : TYPE_META[t]
                const isActive = typeFilter === t
                return (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(t)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ds-press ${
                      isActive
                        ? t === 'EXPERT' ? 'bg-gold/15 text-gold'
                        : t === 'AVANCE' ? 'bg-info/15 text-info'
                        : t === 'STANDARD' ? 'bg-success/15 text-success-text'
                        : 'bg-muted text-foreground'
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {t === 'all' ? 'Tous' : meta!.label}
                  </button>
                )
              })}
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            <AnimatePresence mode="popLayout">
              {certificats.length === 0 ? (
                <div className="col-span-full flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
                    <ScrollText className="h-10 w-10 text-success-text" />
                  </div>
                  <h3 className="mt-4 font-display text-lg font-semibold tracking-tight">Aucun certificat</h3>
                  <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                    Vos certificats apparaîtront ici une fois vos épreuves validées par vos enseignants.
                  </p>
                </div>
              ) : filteredCertificats.length === 0 ? (
                <div className="col-span-full flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                    <Search className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <h3 className="mt-4 font-display text-lg font-semibold tracking-tight">Aucun résultat</h3>
                  <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                    Aucun certificat ne correspond à vos filtres.
                  </p>
                  <Button variant="outline" size="sm" className="mt-4 gap-2 ds-press" onClick={() => { setSearchQuery(''); setTypeFilter('all') }}>
                    <RotateCw className="h-4 w-4" /> Réinitialiser les filtres
                  </Button>
                </div>
              ) : (
                filteredCertificats.map((cert, i) => (
                  <CertificatCard
                    key={cert.id}
                    cert={cert}
                    index={i}
                    user={user}
                    orientation={orientation}
                    downloading={downloadingId === cert.id}
                    onDownload={handleDownload}
                    onShare={handleShare}
                    onPrint={handlePrint}
                  />
                ))
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}

      {/* ─── Tab : Parcours (timeline) ─── */}
      {activeTab === 'timeline' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
          {certificats.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
                <TrendingUp className="h-10 w-10 text-success-text" />
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold tracking-tight">Aucun parcours</h3>
              <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                Votre parcours apparaîtra ici après vos premières certifications.
              </p>
            </div>
          ) : (
            <div className="relative">
              {/* Ligne verticale */}
              <div className="absolute left-6 top-0 bottom-0 w-px bg-gradient-to-b from-primary via-gold to-transparent" />
              <div className="space-y-4 pl-14">
                {[...certificats]
                  .sort((a, b) => new Date(a.dateEmission).getTime() - new Date(b.dateEmission).getTime())
                  .map((cert, i) => {
                    const meta = TYPE_META[cert.type]
                    const Icon = meta.icon
                    const date = new Date(cert.dateEmission)
                    return (
                      <motion.div
                        key={cert.id}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.06, duration: 0.3 }}
                        className="relative"
                      >
                        {/* Dot sur la timeline */}
                        <div
                          className="absolute -left-11 top-1.5 h-4 w-4 rounded-full border-2 border-background shadow-sm"
                          style={{ backgroundColor: `var(--${meta.tier})` }}
                        >
                          <div className="absolute inset-0 rounded-full animate-ping opacity-30 bg-current" style={{ animationDuration: '3s' }} />
                        </div>
                        {/* Card border-l-4 */}
                        <Card
                          className="border-l-4 hover:shadow-md transition-shadow ds-lift"
                          style={{ borderLeftColor: `var(--${meta.tier})` }}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
                                  style={{ backgroundColor: `var(--${meta.tier})` }}
                                >
                                  <Icon className="h-4 w-4 text-white" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold truncate">{cert.ueNom}</p>
                                  <p className="text-xs text-muted-foreground font-mono">{cert.ueCode} · {meta.label}</p>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className={`text-lg font-bold font-mono tabular-nums ${cert.note >= 14 ? 'text-success-text' : cert.note >= 10 ? 'text-warning' : 'text-destructive'}`}>
                                  {cert.note.toFixed(1)}<span className="text-xs text-muted-foreground">/20</span>
                                </p>
                                {cert.mention && <p className="text-[10px] text-muted-foreground">{cert.mention}</p>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">
                                {date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                              </span>
                              <div className="flex-1" />
                              <Button variant="ghost" size="sm" className="h-6 text-xs ds-press" onClick={() => handleDownload(cert.id)} disabled={downloadingId === cert.id}>
                                <Download className="h-3 w-3 mr-1" />PDF
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    )
                  })}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* ─── Tab : Progression UE ─── */}
      {activeTab === 'progression' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
          {validations.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
                <TrendingUp className="h-10 w-10 text-success-text" />
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold tracking-tight">Aucune progression</h3>
              <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                Vos résultats apparaîtront ici après vos premières évaluations.
              </p>
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto scrollbar-thin">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        {['Code UE', 'Nom', 'ECTS', 'Épreuves', 'Note', 'Statut', 'PDF'].map((h) => (
                          <th key={h} className="text-center p-3 font-display font-medium text-muted-foreground first:text-left">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {validations.map((val, i) => {
                        const sm = STATUT_META[val.statut]
                        const SIcon = sm.icon
                        return (
                          <motion.tr
                            key={val.id}
                            className="border-b last:border-0 hover:bg-muted/20 transition-colors"
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.03 }}
                          >
                            <td className="p-3 font-mono text-xs text-left">{val.ueCode}</td>
                            <td className="p-3 font-medium text-left">{val.ueNom}</td>
                            <td className="p-3 text-center font-mono tabular-nums">{val.creditsECTS}</td>
                            <td className="p-3 text-center text-muted-foreground font-mono tabular-nums">{val.epreuvesCompletees}/{val.epreuvesTotal}</td>
                            <td className="p-3 text-center font-semibold font-mono tabular-nums">
                              {val.note !== null ? (
                                <span className={val.note >= 16 ? 'text-gold' : val.note >= 10 ? 'text-success-text' : 'text-destructive'}>
                                  {val.note.toFixed(1)}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="p-3 text-center">
                              <Badge variant="secondary" className={`gap-1 ${sm.cls}`}>
                                <SIcon className="h-3 w-3" /> {sm.label}
                              </Badge>
                            </td>
                            <td className="p-3 text-center">
                              {val.certificatId ? (
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 ds-press" onClick={() => handleDownload(val.certificatId!)} disabled={downloadingId === val.certificatId}>
                                  {downloadingId === val.certificatId
                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin text-success-text" />
                                    : <Download className="h-3.5 w-3.5 text-success-text" />}
                                </Button>
                              ) : '—'}
                            </td>
                          </motion.tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </motion.div>
      )}

      {/* ─── Note pédagogique (footer) ─── */}
      {certificats.length > 0 && (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Shield className="h-3.5 w-3.5 text-success-text" />
          <span>
            Chaque certificat possède un code de vérification unique. Téléchargez en paysage pour un rendu diplôme, en portrait pour un archivage standard.
          </span>
        </div>
      )}
    </div>
  )
}
