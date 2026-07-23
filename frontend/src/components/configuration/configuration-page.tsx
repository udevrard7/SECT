'use client'

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
import { useRouter } from 'next/navigation'
import { PAGE_ROUTES } from '@/lib/routes'
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
import { PulseSkeleton } from '@/components/ds'
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
  // CONFIG-FRONTEND-EXTEND : paramètres de localisation / identité plateforme
  devise: string
  paysDefault: string
  langueDefault: string
  timezoneDefault: string
  logoUrl: string
  maxEtablissements: number
}

interface SecurityConfig {
  maxUploadSizeMB: number
  allowedFileTypes: string[]
  proctoringEnabled: boolean
  // CONFIG-FRONTEND-EXTEND : politiques de mot de passe / session / audit
  passwordMinLength: number
  passwordRequireSpecial: boolean
  sessionTimeoutMinutes: number
  maxConcurrentSessions: number
  auditLogRetentionDays: number
  dataExportEnabled: boolean
}

interface NotificationConfig {
  emailNotifications: boolean
  defaultPlanType: string
  // CONFIG-FRONTEND-EXTEND : SMTP + types de notifications administrateur
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpFromEmail: string
  notifNewUserAdmin: boolean
  notifPaymentAdmin: boolean
  notifSecurityAlerts: boolean
  notifExamReminder: boolean
  pushNotificationsEnabled: boolean
}

interface IAConfig {
  aiGenerationEnabled: boolean
  aiCorrectionEnabled: boolean
  // CONFIG-FRONTEND-EXTEND : quotas / paramètres modèles IA
  aiMaxRequestsPerDay: number
  aiTemperature: number
  aiMaxTokens: number
  aiFailoverEnabled: boolean
  aiGradingConfidenceThreshold: number
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
    // CONFIG-FRONTEND-EXTEND
    devise: 'XOF',
    paysDefault: "Côte d'Ivoire",
    langueDefault: 'fr',
    timezoneDefault: 'Africa/Abidjan',
    logoUrl: '',
    maxEtablissements: 1000,
  },
  security: {
    maxUploadSizeMB: 50,
    allowedFileTypes: ['pdf', 'docx', 'txt', 'csv'],
    proctoringEnabled: false,
    // CONFIG-FRONTEND-EXTEND
    passwordMinLength: 8,
    passwordRequireSpecial: true,
    sessionTimeoutMinutes: 30,
    maxConcurrentSessions: 3,
    auditLogRetentionDays: 90,
    dataExportEnabled: true,
  },
  notifications: {
    emailNotifications: true,
    defaultPlanType: 'GRATUIT',
    // CONFIG-FRONTEND-EXTEND
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpFromEmail: '',
    notifNewUserAdmin: true,
    notifPaymentAdmin: true,
    notifSecurityAlerts: true,
    notifExamReminder: true,
    pushNotificationsEnabled: true,
  },
  ia: {
    aiGenerationEnabled: true,
    aiCorrectionEnabled: false,
    // CONFIG-FRONTEND-EXTEND
    aiMaxRequestsPerDay: 100,
    aiTemperature: 0.7,
    aiMaxTokens: 2000,
    aiFailoverEnabled: true,
    aiGradingConfidenceThreshold: 0.8,
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
      // CONFIG-FRONTEND-EXTEND
      devise: (apiSettings.devise as string) ?? DEFAULT_CONFIG.general.devise,
      paysDefault: (apiSettings.paysDefault as string) ?? DEFAULT_CONFIG.general.paysDefault,
      langueDefault: (apiSettings.langueDefault as string) ?? DEFAULT_CONFIG.general.langueDefault,
      timezoneDefault: (apiSettings.timezoneDefault as string) ?? DEFAULT_CONFIG.general.timezoneDefault,
      logoUrl: (apiSettings.logoUrl as string) ?? DEFAULT_CONFIG.general.logoUrl,
      maxEtablissements: (apiSettings.maxEtablissements as number) ?? DEFAULT_CONFIG.general.maxEtablissements,
    },
    security: {
      // C3 (CONFIG-FRONTEND-EXTEND) : la DB a été re-seedée avec maxUploadSizeMB,
      // mais on conserve un fallback sur l'ancien nom maxFileUploadMB pour robustesse.
      maxUploadSizeMB: (apiSettings.maxUploadSizeMB as number) ?? (apiSettings.maxFileUploadMB as number) ?? DEFAULT_CONFIG.security.maxUploadSizeMB,
      allowedFileTypes: (apiSettings.allowedFileTypes as string[]) ?? DEFAULT_CONFIG.security.allowedFileTypes,
      proctoringEnabled: (apiSettings.proctoringEnabled as boolean) ?? DEFAULT_CONFIG.security.proctoringEnabled,
      // CONFIG-FRONTEND-EXTEND
      passwordMinLength: (apiSettings.passwordMinLength as number) ?? DEFAULT_CONFIG.security.passwordMinLength,
      passwordRequireSpecial: (apiSettings.passwordRequireSpecial as boolean) ?? DEFAULT_CONFIG.security.passwordRequireSpecial,
      sessionTimeoutMinutes: (apiSettings.sessionTimeoutMinutes as number) ?? DEFAULT_CONFIG.security.sessionTimeoutMinutes,
      maxConcurrentSessions: (apiSettings.maxConcurrentSessions as number) ?? DEFAULT_CONFIG.security.maxConcurrentSessions,
      auditLogRetentionDays: (apiSettings.auditLogRetentionDays as number) ?? DEFAULT_CONFIG.security.auditLogRetentionDays,
      dataExportEnabled: (apiSettings.dataExportEnabled as boolean) ?? DEFAULT_CONFIG.security.dataExportEnabled,
    },
    notifications: {
      emailNotifications: (apiSettings.emailNotifications as boolean) ?? DEFAULT_CONFIG.notifications.emailNotifications,
      defaultPlanType: (apiSettings.defaultPlanType as string) ?? DEFAULT_CONFIG.notifications.defaultPlanType,
      // CONFIG-FRONTEND-EXTEND
      smtpHost: (apiSettings.smtpHost as string) ?? DEFAULT_CONFIG.notifications.smtpHost,
      smtpPort: (apiSettings.smtpPort as number) ?? DEFAULT_CONFIG.notifications.smtpPort,
      smtpUser: (apiSettings.smtpUser as string) ?? DEFAULT_CONFIG.notifications.smtpUser,
      smtpFromEmail: (apiSettings.smtpFromEmail as string) ?? DEFAULT_CONFIG.notifications.smtpFromEmail,
      notifNewUserAdmin: (apiSettings.notifNewUserAdmin as boolean) ?? DEFAULT_CONFIG.notifications.notifNewUserAdmin,
      notifPaymentAdmin: (apiSettings.notifPaymentAdmin as boolean) ?? DEFAULT_CONFIG.notifications.notifPaymentAdmin,
      notifSecurityAlerts: (apiSettings.notifSecurityAlerts as boolean) ?? DEFAULT_CONFIG.notifications.notifSecurityAlerts,
      notifExamReminder: (apiSettings.notifExamReminder as boolean) ?? DEFAULT_CONFIG.notifications.notifExamReminder,
      pushNotificationsEnabled: (apiSettings.pushNotificationsEnabled as boolean) ?? DEFAULT_CONFIG.notifications.pushNotificationsEnabled,
    },
    ia: {
      aiGenerationEnabled: (apiSettings.aiGenerationEnabled as boolean) ?? DEFAULT_CONFIG.ia.aiGenerationEnabled,
      aiCorrectionEnabled: (apiSettings.aiCorrectionEnabled as boolean) ?? DEFAULT_CONFIG.ia.aiCorrectionEnabled,
      // CONFIG-FRONTEND-EXTEND
      aiMaxRequestsPerDay: (apiSettings.aiMaxRequestsPerDay as number) ?? DEFAULT_CONFIG.ia.aiMaxRequestsPerDay,
      aiTemperature: (apiSettings.aiTemperature as number) ?? DEFAULT_CONFIG.ia.aiTemperature,
      aiMaxTokens: (apiSettings.aiMaxTokens as number) ?? DEFAULT_CONFIG.ia.aiMaxTokens,
      aiFailoverEnabled: (apiSettings.aiFailoverEnabled as boolean) ?? DEFAULT_CONFIG.ia.aiFailoverEnabled,
      aiGradingConfidenceThreshold: (apiSettings.aiGradingConfidenceThreshold as number) ?? DEFAULT_CONFIG.ia.aiGradingConfidenceThreshold,
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
  const router = useRouter()
  const queryClient = useQueryClient()
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG)
  const [savingTab, setSavingTab] = useState<string | null>(null)

  // ─── Fetch settings (TanStack Query) ───
  // BUGFIX (QUERY-CACHE-2) : migration de useEffect+fetch vers TanStack Query.
  // config est éditable localement (forms) → sync via useEffect query.data → setConfig
  // (pattern approuvé : sync de données externes vers state local pour édition).
  const settingsQuery = useQuery<{ settings: Record<string, unknown> }>({
    queryKey: ['platform-settings'],
    queryFn: async () => {
      const res = await fetch('/api/platform-settings')
      if (!res.ok) throw new Error('Erreur réseau')
      const data = await res.json()
      return { settings: data.settings ?? {} }
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  // Sync query.data → config (pour édition de form)
  useEffect(() => {
    if (settingsQuery.data) {
      setConfig(mapApiToConfig(settingsQuery.data.settings))
    }
  }, [settingsQuery.data])

  // Toast sur erreur (préserve le comportement du catch original)
  useEffect(() => {
    if (settingsQuery.error) {
      toast.error('Erreur de chargement', {
        description: 'Impossible de récupérer les paramètres de la plateforme.',
      })
    }
  }, [settingsQuery.error])

  const isLoading = settingsQuery.isLoading
  const loadError = settingsQuery.error ? 'Impossible de charger la configuration. Vérifiez votre connexion.' : null
  const refreshSettings = () => queryClient.invalidateQueries({ queryKey: ['platform-settings'] })

  // ─── Save handler (generic) ───

  const handleSave = async (tab: string) => {
    setSavingTab(tab)
    try {
      const flatSettings = mapConfigToApi(config)
      const res = await fetch('/api/platform-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        <div className="space-y-2">
          <PulseSkeleton className="h-9 w-64" />
          <PulseSkeleton className="h-5 w-96" />
        </div>
        <PulseSkeleton className="h-10 w-full" />
        <Card>
          <CardHeader>
            <PulseSkeleton className="h-6 w-48" />
            <PulseSkeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <PulseSkeleton className="h-4 w-32" />
                <PulseSkeleton className="h-10 w-full" />
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
        <div className="ds-kente-pattern -mx-4 -mt-4 rounded-lg px-4 py-4 sm:-mx-6 sm:px-6">
          <h1 className="text-2xl font-display font-bold tracking-tight md:text-3xl flex items-center gap-2">
            <Settings className="h-7 w-7 text-destructive" />
            Paramètres Plateforme
          </h1>
        </div>
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <p className="text-lg font-display font-semibold text-destructive mb-2">Erreur de chargement</p>
            <p className="text-sm text-muted-foreground mb-4">{loadError}</p>
            <Button variant="outline" onClick={refreshSettings}>
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
      <div className="ds-kente-pattern -mx-4 -mt-4 rounded-lg px-4 py-4 sm:-mx-6 sm:px-6">
        <h1 className="text-2xl font-display font-bold tracking-tight md:text-3xl flex items-center gap-2">
          <Settings className="h-7 w-7 text-destructive" />
          Paramètres Plateforme
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configuration globale de la plateforme SaaS — réservée à l&apos;administrateur
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
              <CardTitle className="flex items-center gap-2 font-display tracking-tight">
                <Globe className="h-5 w-5 text-success-text" />
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

              {/* CONFIG-FRONTEND-EXTEND : localisation / identité plateforme */}
              <div className="space-y-2">
                <Label htmlFor="cfg-devise">Devise</Label>
                <Select
                  value={config.general.devise}
                  onValueChange={(val) => setConfig({
                    ...config,
                    general: { ...config.general, devise: val },
                  })}
                >
                  <SelectTrigger id="cfg-devise">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="XOF">XOF (Franc CFA)</SelectItem>
                    <SelectItem value="EUR">EUR (Euro)</SelectItem>
                    <SelectItem value="USD">USD (Dollar US)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Devise utilisée par défaut pour les abonnements et la facturation
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cfg-pays">Pays par défaut</Label>
                  <Input
                    id="cfg-pays"
                    placeholder="Côte d'Ivoire"
                    value={config.general.paysDefault}
                    onChange={(e) => setConfig({
                      ...config,
                      general: { ...config.general, paysDefault: e.target.value },
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cfg-langue">Langue par défaut</Label>
                  <Select
                    value={config.general.langueDefault}
                    onValueChange={(val) => setConfig({
                      ...config,
                      general: { ...config.general, langueDefault: val },
                    })}
                  >
                    <SelectTrigger id="cfg-langue">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fr">Français</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cfg-timezone">Timezone par défaut</Label>
                <Select
                  value={config.general.timezoneDefault}
                  onValueChange={(val) => setConfig({
                    ...config,
                    general: { ...config.general, timezoneDefault: val },
                  })}
                >
                  <SelectTrigger id="cfg-timezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Africa/Abidjan">Africa/Abidjan (GMT+0)</SelectItem>
                    <SelectItem value="Africa/Accra">Africa/Accra (GMT+0)</SelectItem>
                    <SelectItem value="Africa/Dakar">Africa/Dakar (GMT+0)</SelectItem>
                    <SelectItem value="Africa/Bamako">Africa/Bamako (GMT+0)</SelectItem>
                    <SelectItem value="Africa/Lagos">Africa/Lagos (GMT+1)</SelectItem>
                    <SelectItem value="Africa/Douala">Africa/Douala (GMT+1)</SelectItem>
                    <SelectItem value="Africa/Casablanca">Africa/Casablanca (GMT+1)</SelectItem>
                    <SelectItem value="Europe/Paris">Europe/Paris (GMT+1)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Fuseau horaire par défaut pour les sessions et notifications
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cfg-logo-url">URL du logo</Label>
                <Input
                  id="cfg-logo-url"
                  type="url"
                  placeholder="https://..."
                  value={config.general.logoUrl}
                  onChange={(e) => setConfig({
                    ...config,
                    general: { ...config.general, logoUrl: e.target.value },
                  })}
                />
                <p className="text-xs text-muted-foreground">
                  URL publique du logo affiché dans les en-têtes et exports PDF
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cfg-max-etablissements">Nombre maximum d&apos;établissements</Label>
                <Input
                  id="cfg-max-etablissements"
                  type="number"
                  min={1}
                  max={100000}
                  value={config.general.maxEtablissements}
                  onChange={(e) => setConfig({
                    ...config,
                    general: { ...config.general, maxEtablissements: parseInt(e.target.value) || 1000 },
                  })}
                />
                <p className="text-xs text-muted-foreground">
                  Limite globale d&apos;établissements activables sur la plateforme
                </p>
              </div>

              <Separator />

              <div className="flex justify-end">
                <Button
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
              <CardTitle className="flex items-center gap-2 font-display tracking-tight">
                <Shield className="h-5 w-5 text-success-text" />
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
                            ? 'bg-success/15 text-success-text border-success/40'
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

              <Separator />

              {/* CONFIG-FRONTEND-EXTEND : politiques de mot de passe / session / audit */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cfg-password-min-length">Mot de passe — longueur minimale</Label>
                  <Input
                    id="cfg-password-min-length"
                    type="number"
                    min={6}
                    max={32}
                    value={config.security.passwordMinLength}
                    onChange={(e) => setConfig({
                      ...config,
                      security: { ...config.security, passwordMinLength: parseInt(e.target.value) || 8 },
                    })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Entre 6 et 32 caractères
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cfg-session-timeout">Timeout de session (minutes)</Label>
                  <Input
                    id="cfg-session-timeout"
                    type="number"
                    min={1}
                    max={1440}
                    value={config.security.sessionTimeoutMinutes}
                    onChange={(e) => setConfig({
                      ...config,
                      security: { ...config.security, sessionTimeoutMinutes: parseInt(e.target.value) || 30 },
                    })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Durée d&apos;inactivité avant déconnexion automatique
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cfg-max-sessions">Sessions simultanées max</Label>
                  <Input
                    id="cfg-max-sessions"
                    type="number"
                    min={1}
                    max={10}
                    value={config.security.maxConcurrentSessions}
                    onChange={(e) => setConfig({
                      ...config,
                      security: { ...config.security, maxConcurrentSessions: parseInt(e.target.value) || 3 },
                    })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Nombre maximal de sessions actives par utilisateur
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cfg-audit-retention">Rétention des logs d&apos;audit (jours)</Label>
                  <Input
                    id="cfg-audit-retention"
                    type="number"
                    min={1}
                    max={3650}
                    value={config.security.auditLogRetentionDays}
                    onChange={(e) => setConfig({
                      ...config,
                      security: { ...config.security, auditLogRetentionDays: parseInt(e.target.value) || 90 },
                    })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Durée de conservation des journaux d&apos;audit avant purge
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="cfg-password-special">Caractères spéciaux requis</Label>
                  <p className="text-sm text-muted-foreground">
                    Exiger au moins un caractère spécial dans les mots de passe
                  </p>
                </div>
                <Switch
                  id="cfg-password-special"
                  checked={config.security.passwordRequireSpecial}
                  onCheckedChange={(checked) => setConfig({
                    ...config,
                    security: { ...config.security, passwordRequireSpecial: checked },
                  })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="cfg-data-export">Export des données activé</Label>
                  <p className="text-sm text-muted-foreground">
                    Autoriser l&apos;export des données (RGPD / portabilité)
                  </p>
                </div>
                <Switch
                  id="cfg-data-export"
                  checked={config.security.dataExportEnabled}
                  onCheckedChange={(checked) => setConfig({
                    ...config,
                    security: { ...config.security, dataExportEnabled: checked },
                  })}
                />
              </div>

              {/* Security summary */}
              <div className="rounded-lg border border-success/30 bg-success/10 p-4">
                <h4 className="text-sm font-display font-semibold text-success-text mb-2 flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Résumé de la configuration sécurité
                </h4>
                <ul className="text-sm text-success-text space-y-1 font-mono tabular-nums">
                  <li>• Taille max fichiers : {config.security.maxUploadSizeMB} MB</li>
                  <li>• Types autorisés : {config.security.allowedFileTypes.join(', ')}</li>
                  <li>• Proctoring : {config.security.proctoringEnabled ? 'Activé' : 'Désactivé'}</li>
                  <li>• Longueur min. mot de passe : {config.security.passwordMinLength} caractères</li>
                  <li>• Caractères spéciaux requis : {config.security.passwordRequireSpecial ? 'Oui' : 'Non'}</li>
                  <li>• Timeout de session : {config.security.sessionTimeoutMinutes} min</li>
                  <li>• Sessions simultanées max : {config.security.maxConcurrentSessions}</li>
                  <li>• Rétention logs d&apos;audit : {config.security.auditLogRetentionDays} jours</li>
                  <li>• Export des données : {config.security.dataExportEnabled ? 'Activé' : 'Désactivé'}</li>
                </ul>
              </div>

              <Separator />

              <div className="flex justify-end">
                <Button
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
              <CardTitle className="flex items-center gap-2 font-display tracking-tight">
                <Bell className="h-5 w-5 text-success-text" />
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

              {/* CONFIG-FRONTEND-EXTEND : Configuration SMTP */}
              <div className="space-y-4">
                <div className="space-y-0.5">
                  <h4 className="text-sm font-display font-semibold text-success-text flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    Configuration SMTP
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Paramètres du serveur de messagerie pour l&apos;envoi des emails transactionnels
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="cfg-smtp-host">SMTP Host</Label>
                    <Input
                      id="cfg-smtp-host"
                      placeholder="smtp.example.com"
                      value={config.notifications.smtpHost}
                      onChange={(e) => setConfig({
                        ...config,
                        notifications: { ...config.notifications, smtpHost: e.target.value },
                      })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cfg-smtp-port">SMTP Port</Label>
                    <Input
                      id="cfg-smtp-port"
                      type="number"
                      min={1}
                      max={65535}
                      value={config.notifications.smtpPort}
                      onChange={(e) => setConfig({
                        ...config,
                        notifications: { ...config.notifications, smtpPort: parseInt(e.target.value) || 587 },
                      })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cfg-smtp-user">SMTP User</Label>
                  <Input
                    id="cfg-smtp-user"
                    placeholder="user@example.com"
                    value={config.notifications.smtpUser}
                    onChange={(e) => setConfig({
                      ...config,
                      notifications: { ...config.notifications, smtpUser: e.target.value },
                    })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cfg-smtp-from">Email expéditeur</Label>
                  <Input
                    id="cfg-smtp-from"
                    type="email"
                    placeholder="noreply@example.com"
                    value={config.notifications.smtpFromEmail}
                    onChange={(e) => setConfig({
                      ...config,
                      notifications: { ...config.notifications, smtpFromEmail: e.target.value },
                    })}
                  />
                </div>
              </div>

              <Separator />

              {/* CONFIG-FRONTEND-EXTEND : Types de notifications administrateur */}
              <div className="space-y-4">
                <div className="space-y-0.5">
                  <h4 className="text-sm font-display font-semibold text-success-text flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    Types de notifications
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Sélectionnez les événements qui déclenchent une notification administrateur
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="cfg-notif-new-user">Nouveaux utilisateurs</Label>
                    <p className="text-sm text-muted-foreground">
                      Notifier lors de l&apos;inscription d&apos;un nouvel utilisateur
                    </p>
                  </div>
                  <Switch
                    id="cfg-notif-new-user"
                    checked={config.notifications.notifNewUserAdmin}
                    onCheckedChange={(checked) => setConfig({
                      ...config,
                      notifications: { ...config.notifications, notifNewUserAdmin: checked },
                    })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="cfg-notif-payment">Paiements</Label>
                    <p className="text-sm text-muted-foreground">
                      Notifier lors d&apos;un paiement ou d&apos;un abonnement
                    </p>
                  </div>
                  <Switch
                    id="cfg-notif-payment"
                    checked={config.notifications.notifPaymentAdmin}
                    onCheckedChange={(checked) => setConfig({
                      ...config,
                      notifications: { ...config.notifications, notifPaymentAdmin: checked },
                    })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="cfg-notif-security">Alertes de sécurité</Label>
                    <p className="text-sm text-muted-foreground">
                      Notifier en cas d&apos;activité suspecte ou de brèche
                    </p>
                  </div>
                  <Switch
                    id="cfg-notif-security"
                    checked={config.notifications.notifSecurityAlerts}
                    onCheckedChange={(checked) => setConfig({
                      ...config,
                      notifications: { ...config.notifications, notifSecurityAlerts: checked },
                    })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="cfg-notif-exam">Rappel d&apos;examen</Label>
                    <p className="text-sm text-muted-foreground">
                      Envoyer un rappel avant le début d&apos;une session d&apos;examen
                    </p>
                  </div>
                  <Switch
                    id="cfg-notif-exam"
                    checked={config.notifications.notifExamReminder}
                    onCheckedChange={(checked) => setConfig({
                      ...config,
                      notifications: { ...config.notifications, notifExamReminder: checked },
                    })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="cfg-push-notif">Notifications push</Label>
                    <p className="text-sm text-muted-foreground">
                      Activer les notifications push (PWA / navigateur)
                    </p>
                  </div>
                  <Switch
                    id="cfg-push-notif"
                    checked={config.notifications.pushNotificationsEnabled}
                    onCheckedChange={(checked) => setConfig({
                      ...config,
                      notifications: { ...config.notifications, pushNotificationsEnabled: checked },
                    })}
                  />
                </div>
              </div>

              <Separator />

              <div className="flex justify-end">
                <Button
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
              <CardTitle className="flex items-center gap-2 font-display tracking-tight">
                <Sparkles className="h-5 w-5 text-success-text" />
                Paramètres IA
              </CardTitle>
              <CardDescription>
                Configurer les fonctionnalités d&apos;intelligence artificielle
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Link to AI Providers page */}
              <div className="rounded-lg border border-secondary/30 bg-secondary/10 p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h4 className="text-sm font-display font-semibold text-secondary flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      Fournisseurs IA
                    </h4>
                    <p className="text-xs text-secondary">
                      Configurez vos fournisseurs d&apos;IA (OpenAI, Anthropic, Groq, Z-AI...) et changez le fournisseur actif
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-secondary/40 text-secondary hover:bg-secondary/10"
                    onClick={() => router.push(PAGE_ROUTES['ai-providers'])}
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

              <Separator />

              {/* CONFIG-FRONTEND-EXTEND : quotas / paramètres modèles IA */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cfg-ai-max-requests">Requêtes IA max par jour</Label>
                  <Input
                    id="cfg-ai-max-requests"
                    type="number"
                    min={1}
                    max={100000}
                    value={config.ia.aiMaxRequestsPerDay}
                    onChange={(e) => setConfig({
                      ...config,
                      ia: { ...config.ia, aiMaxRequestsPerDay: parseInt(e.target.value) || 100 },
                    })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Plafond quotidien global pour limiter les coûts IA
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cfg-ai-max-tokens">Tokens max par requête</Label>
                  <Input
                    id="cfg-ai-max-tokens"
                    type="number"
                    min={1}
                    max={32000}
                    value={config.ia.aiMaxTokens}
                    onChange={(e) => setConfig({
                      ...config,
                      ia: { ...config.ia, aiMaxTokens: parseInt(e.target.value) || 2000 },
                    })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Limite de tokens par appel IA (coût + latence)
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="cfg-ai-temperature" className="flex items-center gap-1.5">
                    <Thermometer className="h-4 w-4 text-success-text" />
                    Température IA
                  </Label>
                  <span className="text-sm font-mono tabular-nums text-success-text">
                    {config.ia.aiTemperature.toFixed(1)}
                  </span>
                </div>
                <Slider
                  min={0}
                  max={1}
                  step={0.1}
                  value={[config.ia.aiTemperature]}
                  onValueChange={(vals) => setConfig({
                    ...config,
                    ia: { ...config.ia, aiTemperature: vals[0] ?? 0.7 },
                  })}
                />
                <p className="text-xs text-muted-foreground">
                  Plus la valeur est élevée, plus les réponses sont créatives (0 = déterministe, 1 = maximal)
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="cfg-ai-confidence">Seuil de confiance pour la correction</Label>
                  <span className="text-sm font-mono tabular-nums text-success-text">
                    {config.ia.aiGradingConfidenceThreshold.toFixed(2)}
                  </span>
                </div>
                <Slider
                  min={0}
                  max={1}
                  step={0.05}
                  value={[config.ia.aiGradingConfidenceThreshold]}
                  onValueChange={(vals) => setConfig({
                    ...config,
                    ia: { ...config.ia, aiGradingConfidenceThreshold: vals[0] ?? 0.8 },
                  })}
                />
                <p className="text-xs text-muted-foreground">
                  En-dessous de ce seuil, la correction IA est marquée &quot;à vérifier&quot;
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="cfg-ai-failover">Failover automatique</Label>
                  <p className="text-sm text-muted-foreground">
                    Basculer automatiquement vers un fournisseur IA de secours en cas d&apos;échec
                  </p>
                </div>
                <Switch
                  id="cfg-ai-failover"
                  checked={config.ia.aiFailoverEnabled}
                  onCheckedChange={(checked) => setConfig({
                    ...config,
                    ia: { ...config.ia, aiFailoverEnabled: checked },
                  })}
                />
              </div>

              {/* IA Summary */}
              <div className="rounded-lg border border-success/30 bg-success/10 p-4">
                <h4 className="text-sm font-display font-semibold text-success-text mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Résumé de la configuration IA
                </h4>
                <ul className="text-sm text-success-text space-y-1">
                  <li>• Génération de questions : {config.ia.aiGenerationEnabled ? 'Activée' : 'Désactivée'}</li>
                  <li>• Correction automatique : {config.ia.aiCorrectionEnabled ? 'Activée' : 'Désactivée'}</li>
                  <li>• Requêtes max / jour : {config.ia.aiMaxRequestsPerDay}</li>
                  <li>• Température : {config.ia.aiTemperature.toFixed(1)}</li>
                  <li>• Tokens max / requête : {config.ia.aiMaxTokens}</li>
                  <li>• Failover automatique : {config.ia.aiFailoverEnabled ? 'Activé' : 'Désactivé'}</li>
                  <li>• Seuil de confiance correction : {config.ia.aiGradingConfidenceThreshold.toFixed(2)}</li>
                </ul>
              </div>

              <Separator />

              <div className="flex justify-end">
                <Button
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
