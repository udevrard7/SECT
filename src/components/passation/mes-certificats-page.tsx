'use client'

/**
 * MesCertificatsPage — Refonte 2026
 *
 * Design moderne, rapide et captivant :
 * - Hero compact avec dégradé navy + particules
 * - Stats inline (pas de cartes séparées — chargement plus rapide)
 * - Cartes certificats en glassmorphism avec bordure gradient au hover
 * - Toggle Paysage/Portrait global (pas par carte — moins de re-renders)
 * - Skeleton loading (pas de spinner bloquant)
 * - Lazy load du CertificateGenerator (code splitting)
 * - Tableau de progression compact
 */

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Download, Award, Shield, FileText, CheckCircle2, XCircle, Clock,
  Loader2, ScrollText, AlertCircle, TrendingUp, Trophy, Medal, Sparkles,
  ChevronRight,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'

// Lazy load heavy libs only when HD download is clicked
let html2canvasMod: typeof import('html2canvas')['default'] | null = null
let pdfLibMod: typeof import('pdf-lib') | null = null

async function loadLibs() {
  if (!html2canvasMod) html2canvasMod = (await import('html2canvas')).default
  if (!pdfLibMod) pdfLibMod = await import('pdf-lib')
  return { html2canvas: html2canvasMod, PDFDocument: pdfLibMod.PDFDocument }
}

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
    label: 'Expert',
    icon: Trophy,
    ring: 'ring-amber-400/40',
    text: 'text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-400/30',
    bar: 'from-amber-400 to-orange-500',
  },
  AVANCE: {
    label: 'Avancé',
    icon: Medal,
    ring: 'ring-blue-400/40',
    text: 'text-blue-600 dark:text-blue-400',
    badge: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-400/30',
    bar: 'from-blue-400 to-indigo-500',
  },
  STANDARD: {
    label: 'Standard',
    icon: Award,
    ring: 'ring-emerald-400/40',
    text: 'text-emerald-600 dark:text-emerald-400',
    badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-400/30',
    bar: 'from-emerald-400 to-teal-500',
  },
}

const STATUT_META: Record<StatutUE, { label: string; icon: typeof Clock; cls: string }> = {
  EN_COURS: { label: 'En cours', icon: Clock, cls: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-300' },
  VALIDEE: { label: 'Validée', icon: CheckCircle2, cls: 'bg-green-500/15 text-green-700 dark:text-green-300' },
  NON_VALIDEE: { label: 'Non validée', icon: XCircle, cls: 'bg-red-500/15 text-red-700 dark:text-red-300' },
}

// ─── Skeleton ───

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border/40 p-5 space-y-4 animate-pulse">
      <div className="flex justify-between">
        <div className="h-11 w-11 rounded-xl bg-muted" />
        <div className="h-5 w-16 rounded-full bg-muted" />
      </div>
      <div className="h-4 w-3/4 rounded bg-muted" />
      <div className="h-8 w-20 rounded bg-muted" />
      <div className="h-2 w-full rounded-full bg-muted" />
      <div className="h-8 w-full rounded-lg bg-muted" />
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
  const [hdDownloadingId, setHdDownloadingId] = useState<string | null>(null)
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape')
  const [activeTab, setActiveTab] = useState('certificats')

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

  // ─── Download (react-pdf server) ───

  const handleDownload = async (id: string) => {
    setDownloadingId(id)
    try {
      const res = await fetch(`/api/certificats/${id}/pdf?orientation=${orientation}`)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url)
      toast.success(`Téléchargé (${orientation === 'landscape' ? 'Paysage' : 'Portrait'})`)
    } catch {
      toast.error('Échec du téléchargement')
    } finally {
      setDownloadingId(null)
    }
  }

  // ─── Download HD (pdf-lib + html2canvas, NO modal) ───

  const handleDownloadHD = async (cert: Certificat) => {
    setHdDownloadingId(cert.id)
    try {
      const { html2canvas, PDFDocument } = await loadLibs()

      // Build a temporary off-screen div with the certificate content
      const isLandscape = orientation === 'landscape'
      const w = isLandscape ? 1122 : 793
      const h = isLandscape ? 793 : 1122

      const tempDiv = document.createElement('div')
      tempDiv.style.cssText = `position:fixed;left:0;top:0;width:${w}px;height:${h}px;z-index:-1;opacity:1;background:#fff;overflow:hidden;`

      // SVG background
      tempDiv.innerHTML = `
        <img src="/certificate-bg-landscape.svg" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" />
        <div style="position:relative;z-index:2;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:${isLandscape ? '60px 100px' : '70px 70px'};box-sizing:border-box;font-family:Inter,sans-serif;">
          <p style="font-size:11px;color:#D4AF37;letter-spacing:3px;font-weight:600;margin:0 0 2px 0;">${(user?.etablissement?.nom || 'ÉTABLISSEMENT').toUpperCase()}</p>
          <h1 style="font-family:Georgia,serif;font-size:${isLandscape ? 38 : 36}px;color:#D4AF37;letter-spacing:4px;margin:4px 0 2px 0;font-weight:700;">CERTIFICAT DE RÉUSSITE</h1>
          <p style="font-family:Georgia,serif;font-size:22px;color:#2C3E50;letter-spacing:2px;margin:0 0 10px 0;">${cert.type === 'EXPERT' ? 'Niveau Expert' : cert.type === 'AVANCE' ? 'Niveau Avancé' : 'Niveau Standard'}</p>
          <div style="display:flex;gap:12px;margin-bottom:12px;">
            <div style="width:8px;height:8px;background:#D4AF37;transform:rotate(45deg);"></div>
            <div style="width:10px;height:10px;background:#1a3a6b;transform:rotate(45deg);"></div>
            <div style="width:8px;height:8px;background:#D4AF37;transform:rotate(45deg);"></div>
          </div>
          <p style="font-size:13px;color:#2C3E50;font-style:italic;margin:0 0 6px 0;">Nous certifions par la présente que</p>
          <p style="font-family:'Brush Script MT',cursive;font-size:${isLandscape ? 52 : 48}px;color:#1A1A1A;margin:0 0 4px 0;line-height:1.2;">${cert.etudiantNom || user?.name || ''}</p>
          <p style="font-size:12px;color:#2C3E50;margin:0 0 4px 0;">a validé avec succès l'unité d'enseignement</p>
          <p style="font-family:Georgia,serif;font-size:${isLandscape ? 28 : 26}px;color:#D4AF37;font-weight:700;margin:0 0 15px 0;">${cert.ueNom}</p>
          <div style="display:grid;grid-template-columns:repeat(${isLandscape ? 3 : 2},1fr);gap:8px;width:${isLandscape ? '70%' : '85%'};margin-bottom:15px;">
            ${[
              { l: 'CODE UE', v: cert.ueCode, h: false },
              { l: 'FILIÈRE', v: user?.filiere?.nom || '', h: false },
              { l: 'NOTE', v: cert.note.toFixed(2).replace(/[.,]00$/, '') + '/20', h: true },
              { l: 'MENTION', v: cert.mention || '—', h: true },
              { l: 'SESSION', v: 'Normale', h: false },
              { l: 'ANNÉE', v: '—', h: false },
            ].map(c => `<div style="text-align:center;padding:8px;border-radius:4px;background:${c.h ? '#FFF8E1' : '#F7FAFC'};${c.h ? 'border:1px solid #E6C84E;' : ''}"><p style="font-size:8px;color:#7F8C8D;text-transform:uppercase;letter-spacing:1px;font-weight:600;margin:0 0 3px 0;">${c.l}</p><p style="font-size:12px;color:#1a3a6b;font-weight:700;margin:0;">${c.v}</p></div>`).join('')}
          </div>
          <div style="width:60px;height:60px;border-radius:50%;background:#1a3a6b;border:3px solid #D4AF37;display:flex;flex-direction:column;align-items:center;justify-content:center;margin-bottom:15px;">
            <span style="font-size:10px;color:#fff;font-weight:700;">SECT</span>
            <span style="font-size:5px;color:#D4AF37;font-weight:700;">CERTIFIÉ</span>
          </div>
          ${isLandscape ? `
          <div style="display:flex;justify-content:space-between;align-items:flex-end;width:100%;padding:0 40px;">
            <div style="text-align:center;width:30%;"><div style="height:40px;"></div><div style="border-bottom:1px solid #D4AF37;margin-bottom:4px;"></div><p style="font-size:9px;color:#7F8C8D;margin:0;">Signature de l'enseignant</p></div>
            <div style="text-align:center;width:30%;"><div style="height:40px;"></div><div style="border-bottom:1px solid #D4AF37;margin-bottom:4px;"></div><p style="font-size:9px;color:#7F8C8D;margin:0;">Le Responsable pédagogique</p></div>
          </div>` : `
          <div style="display:flex;flex-direction:column;align-items:center;width:100%;gap:20px;">
            <div style="text-align:center;width:60%;"><div style="height:40px;"></div><div style="border-bottom:1px solid #D4AF37;margin-bottom:4px;"></div><p style="font-size:9px;color:#7F8C8D;margin:0;">Signature de l'enseignant</p></div>
            <div style="text-align:center;width:60%;"><div style="height:40px;"></div><div style="border-bottom:1px solid #D4AF37;margin-bottom:4px;"></div><p style="font-size:9px;color:#7F8C8D;margin:0;">Le Responsable pédagogique</p></div>
          </div>`}
          <div style="position:absolute;bottom:20px;left:40px;right:40px;text-align:center;padding-top:8px;border-top:1px solid #D4AF37;">
            <p style="font-size:8px;color:#4A5568;margin:0;">Émis le ${new Date(cert.dateEmission).toLocaleDateString('fr-FR')}  |  Code: ${cert.codeVerification}  |  Vérification: ${cert.verificationUrl || ''}</p>
          </div>
        </div>
      `

      document.body.appendChild(tempDiv)

      // Wait for the SVG image to load
      await new Promise(r => setTimeout(r, 500))

      // Capture with html2canvas
      const canvas = await html2canvas(tempDiv, {
        scale: 3,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: w,
        height: h,
      })

      // Remove temp div
      document.body.removeChild(tempDiv)

      // Convert to PNG bytes
      const pngDataUrl = canvas.toDataURL('image/png')
      const base64 = pngDataUrl.split(',')[1]
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

      // Create PDF with pdf-lib
      const pdfDoc = await PDFDocument.create()
      const pw = isLandscape ? 841.89 : 595.28
      const ph = isLandscape ? 595.28 : 841.89
      const page = pdfDoc.addPage([pw, ph])
      const embedded = await pdfDoc.embedPng(bytes)
      page.drawImage(embedded, { x: 0, y: 0, width: pw, height: ph })

      const pdfBytes = await pdfDoc.save()
      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `Certificat_${(cert.etudiantNom || user?.name || '').replace(/\s+/g, '_')}_${cert.codeVerification}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast.success('Certificat HD téléchargé')
    } catch (err) {
      console.error('HD download error:', err)
      toast.error('Échec du téléchargement HD')
    } finally {
      setHdDownloadingId(null)
    }
  }

  // ─── Loading ───

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-24 rounded-2xl bg-gradient-to-r from-emerald-600/20 to-cyan-600/20 animate-pulse" />
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
        <AlertCircle className="h-10 w-10 text-red-500" />
        <p className="text-lg font-semibold">{error}</p>
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
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 p-5 sm:p-6 text-white shadow-lg">
        <div className="absolute top-0 right-0 h-40 w-40 rounded-full bg-white/10 blur-3xl translate-x-1/3 -translate-y-1/3" />
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 backdrop-blur">
              <ScrollText className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">Mes Certificats</h1>
              <p className="text-xs text-emerald-100">Téléchargez et vérifiez vos certificats de réussite</p>
            </div>
          </div>
          {/* Inline stats */}
          <div className="flex items-center gap-3">
            {([
              { n: stats.expert, label: 'Expert', icon: Trophy, color: 'text-amber-300' },
              { n: stats.avance, label: 'Avancé', icon: Medal, color: 'text-blue-300' },
              { n: stats.standard, label: 'Standard', icon: Award, color: 'text-emerald-300' },
            ] as const).map((s, i) => (
              <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 backdrop-blur">
                <s.icon className={`h-3.5 w-3.5 ${s.color}`} />
                <span className="text-sm font-bold">{s.n}</span>
                <span className="text-[10px] text-emerald-100 hidden sm:inline">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Global orientation toggle ─── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="certificats" className="gap-1.5 text-xs">
              <Award className="h-3.5 w-3.5" /> Certificats
              {stats.total > 0 && <span className="ml-1 px-1.5 rounded-full bg-primary/15 text-[10px] font-bold">{stats.total}</span>}
            </TabsTrigger>
            <TabsTrigger value="progression" className="gap-1.5 text-xs">
              <TrendingUp className="h-3.5 w-3.5" /> Progression UE
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Orientation selector (global, pas par carte) */}
        <div className="flex gap-1 bg-muted/50 rounded-lg p-0.5">
          <button
            onClick={() => setOrientation('landscape')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${orientation === 'landscape' ? 'bg-background shadow-sm text-emerald-600' : 'text-muted-foreground'}`}
          >📐 Paysage</button>
          <button
            onClick={() => setOrientation('portrait')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${orientation === 'portrait' ? 'bg-background shadow-sm text-emerald-600' : 'text-muted-foreground'}`}
          >📄 Portrait</button>
        </div>
      </div>

      {/* ─── Certificats tab ─── */}
      {activeTab === 'certificats' && (
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
                <p className="text-lg font-semibold">Aucun certificat</p>
                <p className="text-sm text-muted-foreground text-center max-w-sm mt-1">
                  Vos certificats apparaîtront ici une fois vos épreuves validées.
                </p>
              </div>
            ) : (
              certificats.map((cert, i) => {
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
                    <div className={`group relative overflow-hidden rounded-xl border border-border/50 bg-card p-5 ring-1 ${meta.ring} hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300`}>
                      {/* Top accent bar */}
                      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${meta.bar}`} />

                      {/* Header */}
                      <div className="flex items-start justify-between mb-4 mt-1">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${meta.bar} shadow-md`}>
                          <Icon className="h-5 w-5 text-white" />
                        </div>
                        <Badge variant="outline" className={meta.badge}>{meta.label}</Badge>
                      </div>

                      {/* UE */}
                      <div className="mb-3">
                        <p className="font-mono text-[11px] text-muted-foreground">{cert.ueCode}</p>
                        <h3 className="font-semibold text-sm leading-snug">{cert.ueNom}</h3>
                      </div>

                      {/* Note */}
                      <div className="flex items-baseline justify-between mb-2">
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-bold">{cert.note.toFixed(2).replace(/[.,]00$/, '')}</span>
                          <span className="text-xs text-muted-foreground">/20</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{cert.mention}</span>
                      </div>

                      {/* Progress bar (gradient) */}
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

                      {/* Actions */}
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
                          PDF {orientation === 'landscape' ? 'Paysage' : 'Portrait'}
                        </Button>

                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            variant="secondary"
                            className="flex-1 gap-1 text-xs"
                            onClick={() => handleDownloadHD(cert)}
                            disabled={hdDownloadingId === cert.id}
                          >
                            {hdDownloadingId === cert.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} HD
                          </Button>
                          {cert.verificationUrl && (
                            <Button size="sm" variant="outline" className="flex-1 gap-1 text-xs" asChild>
                              <a href={cert.verificationUrl} target="_blank" rel="noopener noreferrer">
                                <Shield className="h-3 w-3" /> Vérifier
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )
              })
            )}
          </AnimatePresence>
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
              <p className="text-lg font-semibold">Aucune progression</p>
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
                          <th key={h} className="text-center p-3 font-medium text-muted-foreground first:text-left">{h}</th>
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
                            <td className="p-3 text-center">{val.creditsECTS}</td>
                            <td className="p-3 text-center text-muted-foreground">{val.epreuvesCompletees}/{val.epreuvesTotal}</td>
                            <td className="p-3 text-center font-semibold">
                              {val.note !== null ? (
                                <span className={val.note >= 16 ? 'text-amber-600' : val.note >= 10 ? 'text-emerald-600' : 'text-red-500'}>
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
                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
                                    : <Download className="h-3.5 w-3.5 text-emerald-600" />}
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
