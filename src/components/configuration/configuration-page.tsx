'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Settings,
  Save,
  Shield,
  Bell,
  Sparkles,
  Globe,
  Lock,
  Thermometer,
  FileText,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { useNavigationStore } from '@/stores/navigation-store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

// ─── Config types (mapped from the API settings object) ───

interface GeneralConfig {
  siteName: string
  siteDescription: string
  maintenanceMode: boolean
  registrationOpen: boolean
  contactEmail: string
  helpUrl: string
  legalNoticeUrl: string
  privacyPolicyUrl: string
}

interface SecurityConfig {
  maxUploadSizeMB: number
  allowedFileTypes: string[]
  proctoringEnabled: boolean
}

interface NotificationConfig {
  emailNotifications: boolean
  defaultPlanType: string
}

interface IAConfig {
  aiGenerationEnabled: boolean
  aiCorrectionEnabled: boolean
}

interface AppConfig {
  general: GeneralConfig
  security: SecurityConfig
  notifications: NotificationConfig
  ia: IAConfig
}

// ─── Default config (fallback) ───

const DEFAULT_CONFIG: AppConfig = {
  general: {
    siteName: 'SECT',
    siteDescription: "Système d'Évaluation et de Contrôle des Tests",
    maintenanceMode: false,
    registrationOpen: true,
    contactEmail: 'contact@sect.fr',
    helpUrl: '',
    legalNoticeUrl: '',
    privacyPolicyUrl: '',
  },
  security: {
    maxUploadSizeMB: 50,
    allowedFileTypes: ['pdf', 'docx', 'txt', 'csv'],
    proctoringEnabled: false,
  },
  notifications: {
    emailNotifications: true,
    defaultPlanType: 'GRATUIT',
  },
  ia: {
    aiGenerationEnabled: true,
    aiCorrectionEnabled: false,
  },
}

// ─── Map flat API settings to tabbed AppConfig ───

function mapApiToConfig(apiSettings: Record<string, unknown>): AppConfig {
  return {
    general: {
      siteName: (apiSettings.siteName as string) ?? DEFAULT_CONFIG.general.siteName,
      siteDescription: (apiSettings.siteDescription as string) ?? DEFAULT_CONFIG.general.siteDescription,
      maintenanceMode: (apiSettings.maintenanceMode as boolean) ?? DEFAULT_CONFIG.general.maintenanceMode,
      registrationOpen: (apiSettings.registrationOpen as boolean) ?? DEFAULT_CONFIG.general.registrationOpen,
      contactEmail: (apiSettings.contactEmail as string) ?? DEFAULT_CONFIG.general.contactEmail,
      helpUrl: (apiSettings.helpUrl as string) ?? DEFAULT_CONFIG.general.helpUrl,
      legalNoticeUrl: (apiSettings.legalNoticeUrl as string) ?? DEFAULT_CONFIG.general.legalNoticeUrl,
      privacyPolicyUrl: (apiSettings.privacyPolicyUrl as string) ?? DEFAULT_CONFIG.general.privacyPolicyUrl,
    },
    security: {
      maxUploadSizeMB: (apiSettings.maxUploadSizeMB as number) ?? DEFAULT_CONFIG.security.maxUploadSizeMB,
      allowedFileTypes: (apiSettings.allowedFileTypes as string[]) ?? DEFAULT_CONFIG.security.allowedFileTypes,
      proctoringEnabled: (apiSettings.proctoringEnabled as boolean) ?? DEFAULT_CONFIG.security.proctoringEnabled,
    },
    notifications: {
      emailNotifications: (apiSettings.emailNotifications as boolean) ?? DEFAULT_CONFIG.notifications.emailNotifications,
      defaultPlanType: (apiSettings.defaultPlanType as string) ?? DEFAULT_CONFIG.notifications.defaultPlanType,
    },
    ia: {
      aiGenerationEnabled: (apiSettings.aiGenerationEnabled as boolean) ?? DEFAULT_CONFIG.ia.aiGenerationEnabled,
      aiCorrectionEnabled: (apiSettings.aiCorrectionEnabled as boolean) ?? DEFAULT_CONFIG.ia.aiCorrectionEnabled,
    },
  }
}

// ─── Map tabbed AppConfig back to flat API object ───

function mapConfigToApi(config: AppConfig): Record<string, unknown> {
  return {
    ...config.general,
    ...config.security,
    ...config.notifications,
    ...config.ia,
  }
}

// ─── Main Component ───

export function ConfigurationPage() {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG)
  const [savingTab, setSavingTab] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // ─── Fetch settings on mount ───

  const fetchSettings = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/platform-settings', { headers: getAuthHeaders() })
      if (!res.ok) throw new Error('Erreur réseau')
      const data = await res.json()
      const settings = data.settings ?? {}
      setConfig(mapApiToConfig(settings))
    } catch {
      setLoadError('Impossible de charger la configuration. Vérifiez votre connexion.')
      toast.error('Erreur de chargement', {
        description: 'Impossible de récupérer les paramètres de la plateforme.',
      })
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  // ─── Save handler (generic) ───

  const handleSave = async (tab: string) => {
    setSavingTab(tab)
    try {
      const flatSettings = mapConfigToApi(config)
      const res = await fetch('/api/platform-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(flatSettings),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la sauvegarde')
      }
      toast.success('Configuration sauvegardée', {
        description: `Les paramètres ${tab === 'general' ? 'généraux' : tab === 'security' ? 'de sécurité' : tab === 'notifications' ? 'de notifications' : 'IA'} ont été mis à jour.`,
      })
    } catch (err) {
      toast.error('Erreur de sauvegarde', {
        description: err instanceof Error ? err.message : 'Une erreur est survenue.',
      })
    } finally {
      setSavingTab(null)
    }
  }

  // ─── Loading state ───

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-9 w-64 mb-2" />
          <Skeleton className="h-5 w-96" />
        </div>
        <Skeleton className="h-10 w-full" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── Error state ───

  if (loadError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
            <Settings className="h-7 w-7 text-emerald-600" />
            Configuration du Système
          </h1>
        </div>
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <p className="text-lg font-semibold text-destructive mb-2">Erreur de chargement</p>
            <p className="text-sm text-muted-foreground mb-4">{loadError}</p>
            <Button variant="outline" onClick={fetchSettings}>
              <Loader2 className="h-4 w-4 mr-2" />
              Réessayer
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
          <Settings className="h-7 w-7 text-emerald-600" />
          Configuration du Système
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paramétrer le fonctionnement de la plateforme
        </p>
      </div>

      {/* ─── Tabs ─── */}
      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="general" className="gap-1.5">
            <Globe className="h-4 w-4 hidden sm:block" />
            Général
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5">
            <Shield className="h-4 w-4 hidden sm:block" />
            Sécurité
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5">
            <Bell className="h-4 w-4 hidden sm:block" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="ia" className="gap-1.5">
            <Sparkles className="h-4 w-4 hidden sm:block" />
            IA
          </TabsTrigger>
        </TabsList>

        {/* ─── Tab: Général ─── */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-emerald-600" />
                Paramètres généraux
              </CardTitle>
              <CardDescription>
                Configuration de base de la plateforme
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="cfg-site-name">Nom du site</Label>
                <Input
                  id="cfg-site-name"
                  value={config.general.siteName}
                  onChange={(e) => setConfig({
                    ...config,
                    general: { ...config.general, siteName: e.target.value },
                  })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cfg-description">Description</Label>
                <Textarea
                  id="cfg-description"
                  value={config.general.siteDescription}
                  onChange={(e) => setConfig({
                    ...config,
                    general: { ...config.general, siteDescription: e.target.value },
                  })}
                  rows={3}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="cfg-maintenance">Mode maintenance</Label>
                  <p className="text-sm text-muted-foreground">
                    Désactive l&apos;accès à la plateforme pour les utilisateurs non-admin
                  </p>
                </div>
                <Switch
                  id="cfg-maintenance"
                  checked={config.general.maintenanceMode}
                  onCheckedChange={(checked) => setConfig({
                    ...config,
                    general: { ...config.general, maintenanceMode: checked },
                  })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="cfg-registration">Inscriptions ouvertes</Label>
                  <p className="text-sm text-muted-foreground">
                    Permettre aux nouveaux utilisateurs de s&apos;inscrire
                  </p>
                </div>
                <Switch
                  id="cfg-registration"
                  checked={config.general.registrationOpen}
                  onCheckedChange={(checked) => setConfig({
                    ...config,
                    general: { ...config.general, registrationOpen: checked },
                  })}
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="cfg-contact-email">Email de contact</Label>
                <Input
                  id="cfg-contact-email"
                  type="email"
                  value={config.general.contactEmail}
                  onChange={(e) => setConfig({
                    ...config,
                    general: { ...config.general, contactEmail: e.target.value },
                  })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cfg-help-url">URL de l&apos;aide</Label>
                <Input
                  id="cfg-help-url"
                  placeholder="https://help.sect.fr"
                  value={config.general.helpUrl}
                  onChange={(e) => setConfig({
                    ...config,
                    general: { ...config.general, helpUrl: e.target.value },
                  })}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cfg-legal-url">URL mentions légales</Label>
                  <Input
                    id="cfg-legal-url"
                    placeholder="https://sect.fr/legal"
                    value={config.general.legalNoticeUrl}
                    onChange={(e) => setConfig({
                      ...config,
                      general: { ...config.general, legalNoticeUrl: e.target.value },
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cfg-privacy-url">URL politique de confidentialité</Label>
                  <Input
                    id="cfg-privacy-url"
                    placeholder="https://sect.fr/privacy"
                    value={config.general.privacyPolicyUrl}
                    onChange={(e) => setConfig({
                      ...config,
                      general: { ...config.general, privacyPolicyUrl: e.target.value },
                    })}
                  />
                </div>
              </div>

              <Separator />

              <div className="flex justify-end">
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => handleSave('general')}
                  disabled={savingTab === 'general'}
                >
                  {savingTab === 'general' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Save className="h-4 w-4 mr-2" />
                  Sauvegarder
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Tab: Sécurité ─── */}
        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-emerald-600" />
                Paramètres de sécurité
              </CardTitle>
              <CardDescription>
                Configurer les règles de sécurité et le contrôle d&apos;accès
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="cfg-max-upload">Taille maximale des fichiers (MB)</Label>
                <Input
                  id="cfg-max-upload"
                  type="number"
                  min={1}
                  max={500}
                  value={config.security.maxUploadSizeMB}
                  onChange={(e) => setConfig({
                    ...config,
                    security: { ...config.security, maxUploadSizeMB: parseInt(e.target.value) || 50 },
                  })}
                />
                <p className="text-xs text-muted-foreground">
                  Limite de taille pour les fichiers téléversés sur la plateforme
                </p>
              </div>

              <div className="space-y-2">
                <Label>Types de fichiers autorisés</Label>
                <div className="flex flex-wrap gap-2">
                  {['pdf', 'docx', 'txt', 'csv', 'xlsx', 'png', 'jpg', 'jpeg'].map((ft) => {
                    const isSelected = config.security.allowedFileTypes.includes(ft)
                    return (
                      <button
                        key={ft}
                        type="button"
                        onClick={() => {
                          const updated = isSelected
                            ? config.security.allowedFileTypes.filter((t) => t !== ft)
                            : [...config.security.allowedFileTypes, ft]
                          setConfig({
                            ...config,
                            security: { ...config.security, allowedFileTypes: updated },
                          })
                        }}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                          isSelected
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700'
                            : 'bg-muted text-muted-foreground border-border hover:bg-accent'
                        }`}
                      >
                        {ft}
                      </button>
                    )
                  })}
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="cfg-proctoring">Surveillance des examens (Proctoring)</Label>
                  <p className="text-sm text-muted-foreground">
                    Activer la surveillance anti-fraude pendant les examens en ligne
                  </p>
                </div>
                <Switch
                  id="cfg-proctoring"
                  checked={config.security.proctoringEnabled}
                  onCheckedChange={(checked) => setConfig({
                    ...config,
                    security: { ...config.security, proctoringEnabled: checked },
                  })}
                />
              </div>

              {/* Security summary */}
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
                <h4 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 mb-2 flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Résumé de la configuration sécurité
                </h4>
                <ul className="text-sm text-emerald-700 dark:text-emerald-400 space-y-1">
                  <li>• Taille max fichiers : {config.security.maxUploadSizeMB} MB</li>
                  <li>• Types autorisés : {config.security.allowedFileTypes.join(', ')}</li>
                  <li>• Proctoring : {config.security.proctoringEnabled ? 'Activé' : 'Désactivé'}</li>
                </ul>
              </div>

              <Separator />

              <div className="flex justify-end">
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => handleSave('security')}
                  disabled={savingTab === 'security'}
                >
                  {savingTab === 'security' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Save className="h-4 w-4 mr-2" />
                  Sauvegarder
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Tab: Notifications ─── */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-emerald-600" />
                Paramètres de notifications
              </CardTitle>
              <CardDescription>
                Configurer les alertes et les notifications par email
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="cfg-email-notif">Notifications par email</Label>
                  <p className="text-sm text-muted-foreground">
                    Activer l&apos;envoi de notifications par email pour les événements importants
                  </p>
                </div>
                <Switch
                  id="cfg-email-notif"
                  checked={config.notifications.emailNotifications}
                  onCheckedChange={(checked) => setConfig({
                    ...config,
                    notifications: { ...config.notifications, emailNotifications: checked },
                  })}
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="cfg-default-plan">Plan par défaut</Label>
                <Select
                  value={config.notifications.defaultPlanType}
                  onValueChange={(val) => setConfig({
                    ...config,
                    notifications: { ...config.notifications, defaultPlanType: val },
                  })}
                >
                  <SelectTrigger id="cfg-default-plan">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GRATUIT">Gratuit</SelectItem>
                    <SelectItem value="ESSENTIEL">Essentiel</SelectItem>
                    <SelectItem value="PROFESSIONNEL">Professionnel</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Plan attribué par défaut lors de l&apos;inscription d&apos;un nouvel établissement
                </p>
              </div>

              <Separator />

              <div className="flex justify-end">
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => handleSave('notifications')}
                  disabled={savingTab === 'notifications'}
                >
                  {savingTab === 'notifications' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Save className="h-4 w-4 mr-2" />
                  Sauvegarder
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Tab: IA ─── */}
        <TabsContent value="ia">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-emerald-600" />
                Paramètres IA
              </CardTitle>
              <CardDescription>
                Configurer les fonctionnalités d&apos;intelligence artificielle
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Link to AI Providers page */}
              <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 dark:border-violet-800 dark:bg-violet-950/30">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-violet-800 dark:text-violet-300 flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      Fournisseurs IA
                    </h4>
                    <p className="text-xs text-violet-700 dark:text-violet-400">
                      Configurez vos fournisseurs d&apos;IA (OpenAI, Anthropic, Groq, Z-AI...) et changez le fournisseur actif
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-violet-300 text-violet-700 hover:bg-violet-100 dark:border-violet-700 dark:text-violet-400 dark:hover:bg-violet-950/50"
                    onClick={() => useNavigationStore.getState().setCurrentPage('ai-providers')}
                  >
                    <Sparkles className="h-4 w-4 mr-1" />
                    Configurer
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="cfg-ai-gen">Génération IA de questions</Label>
                  <p className="text-sm text-muted-foreground">
                    Permettre la génération automatique de questions par l&apos;IA à partir de documents
                  </p>
                </div>
                <Switch
                  id="cfg-ai-gen"
                  checked={config.ia.aiGenerationEnabled}
                  onCheckedChange={(checked) => setConfig({
                    ...config,
                    ia: { ...config.ia, aiGenerationEnabled: checked },
                  })}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="cfg-ai-correction">Correction IA automatique</Label>
                  <p className="text-sm text-muted-foreground">
                    Permettre la correction automatique des copies par l&apos;IA
                  </p>
                </div>
                <Switch
                  id="cfg-ai-correction"
                  checked={config.ia.aiCorrectionEnabled}
                  onCheckedChange={(checked) => setConfig({
                    ...config,
                    ia: { ...config.ia, aiCorrectionEnabled: checked },
                  })}
                />
              </div>

              {/* IA Summary */}
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
                <h4 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Résumé de la configuration IA
                </h4>
                <ul className="text-sm text-emerald-700 dark:text-emerald-400 space-y-1">
                  <li>• Génération de questions : {config.ia.aiGenerationEnabled ? 'Activée' : 'Désactivée'}</li>
                  <li>• Correction automatique : {config.ia.aiCorrectionEnabled ? 'Activée' : 'Désactivée'}</li>
                </ul>
              </div>

              <Separator />

              <div className="flex justify-end">
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => handleSave('ia')}
                  disabled={savingTab === 'ia'}
                >
                  {savingTab === 'ia' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Save className="h-4 w-4 mr-2" />
                  Sauvegarder
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
