'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Shield,
  Save,
  Eye,
  Lock,
  AlertTriangle,
  ClipboardCheck,
  MonitorSmartphone,
  MousePointerClick,
  Printer,
  UserCheck,
  Timer,
  AppWindow,
  BellRing,
  Send,
  FileSearch,
  BarChart3,
  Loader2,
  Building2,
  CheckCircle2,
  XCircle,
  Settings2,
  Camera,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'

// ─── Types ───

interface Etablissement {
  id: string
  nom: string
  type: string | null
  ville: string | null
  actif: boolean
  _count?: { filieres: number; users: number }
}

interface SecuritySettings {
  id: string
  etablissementId: string
  proctoringActif: boolean
  detectionCopie: boolean
  detectionOnglet: boolean
  detectionFullscreen: boolean
  captureEcran: boolean
  blocageCopie: boolean
  blocageClicDroit: boolean
  blocageImpression: boolean
  verificationIdentite: boolean
  tempsInactiviteMax: number
  nbOngletsMax: number
  nbAlertesMax: number
  autoSubmitOnViolation: boolean
  rapportFraude: boolean
  seuilSimilarite: number
  penaliteFullscreenExit: number
  fullscreenObligatoire: boolean
  intervalleCaptureEcran: number
  etablissement?: {
    id: string
    nom: string
    type: string | null
    ville: string | null
    actif: boolean
  }
}

// ─── Default settings ───

const DEFAULT_SETTINGS: Omit<SecuritySettings, 'id' | 'etablissementId' | 'etablissement'> = {
  proctoringActif: false,
  detectionCopie: true,
  detectionOnglet: true,
  detectionFullscreen: true,
  captureEcran: false,
  blocageCopie: true,
  blocageClicDroit: true,
  blocageImpression: true,
  verificationIdentite: false,
  tempsInactiviteMax: 120,
  nbOngletsMax: 3,
  nbAlertesMax: 5,
  autoSubmitOnViolation: false,
  rapportFraude: true,
  seuilSimilarite: 0.85,
  penaliteFullscreenExit: 5,
  fullscreenObligatoire: true,
  intervalleCaptureEcran: 60,
}

// ─── Toggle Row Component ───

function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled = false,
  icon: Icon,
}: {
  id: string
  label: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className={`flex items-center justify-between gap-4 rounded-lg border p-4 transition-colors ${checked ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20' : 'border-border'} ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${checked ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="space-y-0.5 min-w-0">
          <Label htmlFor={id} className="text-sm font-medium cursor-pointer">
            {label}
          </Label>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {description}
          </p>
        </div>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </div>
  )
}

// ─── Slider Row Component ───

function SliderRow({
  id,
  label,
  description,
  value,
  onValueChange,
  min,
  max,
  step = 1,
  formatValue,
  icon: Icon,
}: {
  id: string
  label: string
  description: string
  value: number
  onValueChange: (value: number) => void
  min: number
  max: number
  step?: number
  formatValue?: (value: number) => string
  icon: React.ComponentType<{ className?: string }>
}) {
  const displayValue = formatValue ? formatValue(value) : String(value)

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-teal-100 text-teal-600 dark:bg-teal-900/50 dark:text-teal-400">
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={id} className="text-sm font-medium">
              {label}
            </Label>
            <Badge variant="secondary" className="bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300 font-mono text-xs">
              {displayValue}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {description}
          </p>
        </div>
      </div>
      <Slider
        id={id}
        value={[value]}
        onValueChange={([val]) => onValueChange(val)}
        min={min}
        max={max}
        step={step}
        className="w-full"
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formatValue ? formatValue(min) : min}</span>
        <span>{formatValue ? formatValue(max) : max}</span>
      </div>
    </div>
  )
}

// ─── Main Component ───

export function SecuritePage() {
  const { user } = useAuthStore()

  // Data state
  const [etablissements, setEtablissements] = useState<Etablissement[]>([])
  const [selectedEtablissementId, setSelectedEtablissementId] = useState<string>('')
  const [settings, setSettings] = useState<SecuritySettings | null>(null)
  const [allSettings, setAllSettings] = useState<SecuritySettings[]>([])

  // Loading states
  const [loadingEtablissements, setLoadingEtablissements] = useState(true)
  const [loadingSettings, setLoadingSettings] = useState(false)
  const [saving, setSaving] = useState(false)

  // ─── Fetch etablissements ───

  useEffect(() => {
    async function fetchEtablissements() {
      try {
        setLoadingEtablissements(true)
        const res = await fetch('/api/etablissements')
        if (!res.ok) throw new Error('Failed to fetch')
        const data = await res.json()
        setEtablissements(data.etablissements || [])
      } catch {
        toast.error('Erreur', { description: 'Impossible de charger les établissements' })
      } finally {
        setLoadingEtablissements(false)
      }
    }
    fetchEtablissements()
  }, [])

  // ─── Fetch all security settings for overview table ───

  const fetchAllSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/security-settings')
      if (!res.ok) return
      const data = await res.json()
      setAllSettings(data.securitySettings || [])
    } catch {
      // Silent fail for overview
    }
  }, [])

  useEffect(() => {
    fetchAllSettings()
  }, [fetchAllSettings])

  // ─── Compute stats ───

  const statsProctoring = allSettings.filter((s) => s.proctoringActif).length
  const statsVerifIdentite = allSettings.filter((s) => s.verificationIdentite).length
  // Simulated monthly fraud alerts count (based on alert thresholds)
  const statsAlertesFraude = allSettings.reduce((acc, s) => acc + (s.autoSubmitOnViolation ? Math.floor(s.nbAlertesMax * 0.6) : 0), 0)

  // ─── Load settings for selected etablissement ───

  useEffect(() => {
    if (!selectedEtablissementId) {
      setSettings(null)
      return
    }

    async function loadSettings() {
      try {
        setLoadingSettings(true)
        const res = await fetch(`/api/security-settings/etablissement/${selectedEtablissementId}`)
        if (!res.ok) throw new Error('Failed to fetch')
        const data = await res.json()
        setSettings(data.securitySettings)
      } catch {
        toast.error('Erreur', { description: 'Impossible de charger les paramètres de sécurité' })
        setSettings(null)
      } finally {
        setLoadingSettings(false)
      }
    }

    loadSettings()
  }, [selectedEtablissementId])

  // ─── Update a single field ───

  const updateField = <K extends keyof SecuritySettings>(key: K, value: SecuritySettings[K]) => {
    if (!settings) return
    setSettings({ ...settings, [key]: value })
  }

  // ─── Save settings ───

  const handleSave = async () => {
    if (!settings) return

    try {
      setSaving(true)
      const res = await fetch(`/api/security-settings/${settings.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proctoringActif: settings.proctoringActif,
          detectionCopie: settings.detectionCopie,
          detectionOnglet: settings.detectionOnglet,
          detectionFullscreen: settings.detectionFullscreen,
          captureEcran: settings.captureEcran,
          blocageCopie: settings.blocageCopie,
          blocageClicDroit: settings.blocageClicDroit,
          blocageImpression: settings.blocageImpression,
          verificationIdentite: settings.verificationIdentite,
          tempsInactiviteMax: settings.tempsInactiviteMax,
          nbOngletsMax: settings.nbOngletsMax,
          nbAlertesMax: settings.nbAlertesMax,
          autoSubmitOnViolation: settings.autoSubmitOnViolation,
          rapportFraude: settings.rapportFraude,
          seuilSimilarite: settings.seuilSimilarite,
          penaliteFullscreenExit: settings.penaliteFullscreenExit,
          fullscreenObligatoire: settings.fullscreenObligatoire,
          intervalleCaptureEcran: settings.intervalleCaptureEcran,
        }),
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Erreur lors de la sauvegarde')
      }

      toast.success('Paramètres sauvegardés', {
        description: `Les paramètres de sécurité ont été mis à jour pour ${settings.etablissement?.nom || "l'établissement"}.`,
      })

      // Refresh overview
      fetchAllSettings()
    } catch (err) {
      toast.error('Erreur de sauvegarde', {
        description: err instanceof Error ? err.message : 'Une erreur est survenue',
      })
    } finally {
      setSaving(false)
    }
  }

  // ─── Navigate to a specific etablissement from the overview table ───

  const handleSelectFromTable = (etabId: string) => {
    setSelectedEtablissementId(etabId)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* ─── Header ─── */}
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
              <Shield className="h-7 w-7 text-emerald-600" />
              Sécurité des Évaluations
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Configurez les paramètres anti-fraude et de surveillance
            </p>
          </div>
          {user && (
            <Badge variant="outline" className="w-fit text-xs">
              <Lock className="h-3 w-3 mr-1" />
              {user.role === 'ADMIN' ? 'Administrateur' : user.role}
            </Badge>
          )}
        </div>

        {/* ─── Stats Cards ─── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="border-emerald-200 dark:border-emerald-800">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400">
                  <Eye className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                    {statsProctoring}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Établissements avec proctoring
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-teal-200 dark:border-teal-800">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 text-teal-600 dark:bg-teal-900/50 dark:text-teal-400">
                  <UserCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-teal-700 dark:text-teal-400">
                    {statsVerifIdentite}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Établissements avec vérif. identité
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-amber-200 dark:border-amber-800">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-400">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                    {statsAlertesFraude}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Alertes fraude ce mois
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ─── Établissement Selector ─── */}
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-emerald-600" />
                  Sélectionner un établissement
                </Label>
                <Select
                  value={selectedEtablissementId}
                  onValueChange={setSelectedEtablissementId}
                  disabled={loadingEtablissements}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={
                      loadingEtablissements
                        ? 'Chargement...'
                        : 'Choisir un établissement...'
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {etablissements
                      .filter((e) => e.actif)
                      .map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.nom}
                          {e.ville ? ` — ${e.ville}` : ''}
                          {e.type ? ` (${e.type})` : ''}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Si aucun paramètre n&apos;existe pour cet établissement, les valeurs par défaut seront créées automatiquement.
                </p>
              </div>
              {selectedEtablissementId && settings && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                    Configuré
                  </Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ─── Loading Spinner ─── */}
        {loadingSettings && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
            <span className="ml-3 text-sm text-muted-foreground">Chargement des paramètres...</span>
          </div>
        )}

        {/* ─── Security Settings Panel ─── */}
        {!loadingSettings && settings && (
          <div className="space-y-6">

            {/* ─── Section A: Surveillance & Détection ─── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400">
                    <Eye className="h-4 w-4" />
                  </div>
                  Surveillance & Détection
                </CardTitle>
                <CardDescription>
                  Activez les mécanismes de surveillance et de détection de comportement suspect
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ToggleRow
                  id="proctoring-actif"
                  label="Proctoring actif"
                  description="Active la surveillance vidéo et le suivi en temps réel des candidats pendant les évaluations"
                  checked={settings.proctoringActif}
                  onCheckedChange={(v) => updateField('proctoringActif', v)}
                  icon={MonitorSmartphone}
                />
                <ToggleRow
                  id="detection-copie"
                  label="Détection de copier/coller"
                  description="Détecte les tentatives de copier/coller pendant l'évaluation et les signale comme alerte"
                  checked={settings.detectionCopie}
                  onCheckedChange={(v) => updateField('detectionCopie', v)}
                  icon={ClipboardCheck}
                />
                <ToggleRow
                  id="detection-onglet"
                  label="Détection de changement d'onglet"
                  description="Surveille les changements d'onglet ou de fenêtre du navigateur pendant l'évaluation"
                  checked={settings.detectionOnglet}
                  onCheckedChange={(v) => updateField('detectionOnglet', v)}
                  icon={AppWindow}
                />
                <ToggleRow
                  id="detection-fullscreen"
                  label="Détection de sortie plein écran"
                  description="Détecte si le candidat quitte le mode plein écran imposé pendant l'évaluation"
                  checked={settings.detectionFullscreen}
                  onCheckedChange={(v) => updateField('detectionFullscreen', v)}
                  icon={MonitorSmartphone}
                />
                {settings.detectionFullscreen && (
                  <>
                    <ToggleRow
                      id="fullscreen-obligatoire"
                      label="Plein écran obligatoire"
                      description="Bloque l'épreuve si l'étudiant n'est pas en plein écran — il doit revenir en plein écran pour continuer"
                      checked={settings.fullscreenObligatoire}
                      onCheckedChange={(v) => updateField('fullscreenObligatoire', v)}
                      icon={MonitorSmartphone}
                    />
                    <SliderRow
                      id="penalite-fullscreen-exit"
                      label="Pénalité par sortie plein écran"
                      description="Points retirés à la note de l'étudiant à chaque sortie du plein écran à partir de la 2ème tentative"
                      value={settings.penaliteFullscreenExit}
                      onValueChange={(v) => updateField('penaliteFullscreenExit', v)}
                      min={0}
                      max={10}
                      step={1}
                      formatValue={(v) => `-${v} pts`}
                      icon={AlertTriangle}
                    />
                  </>
                )}
                <ToggleRow
                  id="capture-ecran"
                  label="Capture d'écran périodique"
                  description="Effectue des captures d'écran automatiques à intervalle régulier pendant l'évaluation"
                  checked={settings.captureEcran}
                  onCheckedChange={(v) => updateField('captureEcran', v)}
                  icon={Camera}
                />
                {settings.captureEcran && (
                  <SliderRow
                    id="intervalle-capture-ecran"
                    label="Intervalle des captures"
                    description="Fréquence des captures d'écran automatiques en secondes"
                    value={settings.intervalleCaptureEcran}
                    onValueChange={(v) => updateField('intervalleCaptureEcran', v)}
                    min={30}
                    max={300}
                    step={10}
                    formatValue={(v) => `${v}s`}
                    icon={Timer}
                  />
                )}
              </CardContent>
            </Card>

            {/* ─── Section B: Blocage & Protection ─── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-100 text-teal-600 dark:bg-teal-900/50 dark:text-teal-400">
                    <Lock className="h-4 w-4" />
                  </div>
                  Blocage & Protection
                </CardTitle>
                <CardDescription>
                  Bloquez les actions non autorisées pour sécuriser le déroulement des évaluations
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ToggleRow
                  id="blocage-copie"
                  label="Blocage du copier/coller"
                  description="Empêche complètement les opérations de copier, couper et coller dans la page d'évaluation"
                  checked={settings.blocageCopie}
                  onCheckedChange={(v) => updateField('blocageCopie', v)}
                  icon={ClipboardCheck}
                />
                <ToggleRow
                  id="blocage-clic-droit"
                  label="Blocage du clic droit"
                  description="Désactive le menu contextuel du clic droit pour empêcher l'inspection et la copie"
                  checked={settings.blocageClicDroit}
                  onCheckedChange={(v) => updateField('blocageClicDroit', v)}
                  icon={MousePointerClick}
                />
                <ToggleRow
                  id="blocage-impression"
                  label="Blocage de l'impression écran"
                  description="Bloque les touches d'impression écran (PrtScn) et les raccourcis de capture système"
                  checked={settings.blocageImpression}
                  onCheckedChange={(v) => updateField('blocageImpression', v)}
                  icon={Printer}
                />
                <ToggleRow
                  id="verification-identite"
                  label="Vérification d'identité"
                  description="Exige une vérification d'identité (photo ou pièce d'identité) avant le début de l'évaluation"
                  checked={settings.verificationIdentite}
                  onCheckedChange={(v) => updateField('verificationIdentite', v)}
                  icon={UserCheck}
                />
              </CardContent>
            </Card>

            {/* ─── Section C: Seuils & Alertes ─── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-400">
                    <BellRing className="h-4 w-4" />
                  </div>
                  Seuils & Alertes
                </CardTitle>
                <CardDescription>
                  Configurez les seuils de tolérance et les actions automatiques en cas de violation
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <SliderRow
                  id="temps-inactivite-max"
                  label="Temps d'inactivité max"
                  description="Durée maximale d'inactivité avant déclenchement d'une alerte (en secondes)"
                  value={settings.tempsInactiviteMax}
                  onValueChange={(v) => updateField('tempsInactiviteMax', v)}
                  min={30}
                  max={300}
                  step={10}
                  formatValue={(v) => `${v}s`}
                  icon={Timer}
                />
                <SliderRow
                  id="nb-onglets-max"
                  label="Nb changements onglet max"
                  description="Nombre maximal de changements d'onglet autorisés avant déclenchement d'une alerte"
                  value={settings.nbOngletsMax}
                  onValueChange={(v) => updateField('nbOngletsMax', v)}
                  min={1}
                  max={10}
                  step={1}
                  icon={AppWindow}
                />
                <SliderRow
                  id="nb-alertes-max"
                  label="Nb alertes max avant soumission auto"
                  description="Nombre d'alertes cumulées déclenchant la soumission automatique de l'évaluation"
                  value={settings.nbAlertesMax}
                  onValueChange={(v) => updateField('nbAlertesMax', v)}
                  min={1}
                  max={15}
                  step={1}
                  icon={AlertTriangle}
                />
                <ToggleRow
                  id="auto-submit-violation"
                  label="Soumission automatique en cas de violation"
                  description="Soumet automatiquement l'évaluation lorsque le nombre maximal d'alertes est atteint"
                  checked={settings.autoSubmitOnViolation}
                  onCheckedChange={(v) => updateField('autoSubmitOnViolation', v)}
                  icon={Send}
                />
              </CardContent>
            </Card>

            {/* ─── Section D: Analyse & Rapports ─── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-100 text-cyan-600 dark:bg-cyan-900/50 dark:text-cyan-400">
                    <BarChart3 className="h-4 w-4" />
                  </div>
                  Analyse & Rapports
                </CardTitle>
                <CardDescription>
                  Paramètres d&apos;analyse de similarité et de génération de rapports de fraude
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ToggleRow
                  id="rapport-fraude"
                  label="Rapport de fraude"
                  description="Génère un rapport détaillé des comportements suspects pour chaque session d'évaluation"
                  checked={settings.rapportFraude}
                  onCheckedChange={(v) => updateField('rapportFraude', v)}
                  icon={FileSearch}
                />
                <SliderRow
                  id="seuil-similarite"
                  label="Seuil de similarité"
                  description="Seuil de similarité pour la détection de copie entre les réponses des étudiants (0.50 = tolérant, 1.00 = strict)"
                  value={settings.seuilSimilarite}
                  onValueChange={(v) => updateField('seuilSimilarite', v)}
                  min={0.5}
                  max={1.0}
                  step={0.05}
                  formatValue={(v) => v.toFixed(2)}
                  icon={ClipboardCheck}
                />

                {/* Similarity explanation */}
                <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-4 dark:border-cyan-800 dark:bg-cyan-950/30">
                  <h4 className="text-sm font-semibold text-cyan-800 dark:text-cyan-300 mb-2 flex items-center gap-2">
                    <FileSearch className="h-4 w-4" />
                    Interprétation du seuil de similarité
                  </h4>
                  <ul className="text-sm text-cyan-700 dark:text-cyan-400 space-y-1">
                    <li>• <strong>0.50 – 0.65</strong> : Tolérant — détecte les similarités évidentes uniquement</li>
                    <li>• <strong>0.70 – 0.85</strong> : Équilibré — bon compromis entre faux positifs et détection</li>
                    <li>• <strong>0.90 – 1.00</strong> : Strict — signale les réponses très similaires uniquement</li>
                  </ul>
                  <p className="mt-2 text-xs text-cyan-600 dark:text-cyan-500">
                    Seuil actuel : <strong>{settings.seuilSimilarite.toFixed(2)}</strong> — {
                      settings.seuilSimilarite < 0.7 ? 'Tolérant' :
                      settings.seuilSimilarite < 0.9 ? 'Équilibré' : 'Strict'
                    }
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* ─── Save Button ─── */}
            <div className="flex justify-end">
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 min-w-[180px]"
                onClick={handleSave}
                disabled={saving}
                size="lg"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Sauvegarder
              </Button>
            </div>
          </div>
        )}

        {/* ─── No selection message ─── */}
        {!loadingSettings && !selectedEtablissementId && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Settings2 className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground">Aucun établissement sélectionné</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                Choisissez un établissement ci-dessus pour configurer ses paramètres de sécurité anti-fraude.
              </p>
            </CardContent>
          </Card>
        )}

        {/* ─── All Establishments Overview Table ─── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5 text-emerald-600" />
              Vue d&apos;ensemble des établissements
            </CardTitle>
            <CardDescription>
              Aperçu rapide des paramètres de sécurité de tous les établissements
            </CardDescription>
          </CardHeader>
          <CardContent>
            {allSettings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Shield className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">
                  Aucun paramètre de sécurité configuré. Sélectionnez un établissement pour commencer.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Établissement</TableHead>
                      <TableHead className="text-center">Proctoring</TableHead>
                      <TableHead className="text-center">Vérif. identité</TableHead>
                      <TableHead className="text-center">Blocage copie</TableHead>
                      <TableHead className="text-center">Seuil similarité</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allSettings.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">
                          <div className="flex flex-col">
                            <span>{s.etablissement?.nom || '—'}</span>
                            {s.etablissement?.ville && (
                              <span className="text-xs text-muted-foreground">{s.etablissement.ville}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                {s.proctoringActif ? (
                                  <CheckCircle2 className="h-5 w-5 text-emerald-500 inline-block" />
                                ) : (
                                  <XCircle className="h-5 w-5 text-muted-foreground/40 inline-block" />
                                )}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {s.proctoringActif ? 'Proctoring activé' : 'Proctoring désactivé'}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="text-center">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                {s.verificationIdentite ? (
                                  <CheckCircle2 className="h-5 w-5 text-teal-500 inline-block" />
                                ) : (
                                  <XCircle className="h-5 w-5 text-muted-foreground/40 inline-block" />
                                )}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {s.verificationIdentite ? 'Vérification activée' : 'Vérification désactivée'}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="text-center">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                {s.blocageCopie ? (
                                  <CheckCircle2 className="h-5 w-5 text-amber-500 inline-block" />
                                ) : (
                                  <XCircle className="h-5 w-5 text-muted-foreground/40 inline-block" />
                                )}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {s.blocageCopie ? 'Blocage activé' : 'Blocage désactivé'}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="font-mono text-xs">
                            {s.seuilSimilarite.toFixed(2)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSelectFromTable(s.etablissementId)}
                            className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                          >
                            <Settings2 className="h-4 w-4 mr-1" />
                            Configurer
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  )
}
