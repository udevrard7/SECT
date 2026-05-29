'use client'

import { useState } from 'react'
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
} from 'lucide-react'
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
import { toast } from 'sonner'

// ─── Config types ───

interface GeneralConfig {
  platformName: string
  description: string
  defaultLanguage: string
  academicYear: string
}

interface SecurityConfig {
  minPasswordLength: number
  sessionTimeout: number
  maxLoginAttempts: number
  passwordPolicyDesc: string
}

interface NotificationConfig {
  emailNotifications: boolean
  alertThreshold: number
  notificationRecipients: string
}

interface IAConfig {
  defaultModel: string
  temperature: number
  maxQuestionsPerDoc: number
  qualityScoreThreshold: number
}

interface AppConfig {
  general: GeneralConfig
  security: SecurityConfig
  notifications: NotificationConfig
  ia: IAConfig
}

// ─── Default config ───

const DEFAULT_CONFIG: AppConfig = {
  general: {
    platformName: 'SECT',
    description: 'Système d\'Évaluation Casse-Tête — Plateforme d\'évaluation intelligente',
    defaultLanguage: 'fr',
    academicYear: '2025-2026',
  },
  security: {
    minPasswordLength: 8,
    sessionTimeout: 60,
    maxLoginAttempts: 5,
    passwordPolicyDesc: 'Le mot de passe doit contenir au moins 8 caractères, incluant une majuscule, une minuscule, un chiffre et un caractère spécial.',
  },
  notifications: {
    emailNotifications: true,
    alertThreshold: 3,
    notificationRecipients: 'admin@sect.fr',
  },
  ia: {
    defaultModel: 'gpt-4o',
    temperature: 0.7,
    maxQuestionsPerDoc: 20,
    qualityScoreThreshold: 70,
  },
}

// ─── LocalStorage key ───

const CONFIG_KEY = 'sect-app-config'

function loadConfig(): AppConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG
  try {
    const stored = localStorage.getItem(CONFIG_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return {
        general: { ...DEFAULT_CONFIG.general, ...parsed.general },
        security: { ...DEFAULT_CONFIG.security, ...parsed.security },
        notifications: { ...DEFAULT_CONFIG.notifications, ...parsed.notifications },
        ia: { ...DEFAULT_CONFIG.ia, ...parsed.ia },
      }
    }
  } catch {
    // Silent
  }
  return DEFAULT_CONFIG
}

function saveConfig(config: AppConfig): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}

// ─── Main Component ───

export function ConfigurationPage() {
  const [config, setConfig] = useState<AppConfig>(() => loadConfig())
  const [savingTab, setSavingTab] = useState<string | null>(null)

  // ─── Handlers per tab ───

  const handleSaveGeneral = async () => {
    setSavingTab('general')
    // Simulate network delay for UX
    await new Promise((r) => setTimeout(r, 500))
    saveConfig(config)
    setSavingTab(null)
    toast.success('Configuration sauvegardée', { description: 'Les paramètres généraux ont été mis à jour.' })
  }

  const handleSaveSecurity = async () => {
    setSavingTab('security')
    await new Promise((r) => setTimeout(r, 500))
    saveConfig(config)
    setSavingTab(null)
    toast.success('Configuration sauvegardée', { description: 'Les paramètres de sécurité ont été mis à jour.' })
  }

  const handleSaveNotifications = async () => {
    setSavingTab('notifications')
    await new Promise((r) => setTimeout(r, 500))
    saveConfig(config)
    setSavingTab(null)
    toast.success('Configuration sauvegardée', { description: 'Les paramètres de notifications ont été mis à jour.' })
  }

  const handleSaveIA = async () => {
    setSavingTab('ia')
    await new Promise((r) => setTimeout(r, 500))
    saveConfig(config)
    setSavingTab(null)
    toast.success('Configuration sauvegardée', { description: 'Les paramètres IA ont été mis à jour.' })
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
                <Label htmlFor="cfg-platform-name">Nom de la plateforme</Label>
                <Input
                  id="cfg-platform-name"
                  value={config.general.platformName}
                  readOnly
                  className="bg-muted cursor-not-allowed"
                />
                <p className="text-xs text-muted-foreground">Le nom de la plateforme est fixe et ne peut pas être modifié.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cfg-description">Description</Label>
                <Textarea
                  id="cfg-description"
                  value={config.general.description}
                  onChange={(e) => setConfig({
                    ...config,
                    general: { ...config.general, description: e.target.value },
                  })}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cfg-language">Langue par défaut</Label>
                  <Select
                    value={config.general.defaultLanguage}
                    onValueChange={(val) => setConfig({
                      ...config,
                      general: { ...config.general, defaultLanguage: val },
                    })}
                  >
                    <SelectTrigger id="cfg-language">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fr">Français</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cfg-academic-year">Année universitaire</Label>
                  <Input
                    id="cfg-academic-year"
                    placeholder="Ex: 2025-2026"
                    value={config.general.academicYear}
                    onChange={(e) => setConfig({
                      ...config,
                      general: { ...config.general, academicYear: e.target.value },
                    })}
                  />
                </div>
              </div>

              <Separator />

              <div className="flex justify-end">
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleSaveGeneral}
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
                Configurer les règles de sécurité et d&apos;authentification
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cfg-pwd-length">Longueur minimale du mot de passe</Label>
                  <Input
                    id="cfg-pwd-length"
                    type="number"
                    min={4}
                    max={32}
                    value={config.security.minPasswordLength}
                    onChange={(e) => setConfig({
                      ...config,
                      security: { ...config.security, minPasswordLength: parseInt(e.target.value) || 8 },
                    })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cfg-session-timeout">Délai d&apos;expiration de session (minutes)</Label>
                  <Input
                    id="cfg-session-timeout"
                    type="number"
                    min={5}
                    max={480}
                    value={config.security.sessionTimeout}
                    onChange={(e) => setConfig({
                      ...config,
                      security: { ...config.security, sessionTimeout: parseInt(e.target.value) || 60 },
                    })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cfg-max-attempts">Tentatives de connexion avant verrouillage</Label>
                <Input
                  id="cfg-max-attempts"
                  type="number"
                  min={1}
                  max={20}
                  value={config.security.maxLoginAttempts}
                  onChange={(e) => setConfig({
                    ...config,
                    security: { ...config.security, maxLoginAttempts: parseInt(e.target.value) || 5 },
                  })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cfg-pwd-policy">Politique de mots de passe</Label>
                <Textarea
                  id="cfg-pwd-policy"
                  value={config.security.passwordPolicyDesc}
                  onChange={(e) => setConfig({
                    ...config,
                    security: { ...config.security, passwordPolicyDesc: e.target.value },
                  })}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">Cette description sera affichée aux utilisateurs lors de la création de leur mot de passe.</p>
              </div>

              {/* Security summary */}
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
                <h4 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 mb-2 flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Résumé de la politique de sécurité
                </h4>
                <ul className="text-sm text-emerald-700 dark:text-emerald-400 space-y-1">
                  <li>• Mot de passe : minimum {config.security.minPasswordLength} caractères</li>
                  <li>• Session expire après {config.security.sessionTimeout} minutes d&apos;inactivité</li>
                  <li>• Compte verrouillé après {config.security.maxLoginAttempts} tentatives échouées</li>
                </ul>
              </div>

              <Separator />

              <div className="flex justify-end">
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleSaveSecurity}
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
                <Label htmlFor="cfg-alert-threshold">Seuil d&apos;alerte pour anomalies d&apos;examen</Label>
                <Input
                  id="cfg-alert-threshold"
                  type="number"
                  min={1}
                  max={20}
                  value={config.notifications.alertThreshold}
                  onChange={(e) => setConfig({
                    ...config,
                    notifications: { ...config.notifications, alertThreshold: parseInt(e.target.value) || 3 },
                  })}
                />
                <p className="text-xs text-muted-foreground">
                  Nombre d&apos;alertes (changement d&apos;onglet, copier-coller, etc.) avant de déclencher une notification à l&apos;enseignant.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cfg-notif-recipients">Destinataires des notifications</Label>
                <Input
                  id="cfg-notif-recipients"
                  placeholder="admin@sect.fr, resp@sect.fr"
                  value={config.notifications.notificationRecipients}
                  onChange={(e) => setConfig({
                    ...config,
                    notifications: { ...config.notifications, notificationRecipients: e.target.value },
                  })}
                />
                <p className="text-xs text-muted-foreground">
                  Adresses email séparées par des virgules
                </p>
              </div>

              <Separator />

              <div className="flex justify-end">
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleSaveNotifications}
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
                Configurer le modèle d&apos;IA et les paramètres de génération de questions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="cfg-ia-model">Modèle de génération par défaut</Label>
                <Select
                  value={config.ia.defaultModel}
                  onValueChange={(val) => setConfig({
                    ...config,
                    ia: { ...config.ia, defaultModel: val },
                  })}
                >
                  <SelectTrigger id="cfg-ia-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                    <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                    <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                    <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Thermometer className="h-4 w-4 text-emerald-600" />
                    Température : {config.ia.temperature.toFixed(1)}
                  </Label>
                  <Slider
                    value={[config.ia.temperature]}
                    onValueChange={([val]) => setConfig({
                      ...config,
                      ia: { ...config.ia, temperature: val },
                    })}
                    min={0}
                    max={2}
                    step={0.1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Précis (0)</span>
                    <span>Créatif (2)</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cfg-max-questions">Max questions par document</Label>
                  <Input
                    id="cfg-max-questions"
                    type="number"
                    min={1}
                    max={100}
                    value={config.ia.maxQuestionsPerDoc}
                    onChange={(e) => setConfig({
                      ...config,
                      ia: { ...config.ia, maxQuestionsPerDoc: parseInt(e.target.value) || 20 },
                    })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cfg-quality-threshold">Seuil de score de qualité</Label>
                  <Input
                    id="cfg-quality-threshold"
                    type="number"
                    min={0}
                    max={100}
                    value={config.ia.qualityScoreThreshold}
                    onChange={(e) => setConfig({
                      ...config,
                      ia: { ...config.ia, qualityScoreThreshold: parseInt(e.target.value) || 70 },
                    })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Les questions avec un score inférieur seront marquées pour révision
                  </p>
                </div>
              </div>

              {/* IA Summary */}
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
                <h4 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Résumé de la configuration IA
                </h4>
                <ul className="text-sm text-emerald-700 dark:text-emerald-400 space-y-1">
                  <li>• Modèle : {config.ia.defaultModel}</li>
                  <li>• Température : {config.ia.temperature.toFixed(1)} {config.ia.temperature < 0.5 ? '(précis)' : config.ia.temperature > 1.5 ? '(créatif)' : '(équilibré)'}</li>
                  <li>• Maximum {config.ia.maxQuestionsPerDoc} questions par document</li>
                  <li>• Seuil de qualité : {config.ia.qualityScoreThreshold}%</li>
                </ul>
              </div>

              <Separator />

              <div className="flex justify-end">
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleSaveIA}
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
