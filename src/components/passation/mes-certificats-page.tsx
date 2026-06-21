'use client'

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
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
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

// ─── Constants ───

const CERTIFICAT_CONFIG: Record<
  CertificatType,
  { label: string; color: string; bgClass: string; borderClass: string; badgeClass: string; icon: typeof Award }
> = {
  STANDARD: {
    label: 'Standard',
    color: 'text-emerald-600',
    bgClass: 'bg-emerald-50',
    borderClass: 'border-emerald-200',
    badgeClass: 'bg-emerald-100 text-emerald-700',
    icon: FileText,
  },
  AVANCE: {
    label: 'Avancé',
    color: 'text-blue-600',
    bgClass: 'bg-blue-50',
    borderClass: 'border-blue-200',
    badgeClass: 'bg-blue-100 text-blue-700',
    icon: Award,
  },
  EXPERT: {
    label: 'Expert',
    color: 'text-amber-600',
    bgClass: 'bg-amber-50',
    borderClass: 'border-amber-200',
    badgeClass: 'bg-amber-100 text-amber-700',
    icon: Star,
  },
}

const STATUT_CONFIG: Record<
  StatutUE,
  { label: string; icon: typeof Clock; badgeClass: string }
> = {
  EN_COURS: {
    label: 'En cours',
    icon: Clock,
    badgeClass: 'bg-yellow-100 text-yellow-800',
  },
  VALIDEE: {
    label: 'Validée',
    icon: CheckCircle2,
    badgeClass: 'bg-green-100 text-green-800',
  },
  NON_VALIDEE: {
    label: 'Non validée',
    icon: XCircle,
    badgeClass: 'bg-red-100 text-red-800',
  },
}

// ─── Animation variants ───

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
}

// ─── Component ───

export function MesCertificatsPage() {
  const { user } = useAuthStore()

  const [certificats, setCertificats] = useState<Certificat[]>([])
  const [validations, setValidations] = useState<ValidationUE[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [pdfOrientation, setPdfOrientation] = useState<'landscape' | 'portrait'>('landscape')
  const [activeTab, setActiveTab] = useState('certificats')

  // ─── Data fetching ───

  const fetchData = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    setError(null)

    try {
      // 1. Trigger recalculation (computes validations + generates certificates)
      await fetch('/api/validations-ue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).catch(() => {
        // Silently continue if compute endpoint is not available
      })

      // 2. Fetch certificates
      const certRes = await fetch('/api/certificats')
      let certs: Certificat[] = []
      if (certRes.ok) {
        const certData = await certRes.json()
        const rawCerts: Record<string, unknown>[] = Array.isArray(certData)
          ? certData
          : certData.certificats ?? []
        // Map API (DB fields) -> frontend interface.
        // API returns noteFinale/mention/ueCode/ueNom/codeVerification directly on the Certificat row.
        const validTypes: CertificatType[] = ['STANDARD', 'AVANCE', 'EXPERT']
        certs = rawCerts
          .filter((c) => c && typeof c === 'object')
          .map((c) => {
            const type = validTypes.includes(c.type as CertificatType)
              ? (c.type as CertificatType)
              : 'STANDARD'
            const codeVerification = (c.codeVerification as string) || ''
            return {
              id: String(c.id ?? ''),
              type,
              ueCode: String(c.ueCode ?? '—'),
              ueNom: String(c.ueNom ?? '—'),
              note: typeof c.noteFinale === 'number' ? c.noteFinale : 0,
              mention: typeof c.mention === 'string' ? c.mention : '',
              dateEmission: c.dateEmission ? String(c.dateEmission) : new Date().toISOString(),
              verificationUrl: codeVerification
                ? `${window.location.origin}/verify/${codeVerification}`
                : undefined,
            }
          })
      }

      // 3. Fetch UE validations
      const valRes = await fetch('/api/validations-ue')
      let vals: ValidationUE[] = []
      if (valRes.ok) {
        const valData = await valRes.json()
        const rawVals: Record<string, unknown>[] = Array.isArray(valData)
          ? valData
          : valData.validations ?? []
        // Map API (DB fields + nested uniteEnseignement/certificats) -> frontend interface.
        const validStatuts: StatutUE[] = ['EN_COURS', 'VALIDEE', 'NON_VALIDEE']
        vals = rawVals
          .filter((v) => v && typeof v === 'object')
          .map((v) => {
            const ue = (v.uniteEnseignement as Record<string, unknown> | null) ?? null
            const certificats = Array.isArray(v.certificats) ? (v.certificats as Record<string, unknown>[]) : []
            const firstCertId = certificats.length > 0 ? String(certificats[0].id ?? '') : null
            const statut = validStatuts.includes(v.statut as StatutUE)
              ? (v.statut as StatutUE)
              : 'EN_COURS'
            const noteFinale = typeof v.noteFinale === 'number' ? v.noteFinale : null
            // noteFinale defaults to 0 in DB even when EN_COURS (no sessions yet);
            // expose null to the UI in that case so it shows "—" instead of "0.0".
            const note = statut === 'EN_COURS' ? null : noteFinale
            return {
              id: String(v.id ?? ''),
              ueCode: String(ue?.code ?? '—'),
              ueNom: String(ue?.nom ?? '—'),
              creditsECTS: typeof ue?.creditsECTS === 'number' ? ue.creditsECTS : 0,
              epreuvesCompletees: typeof v.nbEpreuvesCompletees === 'number' ? v.nbEpreuvesCompletees : 0,
              epreuvesTotal: typeof v.nbEpreuvesTotal === 'number' ? v.nbEpreuvesTotal : 0,
              note,
              statut,
              certificatId: firstCertId,
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

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ─── Summary stats ───

  const stats = {
    total: certificats.length,
    accomplissements: certificats.filter((c) => c.note >= 10).length,
    excellence: certificats.filter((c) => c.note >= 16).length,
    participations: certificats.filter((c) => c.note < 10).length,
  }

  // ─── PDF download ───

  const handleDownloadPDF = async (certificatId: string, orientation?: 'landscape' | 'portrait') => {
    const orient = orientation || pdfOrientation
    setDownloadingId(certificatId)
    try {
      const res = await fetch(`/api/certificats/${certificatId}/pdf?orientation=${orient}`)
      if (!res.ok) throw new Error('Erreur lors du téléchargement')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url)
      toast.success(`Certificat téléchargé (${orient === 'landscape' ? 'Paysage' : 'Portrait'})`)
    } catch (err) {
      console.error('PDF download error:', err)
      toast.error('Impossible de télécharger le certificat')
    } finally {
      setDownloadingId(null)
    }
  }

  // ─── Loading state ───

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          <p className="text-sm text-muted-foreground">Chargement de vos certificats...</p>
        </div>
      </div>
    )
  }

  // ─── Error state ───

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
            <CardTitle className="text-lg">Erreur de chargement</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button onClick={fetchData} variant="outline" className="gap-2">
              <Clock className="h-4 w-4" />
              Réessayer
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── Render ───

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* ─── Header ─── */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
            <ScrollText className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Mes Certificats</h1>
            <p className="text-sm text-muted-foreground">
              Consultez et téléchargez vos certificats
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="text-sm px-3 py-1">
          {stats.total} certificat{stats.total !== 1 ? 's' : ''}
        </Badge>
      </motion.div>

      {/* ─── Summary stats row ─── */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
                <FileText className="h-4 w-4 text-slate-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Certificats émis</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100">
                <Award className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-600">{stats.accomplissements}</p>
                <p className="text-xs text-muted-foreground">Accomplissements</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100">
                <Star className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">{stats.excellence}</p>
                <p className="text-xs text-muted-foreground">Excellence</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
                <Shield className="h-4 w-4 text-slate-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-500">{stats.participations}</p>
                <p className="text-xs text-muted-foreground">Participations</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ─── Tabs ─── */}
      <motion.div variants={itemVariants}>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="certificats" className="gap-1.5">
              <Award className="h-4 w-4" />
              Certificats
            </TabsTrigger>
            <TabsTrigger value="progression" className="gap-1.5">
              <BarChart3Icon className="h-4 w-4" />
              Progression par UE
            </TabsTrigger>
          </TabsList>

          {/* ─── Certificats tab ─── */}
          <TabsContent value="certificats">
            {certificats.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
                    <FileText className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <p className="text-lg font-medium mb-1">Aucun certificat</p>
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
                      <motion.div
                        key={cert.id}
                        variants={itemVariants}
                        initial="hidden"
                        animate="visible"
                        transition={{ delay: index * 0.05 }}
                      >
                        <Card className={`border ${config.borderClass} hover:shadow-md transition-shadow`}>
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between">
                              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${config.bgClass}`}>
                                <IconComponent className={`h-5 w-5 ${config.color}`} />
                              </div>
                              <Badge className={config.badgeClass} variant="secondary">
                                {config.label}
                              </Badge>
                            </div>
                            <CardTitle className="text-base mt-2">
                              <span className="font-mono text-sm text-muted-foreground mr-2">
                                {cert.ueCode}
                              </span>
                              {cert.ueNom}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            {/* Note & mention */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-2xl font-bold">{cert.note.toFixed(1)}</span>
                                <span className="text-sm text-muted-foreground">/20</span>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                {cert.mention}
                              </Badge>
                            </div>

                            {/* Progress bar */}
                            <Progress value={(cert.note / 20) * 100} className="h-2" />

                            {/* Date */}
                            <p className="text-xs text-muted-foreground">
                              Émis le{' '}
                              {new Date(cert.dateEmission).toLocaleDateString('fr-FR', {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric',
                              })}
                            </p>

                            {/* Format selector + Download */}
                            <div className="flex flex-col gap-2 pt-1">
                              {/* Toggle Paysage/Portrait */}
                              <div className="flex gap-1 bg-muted/50 rounded-md p-0.5">
                                <button
                                  onClick={() => setPdfOrientation('landscape')}
                                  className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-all ${
                                    pdfOrientation === 'landscape'
                                      ? 'bg-background shadow-sm text-emerald-600'
                                      : 'text-muted-foreground hover:text-foreground'
                                  }`}
                                >
                                  📐 Paysage
                                </button>
                                <button
                                  onClick={() => setPdfOrientation('portrait')}
                                  className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-all ${
                                    pdfOrientation === 'portrait'
                                      ? 'bg-background shadow-sm text-emerald-600'
                                      : 'text-muted-foreground hover:text-foreground'
                                  }`}
                                >
                                  📄 Portrait
                                </button>
                              </div>
                              <Button
                                size="sm"
                                className="flex-1 gap-1.5"
                                onClick={() => handleDownloadPDF(cert.id)}
                                disabled={downloadingId === cert.id}
                              >
                                {downloadingId === cert.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Download className="h-3.5 w-3.5" />
                                )}
                                Télécharger PDF ({pdfOrientation === 'landscape' ? 'Paysage' : 'Portrait'})
                              </Button>
                              {cert.verificationUrl && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5"
                                  asChild
                                >
                                  <a
                                    href={cert.verificationUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <Shield className="h-3.5 w-3.5" />
                                    Vérifier
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

          {/* ─── Progression par UE tab ─── */}
          <TabsContent value="progression">
            {validations.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
                    <BarChart3Icon className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <p className="text-lg font-medium mb-1">Aucune progression</p>
                  <p className="text-sm text-muted-foreground text-center max-w-sm">
                    Votre progression par unité d&apos;enseignement apparaîtra ici une fois les évaluations complétées.
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
                          <th className="text-left p-3 font-medium text-muted-foreground">Nom de l&apos;UE</th>
                          <th className="text-center p-3 font-medium text-muted-foreground">Crédits ECTS</th>
                          <th className="text-center p-3 font-medium text-muted-foreground">Épreuves</th>
                          <th className="text-center p-3 font-medium text-muted-foreground">Note</th>
                          <th className="text-center p-3 font-medium text-muted-foreground">Statut</th>
                          <th className="text-center p-3 font-medium text-muted-foreground">Certificat</th>
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
                                <span className="text-muted-foreground">
                                  {val.epreuvesCompletees}
                                </span>
                                <span className="text-muted-foreground">/</span>
                                <span>{val.epreuvesTotal}</span>
                              </td>
                              <td className="p-3 text-center font-semibold">
                                {val.note !== null ? (
                                  <span
                                    className={
                                      val.note >= 16
                                        ? 'text-amber-600'
                                        : val.note >= 10
                                        ? 'text-emerald-600'
                                        : 'text-red-600'
                                    }
                                  >
                                    {val.note.toFixed(1)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="p-3 text-center">
                                <Badge
                                  variant="secondary"
                                  className={`gap-1 ${statutConf.badgeClass}`}
                                >
                                  <StatutIcon className="h-3 w-3" />
                                  {statutConf.label}
                                </Badge>
                              </td>
                              <td className="p-3 text-center">
                                {val.certificatId ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={() => handleDownloadPDF(val.certificatId!)}
                                    disabled={downloadingId === val.certificatId}
                                    title="Télécharger le certificat"
                                  >
                                    {downloadingId === val.certificatId ? (
                                      <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                                    ) : (
                                      <Download className="h-4 w-4 text-emerald-600" />
                                    )}
                                  </Button>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
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
    </motion.div>
  )
}

// ─── Inline icon component to avoid naming conflict ───

function BarChart3Icon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  )
}
