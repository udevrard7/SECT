'use client'

/**
 * MesCertificatsPage — Version propre et simplifiée
 *
 * Un seul système de génération PDF : @react-pdf/renderer (serveur)
 * - Texte vectoriel (sélectionnable, net à l'impression)
 * - Polices bundled (Great Vibes, Playfair Display, Inter)
 * - Paysage + Portrait via toggle
 * - Chargement rapide (skeleton, Promise.all)
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Download, Award, Shield, FileText, CheckCircle2, XCircle, Clock,
  Loader2, ScrollText, AlertCircle, TrendingUp, Trophy, Medal,
  Share2, Printer, Search, Copy, ChevronDown, Sparkles, Filter,
  FolderDown,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PulseSkeleton } from '@/components/ds'
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

// ─── Config ───

const TYPE_META: Record<CertificatType, {
  label: string
  icon: typeof Trophy
  ring: string
  text: string
  badge: string
  bar: string
}> = {
  EXPERT: {
    label: 'Expert', icon: Trophy,
    ring: 'ring-warning/40', text: 'text-warning',
    badge: 'bg-warning/15 text-warning border-warning/30',
    bar: 'from-warning to-orange-500',
  },
  AVANCE: {
    label: 'Avancé', icon: Medal,
    ring: 'ring-info/40', text: 'text-info',
    badge: 'bg-info/15 text-info border-info/30',
    bar: 'from-info to-indigo-500',
  },
  STANDARD: {
    label: 'Standard', icon: Award,
    ring: 'ring-success/40', text: 'text-success',
    badge: 'bg-success/15 text-success border-success/30',
    bar: 'from-success to-teal-500',
  },
}

const STATUT_META: Record<StatutUE, { label: string; icon: typeof Clock; cls: string }> = {
  EN_COURS: { label: 'En cours', icon: Clock, cls: 'bg-warning/15 text-warning' },
  VALIDEE: { label: 'Validée', icon: CheckCircle2, cls: 'bg-success/15 text-success' },
  NON_VALIDEE: { label: 'Non validée', icon: XCircle, cls: 'bg-destructive/15 text-destructive' },
}

// ─── Skeleton ───

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border/40 p-5 space-y-4">
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

// ─── Component ───

export function MesCertificatsPage() {
  const { user } = useAuthStore()
  const [certificats, setCertificats] = useState<Certificat[]>([])
  const [validations, setValidations] = useState<ValidationUE[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape')
  const [activeTab, setActiveTab] = useState('certificats')
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<CertificatType | 'all'>('all')
  const [expandedCard, setExpandedCard] = useState<string | null>(null)
  const [previewHoverId, setPreviewHoverId] = useState<string | null>(null)

  const [isBatchDownloading, setIsBatchDownloading] = useState(false)

  // ─── Fetch ───

  const fetchData = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    setError(null)
    try {
      await fetch('/api/validations-ue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }).catch(() => {})

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

      setCertificats(certs)
      setValidations(vals)
    } catch {
      setError('Impossible de charger vos certificats.')
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => { fetchData() }, [fetchData])

  // ─── Stats ───

  const stats = {
    total: certificats.length,
    expert: certificats.filter((c) => c.type === 'EXPERT').length,
    avance: certificats.filter((c) => c.type === 'AVANCE').length,
    standard: certificats.filter((c) => c.type === 'STANDARD').length,
  }

  // ─── Download (react-pdf serveur — seul système) ───

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

  // ─── Share ───

  const handleShare = async (cert: Certificat) => {
    const url = cert.verificationUrl || `${window.location.origin}/verify/${cert.id}`
    if (navigator.share) {
      try {
        await navigator.share({ title: `Certificat SECT — ${cert.ueNom}`, text: `Mon certificat ${cert.ueCode} (${cert.note}/20)`, url })
        toast.success('Lien partagé')
      } catch {
        // User cancelled — no toast needed
      }
    } else {
      await navigator.clipboard.writeText(url)
      toast.success('Lien copié', { description: 'URL de vérification copiée dans le presse-papier.' })
    }
  }

  // ─── Print ───

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

  // ─── Batch download all certificates as ZIP ───

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

  // ─── Filtered certificates ───

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

  // ─── Loading ───

  if (loading) {
    return (
      <div className="space-y-6">
        <PulseSkeleton className="h-24 w-full" variant="card" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    )
  }

  // ─── Error ───

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-lg font-display font-semibold">{error}</p>
        <Button variant="outline" onClick={fetchData} className="gap-2">
          <Clock className="h-4 w-4" /> Réessayer
        </Button>
      </div>
    )
  }

  // ─── Render ───

  return (
    <div className="space-y-5">
      {/* ─── Hero compact ─── */}
      <div className="ds-kente-pattern relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 p-5 sm:p-6 text-white shadow-lg">
        <div className="absolute top-0 right-0 h-40 w-40 rounded-full bg-white/10 blur-3xl translate-x-1/3 -translate-y-1/3" />
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20">
              <ScrollText className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-display font-bold tracking-tight">Mes Certificats</h1>
              <p className="text-xs text-white/80">Téléchargez et vérifiez vos certificats de réussite</p>
            </div>
          </div>
          {/* Inline stats */}
          <div className="flex items-center gap-3">
            {([
              { n: stats.expert, label: 'Expert', icon: Trophy, color: 'text-warning' },
              { n: stats.avance, label: 'Avancé', icon: Medal, color: 'text-info' },
              { n: stats.standard, label: 'Standard', icon: Award, color: 'text-success' },
            ] as const).map((s, i) => (
              <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10">
                <s.icon className={`h-3.5 w-3.5 ${s.color}`} />
                <span className="text-sm font-bold font-mono tabular-nums">{s.n}</span>
                <span className="text-[10px] text-white/80 hidden sm:inline">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Global orientation toggle + Tabs ─── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="certificats" className="gap-1.5 text-xs">
              <Award className="h-3.5 w-3.5" /> Certificats
              {stats.total > 0 && <span className="ml-1 px-1.5 rounded-full bg-primary/15 text-[10px] font-bold font-mono tabular-nums">{stats.total}</span>}
            </TabsTrigger>
            <TabsTrigger value="timeline" className="gap-1.5 text-xs">
              <TrendingUp className="h-3.5 w-3.5" /> Parcours
            </TabsTrigger>
            <TabsTrigger value="progression" className="gap-1.5 text-xs">
              <FileText className="h-3.5 w-3.5" /> Progression UE
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex gap-1 bg-muted/50 rounded-lg p-0.5">
          <button
            onClick={() => setOrientation('landscape')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${orientation === 'landscape' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground'}`}
          >📐 Paysage</button>
          <button
            onClick={() => setOrientation('portrait')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${orientation === 'portrait' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground'}`}
          >📄 Portrait</button>
        </div>

        {/* Batch download */}
        {certificats.length > 1 && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={handleBatchDownload}
            disabled={isBatchDownloading}
          >
            {isBatchDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderDown className="h-3.5 w-3.5" />}
            Tout télécharger ({orientation === 'landscape' ? 'Paysage' : 'Portrait'})
          </Button>
        )}
      </div>

      {/* ─── Certificats tab ─── */}
      {activeTab === 'certificats' && (
        <>
          {/* Search & filter bar */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par UE, code ou mention..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <div className="flex gap-1.5">
              {(['all', 'STANDARD', 'AVANCE', 'EXPERT'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    typeFilter === t
                      ? t === 'EXPERT' ? 'bg-warning/15 text-warning'
                      : t === 'AVANCE' ? 'bg-info/15 text-info'
                      : t === 'STANDARD' ? 'bg-success/15 text-success'
                      : 'bg-muted text-foreground'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {t === 'all' ? 'Tous' : TYPE_META[t].label}
                </button>
              ))}
            </div>
          </div>

        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          <AnimatePresence mode="popLayout">
            {certificats.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center py-16">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mb-3">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-lg font-display font-semibold">Aucun certificat</p>
                <p className="text-sm text-muted-foreground text-center max-w-sm mt-1">
                  Vos certificats apparaîtront ici une fois vos épreuves validées.
                </p>
              </div>
            ) : filteredCertificats.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center py-16">
                <Search className="h-10 w-10 text-muted-foreground" />
                <p className="text-lg font-display font-semibold mt-4">Aucun résultat</p>
                <p className="text-sm text-muted-foreground mt-1">Essayez d&apos;autres filtres.</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => { setSearchQuery(''); setTypeFilter('all') }}>
                  Réinitialiser les filtres
                </Button>
              </div>
            ) : (
              filteredCertificats.map((cert, i) => {
                const meta = TYPE_META[cert.type]
                const Icon = meta.icon
                return (
                  <motion.div
                    key={cert.id}
                    layout
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ delay: i * 0.04, duration: 0.3 }}
                  >
                    <div className={`group relative overflow-hidden rounded-xl border border-border/50 bg-card p-5 ring-1 ${meta.ring} hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 ds-lift`}>
                      {/* Top accent bar */}
                      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${meta.bar}`} />

                      {/* Header */}
                      <div className="flex items-start justify-between mb-4 mt-1">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${meta.bar} shadow-md`}>
                          <Icon className="h-5 w-5 text-white" />
                        </div>
                        <Badge variant="outline" className={meta.badge}>{meta.label}</Badge>
                      </div>

                      {/* Miniature aperçu certificat */}
                      <div
                        className="relative mb-3 cursor-pointer overflow-hidden rounded-lg border-2 border-double bg-gradient-to-br from-white to-muted/30 dark:from-card dark:to-muted/10 p-3 transition-all hover:scale-[1.02]"
                        onMouseEnter={() => setPreviewHoverId(cert.id)}
                        onMouseLeave={() => setPreviewHoverId(null)}
                      >
                        {/* Mini border effect */}
                        <div className="absolute inset-1 border border-gold/20 rounded" />
                        <div className="relative text-center space-y-1">
                          <p className="text-[8px] uppercase tracking-[2px] text-warning/60 font-semibold">Certificat de réussite</p>
                          <p className="text-[9px] font-bold text-muted-foreground/80 truncate">{cert.etudiantNom || user?.name || '—'}</p>
                          <p className="text-[10px] font-bold text-foreground/90 font-mono">{cert.ueCode}</p>
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-xs font-black text-foreground font-mono tabular-nums">{cert.note.toFixed(1)}</span>
                            <span className="text-[8px] text-muted-foreground">/20</span>
                          </div>
                          <div className="h-1 rounded-full bg-muted mx-2 overflow-hidden">
                            <div className={`h-full rounded-full bg-gradient-to-r ${meta.bar}`} style={{ width: `${(cert.note / 20) * 100}%` }} />
                          </div>
                          {cert.mention && (
                            <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 bg-warning/10 text-warning">{cert.mention}</Badge>
                          )}
                        </div>
                        {/* QR code miniature */}
                        <div className="absolute bottom-1.5 right-1.5 h-5 w-5 rounded border border-muted-foreground/10 overflow-hidden">
                          <div className="grid grid-cols-2 h-full w-full gap-px">
                            <div className="bg-foreground/40" /><div className="bg-foreground/20" />
                            <div className="bg-foreground/10" /><div className="bg-foreground/40" />
                          </div>
                        </div>
                      </div>

                      {/* UE */}
                      <div className="mb-3">
                        <p className="font-mono text-[11px] text-muted-foreground">{cert.ueCode}</p>
                        <h3 className="font-semibold text-sm leading-snug font-display">{cert.ueNom}</h3>
                      </div>

                      {/* Note */}
                      <div className="flex items-baseline justify-between mb-2">
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-bold font-mono tabular-nums">{cert.note.toFixed(2).replace(/[.,]00$/, '')}</span>
                          <span className="text-xs text-muted-foreground">/20</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{cert.mention}</span>
                      </div>

                      {/* Progress bar */}
                      <div className="relative h-1.5 rounded-full bg-muted overflow-hidden mb-3">
                        <div
                          className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${meta.bar}`}
                          style={{ width: `${(cert.note / 20) * 100}%` }}
                        />
                      </div>

                      {/* Date */}
                      <p className="text-[11px] text-muted-foreground mb-3">
                        {new Date(cert.dateEmission).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>

                      {/* Actions — télécharger / partager / imprimer */}
                      <div className="flex flex-col gap-1.5">
                        <Button
                          size="sm"
                          className="w-full gap-1.5 text-xs"
                          onClick={() => handleDownload(cert.id)}
                          disabled={downloadingId === cert.id}
                        >
                          {downloadingId === cert.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Download className="h-3.5 w-3.5" />}
                          Télécharger PDF ({orientation === 'landscape' ? 'Paysage' : 'Portrait'})
                        </Button>
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="outline" className="flex-1 gap-1 text-xs" onClick={() => handleShare(cert)}>
                            <Share2 className="h-3 w-3" /> Partager
                          </Button>
                          <Button size="sm" variant="outline" className="flex-1 gap-1 text-xs" onClick={() => handlePrint(cert.id)} disabled={downloadingId === cert.id}>
                            <Printer className="h-3 w-3" /> Imprimer
                          </Button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )
              })
            )}
          </AnimatePresence>
        </motion.div>
        </>
      )}

      {/* ─── Timeline tab ─── */}
      {activeTab === 'timeline' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
          {certificats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mb-3">
                <TrendingUp className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-lg font-display font-semibold">Aucun parcours</p>
              <p className="text-sm text-muted-foreground mt-1">Votre parcours apparaîtra ici après vos premières certifications.</p>
            </div>
          ) : (
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-6 top-0 bottom-0 w-px bg-gradient-to-b from-emerald-500 via-teal-500 to-transparent" />
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
                        {/* Dot on timeline */}
                        <div className={`absolute -left-11 top-1.5 h-4 w-4 rounded-full border-2 border-background shadow-sm ${
                          cert.type === 'EXPERT' ? 'bg-warning' : cert.type === 'AVANCE' ? 'bg-info' : 'bg-success'
                        }`}>
                          <div className="absolute inset-0 rounded-full animate-ping opacity-30 bg-current" style={{ animationDuration: '3s' }} />
                        </div>
                        {/* Card */}
                        <Card className="border-l-4 hover:shadow-md transition-shadow ds-lift" style={{
                          borderLeftColor: cert.type === 'EXPERT' ? '#F59E0B' : cert.type === 'AVANCE' ? '#3B82F6' : '#10B981'
                        }}>
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${meta.bar} shrink-0`}>
                                  <Icon className="h-4 w-4 text-white" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold truncate">{cert.ueNom}</p>
                                  <p className="text-xs text-muted-foreground">{cert.ueCode} · {meta.label}</p>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className={`text-lg font-bold font-mono tabular-nums ${cert.note >= 14 ? 'text-success' : cert.note >= 10 ? 'text-warning' : 'text-destructive'}`}>{cert.note.toFixed(1)}<span className="text-xs text-muted-foreground">/20</span></p>
                                {cert.mention && <p className="text-[10px] text-muted-foreground">{cert.mention}</p>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">
                                {date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                              </span>
                              <div className="flex-1" />
                              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => handleDownload(cert.id)} disabled={downloadingId === cert.id}>
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

      {/* ─── Progression tab ─── */}
      {activeTab === 'progression' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
          {validations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mb-3">
                <TrendingUp className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-lg font-display font-semibold">Aucune progression</p>
              <p className="text-sm text-muted-foreground mt-1">Vos résultats apparaîtront ici après vos évaluations.</p>
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
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
                                <span className={val.note >= 16 ? 'text-warning' : val.note >= 10 ? 'text-success' : 'text-destructive'}>
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
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDownload(val.certificatId!)} disabled={downloadingId === val.certificatId}>
                                  {downloadingId === val.certificatId
                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin text-success" />
                                    : <Download className="h-3.5 w-3.5 text-success" />}
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
    </div>
  )
}
