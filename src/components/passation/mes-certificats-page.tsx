'use client'

/**
 * MesCertificatsPage — Refonte complète
 *
 * Design premium avec:
 * - En-tête hero avec gradient
 * - Cartes de certificats modernes (glassmorphism, hover lift)
 * - Stats animées avec icônes colorées
 * - Toggle Paysage/Portrait intégré par carte
 * - Onglets Certificats / Progression UE
 * - Table de progression stylée
 * - États vide/loading/error soignés
 */

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Download,
  Award,
  Shield,
  Star,
  ExternalLink,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ScrollText,
  AlertCircle,
  TrendingUp,
  Trophy,
  Medal,
  Sparkles,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { CertificateGenerator } from './certificate-generator'

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

const CERTIFICAT_CONFIG: Record<
  CertificatType,
  {
    label: string
    color: string
    gradient: string
    border: string
    badge: string
    icon: typeof Award
    glow: string
  }
> = {
  EXPERT: {
    label: 'Expert',
    color: 'text-amber-600',
    gradient: 'from-amber-500 to-orange-500',
    border: 'border-amber-200 dark:border-amber-800',
    badge: 'bg-gradient-to-r from-amber-500 to-orange-500 text-white',
    icon: Trophy,
    glow: 'shadow-amber-500/20',
  },
  AVANCE: {
    label: 'Avancé',
    color: 'text-blue-600',
    gradient: 'from-blue-500 to-indigo-500',
    border: 'border-blue-200 dark:border-blue-800',
    badge: 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white',
    icon: Medal,
    glow: 'shadow-blue-500/20',
  },
  STANDARD: {
    label: 'Standard',
    color: 'text-emerald-600',
    gradient: 'from-emerald-500 to-teal-500',
    border: 'border-emerald-200 dark:border-emerald-800',
    badge: 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white',
    icon: Award,
    glow: 'shadow-emerald-500/20',
  },
}

const STATUT_CONFIG: Record<StatutUE, { label: string; icon: typeof Clock; badge: string }> = {
  EN_COURS: { label: 'En cours', icon: Clock, badge: 'bg-yellow-100 text-yellow-800' },
  VALIDEE: { label: 'Validée', icon: CheckCircle2, badge: 'bg-green-100 text-green-800' },
  NON_VALIDEE: { label: 'Non validée', icon: XCircle, badge: 'bg-red-100 text-red-800' },
}

// ─── Animation ───

const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.06 } } }
const itemVariants = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } } }

// ─── Component ───

export function MesCertificatsPage() {
  const { user } = useAuthStore()
  const [certificats, setCertificats] = useState<Certificat[]>([])
  const [validations, setValidations] = useState<ValidationUE[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [pdfOrientation, setPdfOrientation] = useState<'landscape' | 'portrait'>('landscape')
  const [hdPreviewCert, setHdPreviewCert] = useState<Certificat | null>(null)
  const [activeTab, setActiveTab] = useState('certificats')

  // ─── Data fetching ───

  const fetchData = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    setError(null)
    try {
      await fetch('/api/validations-ue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }).catch(() => {})

      const certRes = await fetch('/api/certificats')
      let certs: Certificat[] = []
      if (certRes.ok) {
        const certData = await certRes.json()
        const rawCerts: Record<string, unknown>[] = Array.isArray(certData) ? certData : certData.certificats ?? []
        const validTypes: CertificatType[] = ['STANDARD', 'AVANCE', 'EXPERT']
        certs = rawCerts.filter((c) => c && typeof c === 'object').map((c) => {
          const type = validTypes.includes(c.type as CertificatType) ? (c.type as CertificatType) : 'STANDARD'
          const codeVerification = (c.codeVerification as string) || ''
          return {
            id: String(c.id ?? ''),
            type,
            ueCode: String(c.ueCode ?? '—'),
            ueNom: String(c.ueNom ?? '—'),
            note: typeof c.noteFinale === 'number' ? c.noteFinale : 0,
            mention: typeof c.mention === 'string' ? c.mention : '',
            dateEmission: c.dateEmission ? String(c.dateEmission) : new Date().toISOString(),
            verificationUrl: codeVerification ? `${window.location.origin}/verify/${codeVerification}` : undefined,
          }
        })
      }

      const valRes = await fetch('/api/validations-ue')
      let vals: ValidationUE[] = []
      if (valRes.ok) {
        const valData = await valRes.json()
        const rawVals: Record<string, unknown>[] = Array.isArray(valData) ? valData : valData.validations ?? []
        const validStatuts: StatutUE[] = ['EN_COURS', 'VALIDEE', 'NON_VALIDEE']
        vals = rawVals.filter((v) => v && typeof v === 'object').map((v) => {
          const ue = (v.uniteEnseignement as Record<string, unknown> | null) ?? null
          const certificats = Array.isArray(v.certificats) ? (v.certificats as Record<string, unknown>[]) : []
          const firstCertId = certificats.length > 0 ? String(certificats[0].id ?? '') : null
          const statut = validStatuts.includes(v.statut as StatutUE) ? (v.statut as StatutUE) : 'EN_COURS'
          const noteFinale = typeof v.noteFinale === 'number' ? v.noteFinale : null
          const note = statut === 'EN_COURS' ? null : noteFinale
          return {
            id: String(v.id ?? ''),
            ueCode: String(ue?.code ?? '—'),
            ueNom: String(ue?.nom ?? '—'),
            creditsECTS: typeof ue?.creditsECTS === 'number' ? ue.creditsECTS : 0,
            epreuvesCompletees: typeof v.nbEpreuvesCompletees === 'number' ? v.nbEpreuvesCompletees : 0,
            epreuvesTotal: typeof v.nbEpreuvesTotal === 'number' ? v.nbEpreuvesTotal : 0,
            note, statut, certificatId: firstCertId,
          }
        })
      }
      setCertificats(certs)
      setValidations(vals)
    } catch (err) {
      console.error('Error fetching certificate data:', err)
      setError('Impossible de charger vos certificats. Veuillez réessayer.')
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

  // ─── PDF download ───

  const handleDownloadPDF = async (certificatId: string, orientation?: 'landscape' | 'portrait') => {
    const orient = orientation || pdfOrientation
    setDownloadingId(certificatId)
    try {
      const res = await fetch(`/api/certificats/${certificatId}/pdf?orientation=${orient}`)
      if (!res.ok) throw new Error('Erreur')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url)
      toast.success(`Certificat téléchargé (${orient === 'landscape' ? 'Paysage' : 'Portrait'})`)
    } catch {
      toast.error('Impossible de télécharger le certificat')
    } finally {
      setDownloadingId(null)
    }
  }

  // ─── Open HD generator (pdf-lib + html2canvas) ───

  const openHdGenerator = (cert: Certificat) => {
    setHdPreviewCert(cert)
  }

  // ─── Loading ───

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 animate-ping rounded-full bg-emerald-400/30" />
            <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <ScrollText className="h-6 w-6 text-emerald-600 animate-pulse" />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Chargement de vos certificats...</p>
        </div>
      </div>
    )
  }

  // ─── Error ───

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md border-red-200 dark:border-red-800">
          <CardContent className="text-center py-8">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <AlertCircle className="h-7 w-7 text-red-600" />
            </div>
            <p className="text-lg font-semibold mb-1">Erreur de chargement</p>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button onClick={fetchData} variant="outline" className="gap-2">
              <Clock className="h-4 w-4" /> Réessayer
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── Render ───

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* ─── Hero Header ─── */}
      <motion.div variants={itemVariants} className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 p-6 sm:p-8 text-white shadow-xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-cyan-300/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl" />
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm border border-white/30">
              <ScrollText className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Mes Certificats</h1>
              <p className="text-sm text-emerald-100">Consultez et téléchargez vos certificats de réussite</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20">
            <Sparkles className="h-5 w-5 text-amber-300" />
            <span className="text-2xl font-bold">{stats.total}</span>
            <span className="text-sm text-emerald-100">certificat{stats.total !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </motion.div>

      {/* ─── Stats Cards ─── */}
      <motion.div variants={itemVariants} className="grid grid-cols-3 gap-3 sm:gap-4">
        {[
          { count: stats.expert, label: 'Expert', icon: Trophy, gradient: 'from-amber-500 to-orange-500', bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-600 dark:text-amber-400' },
          { count: stats.avance, label: 'Avancé', icon: Medal, gradient: 'from-blue-500 to-indigo-500', bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-600 dark:text-blue-400' },
          { count: stats.standard, label: 'Standard', icon: Award, gradient: 'from-emerald-500 to-teal-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-600 dark:text-emerald-400' },
        ].map((stat, i) => (
          <motion.div key={i} variants={itemVariants}>
            <Card className={`hover:shadow-lg transition-shadow ${stat.bg} border-0`}>
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-gradient-to-br ${stat.gradient} shadow-lg`}>
                    <stat.icon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                  </div>
                  <div>
                    <p className={`text-2xl sm:text-3xl font-bold ${stat.text}`}>{stat.count}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* ─── Tabs ─── */}
      <motion.div variants={itemVariants}>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start">
            <TabsTrigger value="certificats" className="gap-1.5">
              <Award className="h-4 w-4" /> Certificats
            </TabsTrigger>
            <TabsTrigger value="progression" className="gap-1.5">
              <TrendingUp className="h-4 w-4" /> Progression par UE
            </TabsTrigger>
          </TabsList>

          {/* ─── Certificats tab ─── */}
          <TabsContent value="certificats" className="mt-4">
            {certificats.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mb-4">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-lg font-semibold mb-1">Aucun certificat</p>
                  <p className="text-sm text-muted-foreground text-center max-w-sm">
                    Vos certificats apparaîtront ici une fois que vous aurez complété des épreuves et obtenu des résultats.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <AnimatePresence mode="popLayout">
                  {certificats.map((cert, index) => {
                    const config = CERTIFICAT_CONFIG[cert.type]
                    const IconComponent = config.icon
                    return (
                      <motion.div key={cert.id} variants={itemVariants} initial="hidden" animate="visible" transition={{ delay: index * 0.05 }}>
                        <Card className={`group relative overflow-hidden border ${config.border} hover:shadow-xl ${config.glow} hover:-translate-y-1 transition-all duration-300`}>
                          {/* Top gradient bar */}
                          <div className={`h-1.5 bg-gradient-to-r ${config.gradient}`} />

                          <CardContent className="p-5 space-y-4">
                            {/* Header row */}
                            <div className="flex items-start justify-between">
                              <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${config.gradient} shadow-md`}>
                                <IconComponent className="h-5 w-5 text-white" />
                              </div>
                              <Badge className={config.badge}>{config.label}</Badge>
                            </div>

                            {/* UE info */}
                            <div>
                              <p className="font-mono text-xs text-muted-foreground mb-0.5">{cert.ueCode}</p>
                              <h3 className="font-semibold text-base leading-tight">{cert.ueNom}</h3>
                            </div>

                            {/* Note + mention */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-baseline gap-1">
                                <span className="text-3xl font-bold">{cert.note.toFixed(2).replace(/[.,]00$/, '')}</span>
                                <span className="text-sm text-muted-foreground">/20</span>
                              </div>
                              <Badge variant="outline" className="text-xs">{cert.mention}</Badge>
                            </div>

                            {/* Progress bar */}
                            <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                              <div
                                className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${config.gradient}`}
                                style={{ width: `${(cert.note / 20) * 100}%` }}
                              />
                            </div>

                            {/* Date */}
                            <p className="text-xs text-muted-foreground">
                              {new Date(cert.dateEmission).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </p>

                            {/* Toggle + Download */}
                            <div className="flex flex-col gap-2 pt-1">
                              <div className="flex gap-1 bg-muted/50 rounded-lg p-0.5">
                                <button
                                  onClick={() => setPdfOrientation('landscape')}
                                  className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all ${pdfOrientation === 'landscape' ? 'bg-background shadow-sm text-emerald-600' : 'text-muted-foreground hover:text-foreground'}`}
                                >📐 Paysage</button>
                                <button
                                  onClick={() => setPdfOrientation('portrait')}
                                  className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all ${pdfOrientation === 'portrait' ? 'bg-background shadow-sm text-emerald-600' : 'text-muted-foreground hover:text-foreground'}`}
                                >📄 Portrait</button>
                              </div>
                              <Button size="sm" className="w-full gap-1.5" onClick={() => handleDownloadPDF(cert.id)} disabled={downloadingId === cert.id}>
                                {downloadingId === cert.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                                Télécharger ({pdfOrientation === 'landscape' ? 'Paysage' : 'Portrait'})
                              </Button>
                              {/* HD download via pdf-lib + html2canvas (SVG background) */}
                              <Button size="sm" variant="secondary" className="w-full gap-1.5" onClick={() => openHdGenerator(cert)}>
                                <Sparkles className="h-3.5 w-3.5" />
                                Télécharger HD
                              </Button>
                              {cert.verificationUrl && (
                                <Button size="sm" variant="outline" className="w-full gap-1.5" asChild>
                                  <a href={cert.verificationUrl} target="_blank" rel="noopener noreferrer">
                                    <Shield className="h-3.5 w-3.5" /> Vérifier en ligne
                                  </a>
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>
            )}
          </TabsContent>

          {/* ─── Progression tab ─── */}
          <TabsContent value="progression" className="mt-4">
            {validations.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mb-4">
                    <TrendingUp className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-lg font-semibold mb-1">Aucune progression</p>
                  <p className="text-sm text-muted-foreground text-center max-w-sm">
                    Votre progression par UE apparaîtra ici une fois les évaluations complétées.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-3 font-medium text-muted-foreground">Code UE</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Nom</th>
                          <th className="text-center p-3 font-medium text-muted-foreground">ECTS</th>
                          <th className="text-center p-3 font-medium text-muted-foreground">Épreuves</th>
                          <th className="text-center p-3 font-medium text-muted-foreground">Note</th>
                          <th className="text-center p-3 font-medium text-muted-foreground">Statut</th>
                          <th className="text-center p-3 font-medium text-muted-foreground">PDF</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validations.map((val, index) => {
                          const statutConf = STATUT_CONFIG[val.statut]
                          const StatutIcon = statutConf.icon
                          return (
                            <motion.tr
                              key={val.id}
                              className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: index * 0.04, duration: 0.3 }}
                            >
                              <td className="p-3 font-mono text-xs">{val.ueCode}</td>
                              <td className="p-3 font-medium">{val.ueNom}</td>
                              <td className="p-3 text-center">{val.creditsECTS}</td>
                              <td className="p-3 text-center">
                                <span className="text-muted-foreground">{val.epreuvesCompletees}</span>
                                <span className="text-muted-foreground">/</span>
                                <span>{val.epreuvesTotal}</span>
                              </td>
                              <td className="p-3 text-center font-semibold">
                                {val.note !== null ? (
                                  <span className={val.note >= 16 ? 'text-amber-600' : val.note >= 10 ? 'text-emerald-600' : 'text-red-600'}>
                                    {val.note.toFixed(1)}
                                  </span>
                                ) : (<span className="text-muted-foreground">—</span>)}
                              </td>
                              <td className="p-3 text-center">
                                <Badge variant="secondary" className={`gap-1 ${statutConf.badge}`}>
                                  <StatutIcon className="h-3 w-3" /> {statutConf.label}
                                </Badge>
                              </td>
                              <td className="p-3 text-center">
                                {val.certificatId ? (
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleDownloadPDF(val.certificatId!)} disabled={downloadingId === val.certificatId} title="Télécharger">
                                    {downloadingId === val.certificatId ? <Loader2 className="h-4 w-4 animate-spin text-emerald-600" /> : <Download className="h-4 w-4 text-emerald-600" />}
                                  </Button>
                                ) : (<span className="text-muted-foreground">—</span>)}
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
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* ─── HD Certificate Dialog (pdf-lib + html2canvas) ─── */}
      <Dialog open={!!hdPreviewCert} onOpenChange={(open) => !open && setHdPreviewCert(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-auto">
          {hdPreviewCert && (
            <CertificateGenerator
              data={{
                codeVerification: hdPreviewCert.codeVerification,
                type: hdPreviewCert.type,
                intitule: hdPreviewCert.type === 'EXPERT' ? 'Certificat de Réussite – Niveau Expert'
                  : hdPreviewCert.type === 'AVANCE' ? 'Certificat de Réussite – Niveau Avancé'
                  : 'Certificat de Réussite – Niveau Standard',
                mention: hdPreviewCert.mention,
                noteFinale: hdPreviewCert.note,
                etablissementNom: user?.etablissement?.nom || 'Établissement',
                etablissementVille: null,
                etablissementPays: null,
                filiereNom: user?.filiere?.nom || '',
                ueCode: hdPreviewCert.ueCode,
                ueNom: hdPreviewCert.ueNom,
                etudiantNom: hdPreviewCert.etudiantNom || user?.name || '',
                etudiantMatricule: null,
                etudiantNiveau: null,
                sessionType: 'NORMALE',
                anneeAcademique: null,
                dateEmission: hdPreviewCert.dateEmission,
                verificationUrl: hdPreviewCert.verificationUrl || '',
                responsableNom: null,
              }}
              onClose={() => setHdPreviewCert(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
