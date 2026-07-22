'use client'

// ═══════════════════════════════════════════════════════════════════════════════
// SECT — Page d'administration des Fournisseurs IA
// Refonte « Savane EdTech » — palette africaine + motif kente + Design System unifié
// Task: SECT-AI-PROVIDERS-REDESIGN-1
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef, type Dispatch, type SetStateAction } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence, MotionConfig } from 'framer-motion'
import { toast } from 'sonner'
import {
  Sparkles,
  Plus,
  Trash2,
  Pencil,
  Zap,
  Check,
  X,
  Loader2,
  RefreshCw,
  Brain,
  Plug,
  MessageSquare,
  Globe,
  Power,
  AlertCircle,
  Eye,
  EyeOff,
  Shield,
  Activity,
  Server,
  Wifi,
  WifiOff,
  ArrowRightLeft,
  Layers,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  Settings2,
  ArrowUpDown,
  Clock,
  AlertTriangle,
  RotateCcw,
  Timer,
  TrendingUp,
  HeartPulse,
  ShieldCheck,
  AudioLines, // icône TTS (Voxtral, Kokoro)
  Mic,        // icône audio (DashScope)
  HelpCircle, // statut UNKNOWN
  Cpu,        // icône diagnostics
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
// Design System unifié « Savane EdTech »
import {
  StatCard,
  EntityCard,
  Badge,
  GlassModal,
  PulseSkeleton,
  StatCardSkeletonGrid,
  ProgressBar,
  ProgressRing,
} from '@/components/ds'
import type { AIProviderInfo, AIProviderType } from '@/lib/ai-providers/types'

// ─── Type local étendu ───
// Le backend supporte 9 providers (ValidateProviderInput) mais types.ts n'en
// déclare que 6. On étend localement SANS modifier types.ts.
// AI-PROVIDERS-MODELS-V2 : LocalProviderType est maintenant = AIProviderType
// (DASHSCOPE, DEEPSEEK, CEREBRAS ajoutés dans types.ts).
type LocalProviderType = AIProviderType

// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDER METADATA — 9 providers (alignement backend exact)
// ═══════════════════════════════════════════════════════════════════════════════

interface ProviderMeta {
  label: string
  description: string
  icon: any
  color: string
  bgClass: string
  textClass: string
  borderClass: string
  gradientClass: string
  defaultCapability: 'chat' | 'tts' | 'audio' | 'transcription'
}

const PROVIDER_META: Record<LocalProviderType, ProviderMeta> = {
  ZAI: {
    label: 'Z-AI',
    description: 'Z.ai Intelligence Artificielle',
    icon: Zap,
    color: '#8b5cf6',
    bgClass: 'bg-secondary/10',
    textClass: 'text-secondary',
    borderClass: 'border-secondary/30',
    gradientClass: 'from-secondary via-secondary to-secondary',
    defaultCapability: 'chat',
  },
  OPENAI: {
    label: 'OpenAI',
    description: 'GPT-4, GPT-4o, GPT-3.5',
    icon: Brain,
    color: '#10b981',
    bgClass: 'bg-success/10',
    textClass: 'text-success-text',
    borderClass: 'border-success/30',
    gradientClass: 'from-success via-success to-success',
    defaultCapability: 'chat',
  },
  OPENAI_COMPATIBLE: {
    label: 'OpenAI-Compatible',
    description: 'Groq, Together, Ollama, Mistral...',
    icon: Plug,
    color: '#f59e0b',
    bgClass: 'bg-warning/10',
    textClass: 'text-warning',
    borderClass: 'border-warning/30',
    gradientClass: 'from-warning via-warning to-warning',
    defaultCapability: 'chat',
  },
  ANTHROPIC: {
    label: 'Anthropic',
    description: 'Claude 3.5 Sonnet, Claude 3 Opus',
    icon: MessageSquare,
    color: '#ef4444',
    bgClass: 'bg-destructive/10',
    textClass: 'text-destructive',
    borderClass: 'border-destructive/30',
    gradientClass: 'from-destructive via-destructive to-pink-500/10',
    defaultCapability: 'chat',
  },
  GOOGLE: {
    label: 'Google AI',
    description: 'Gemini Pro, Gemini Flash',
    icon: Globe,
    color: '#3b82f6',
    bgClass: 'bg-info/10',
    textClass: 'text-info',
    borderClass: 'border-info/30',
    gradientClass: 'from-info via-info to-success',
    defaultCapability: 'chat',
  },
  // VOXTRAL : Mistral Voxtral TTS — voix FR native via API Mistral (voice cloning)
  VOXTRAL: {
    label: 'Voxtral',
    description: 'Mistral Voxtral TTS — voix FR native',
    icon: AudioLines,
    color: '#0891b2',
    bgClass: 'bg-cyan-500/10',
    textClass: 'text-cyan-600 dark:text-cyan-400',
    borderClass: 'border-cyan-500/30',
    gradientClass: 'from-cyan-500 via-cyan-500 to-teal-500',
    defaultCapability: 'tts',
  },
  // ─── Nouveaux providers (alignement backend ValidateProviderInput) ───
  DASHSCOPE: {
    label: 'DashScope (Alibaba)',
    description: 'Qwen, Model Studio — chat & TTS',
    icon: Mic,
    color: '#06b6d4',
    bgClass: 'bg-cyan-500/10',
    textClass: 'text-cyan-600 dark:text-cyan-400',
    borderClass: 'border-cyan-500/30',
    gradientClass: 'from-cyan-500 via-teal-500 to-cyan-600',
    defaultCapability: 'chat',
  },
  DEEPSEEK: {
    label: 'DeepSeek',
    description: 'DeepSeek-V3, DeepSeek-R1 — reasoning',
    icon: Brain,
    color: '#84CC16',
    bgClass: 'bg-primary/10',
    textClass: 'text-primary-text',
    borderClass: 'border-primary/30',
    gradientClass: 'from-primary via-primary to-lime-600',
    defaultCapability: 'chat',
  },
  CEREBRAS: {
    label: 'Cerebras',
    description: 'Llama — inférence ultra-rapide',
    icon: Zap,
    color: '#D4A017',
    bgClass: 'bg-gold/10',
    textClass: 'text-gold',
    borderClass: 'border-gold/30',
    gradientClass: 'from-gold via-amber-500 to-gold',
    defaultCapability: 'chat',
  },
}

// AI-PROVIDERS-MODELS-V2 : modèles actualisés (juillet 2025).
// Chaque fournisseur a SES propres modèles — pas de mélange.
// Les modèles OPENAI_COMPATIBLE sont ceux accessibles via l'API Groq.
const PROVIDER_MODELS: Record<LocalProviderType, string[]> = {
  ZAI: ['default'],
  // ─── OpenAI (API directe) ───
  OPENAI: [
    'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano',
    'gpt-4o', 'gpt-4o-mini',
    'o3-mini', 'o1', 'o1-mini',
    'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo',
  ],
  // ─── OpenAI-Compatible (Groq, etc.) ───
  OPENAI_COMPATIBLE: [
    'llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'llama-3.1-70b-versatile',
    'llama-3.2-1b-instant', 'llama-3.2-3b-instant', 'llama-3.2-11b-vision-instant', 'llama-3.2-90b-vision-instant',
    'mixtral-8x7b-32768', 'gemma2-9b-it',
    'deepseek-r1-distill-llama-70b', 'qwen-qwq-32b', 'qwen-2.5-32b',
    'whisper-large-v3', 'distil-whisper-large-v3-en',
  ],
  // ─── Anthropic ───
  ANTHROPIC: [
    'claude-sonnet-4-20250514',
    'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229', 'claude-3-haiku-20240307',
  ],
  // ─── Google Gemini ───
  GOOGLE: [
    'gemini-2.5-pro-preview-06-05', 'gemini-2.5-flash-preview-05-20',
    'gemini-2.0-flash', 'gemini-2.0-flash-lite',
    'gemini-1.5-pro', 'gemini-1.5-flash',
  ],
  // ─── Voxtral (TTS) ───
  VOXTRAL: ['voxtral-mini-tts-latest', 'voxtral-mini-tts-2603'],
  // ─── DashScope (Alibaba Cloud) ───
  DASHSCOPE: [
    'qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen-long',
    'qwen3-max', 'qwen3-coder-plus', 'qwen3-omni-flash',
    'qwen-vl-max', 'qwen3-vl-plus', 'qwen3-vl-flash',
  ],
  // ─── DeepSeek ───
  DEEPSEEK: ['deepseek-chat', 'deepseek-reasoner'],
  // ─── Cerebras ───
  CEREBRAS: [
    'llama-4-scout-17b-16e-instruct',
    'llama-3.3-70b', 'llama3.1-8b', 'llama3.1-70b',
  ],
}

const PROVIDER_DEFAULT_URLS: Record<LocalProviderType, string> = {
  ZAI: 'https://z.ai/api/v1',
  OPENAI: 'https://api.openai.com/v1',
  OPENAI_COMPATIBLE: 'https://api.groq.com/openai/v1',
  ANTHROPIC: 'https://api.anthropic.com/v1',
  GOOGLE: 'https://generativelanguage.googleapis.com/v1beta/openai',
  VOXTRAL: 'https://api.mistral.ai/v1',
  DASHSCOPE: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  DEEPSEEK: 'https://api.deepseek.com/v1',
  CEREBRAS: 'https://api.cerebras.ai/v1',
}

// ═══════════════════════════════════════════════════════════════════════════════
// FAILOVER TYPES (locaux — étendus avec 'UNKNOWN' pour le status)
// ═══════════════════════════════════════════════════════════════════════════════

interface FailoverConfig {
  enabled: boolean
  maxConsecutiveFailures: number
  cooldownDurationMs: number
  retryAllProviders: boolean
}

interface ProviderWithHealth {
  id: string
  name: string
  provider: string
  model: string | null
  isActive: boolean
  priority: number
  lastTestAt: string | null
  lastTestOk: boolean | null
  // ⚠️ 'UNKNOWN' ajouté : le backend renvoie cette valeur quand health est nil
  status: 'HEALTHY' | 'DEGRADED' | 'COOLING_DOWN' | 'UNKNOWN'
  health: {
    providerId: string
    providerName: string
    consecutiveFailures: number
    lastFailureAt: number | null
    lastSuccessAt: number | null
    totalCalls: number
    totalFailures: number
    totalFailovers: number
    isCoolingDown: boolean
  } | null
}

interface FailoverEvent {
  id: string
  eventType: string
  fromProvider: string | null
  toProvider: string | null
  reason: string
  errorDetails: string | null
  resolved: boolean
  createdAt: string
}

interface FailoverStatus {
  config: FailoverConfig
  summary: {
    totalProviders: number
    healthy: number
    degraded: number
    unknown: number // ⚠️ ajouté : compteur des providers sans health
    coolingDown: number
    failoverEnabled: boolean
    totalCalls: number
    totalFailovers: number
    last24hEvents: number
  }
  providers: ProviderWithHealth[]
  recentEvents: FailoverEvent[]
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORM DATA
// ═══════════════════════════════════════════════════════════════════════════════

interface ProviderFormData {
  name: string
  provider: LocalProviderType
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
  chatId: string
  userId: string
  token: string
  // capability : chat / tts / audio / transcription
  capability: 'chat' | 'tts' | 'audio' | 'transcription'
  // VOXTRAL : URLs des audios de référence pour le multi-voix
  refAudioPresenter: string
  refAudioExpert: string
}

const EMPTY_FORM: ProviderFormData = {
  name: '',
  provider: 'OPENAI',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o',
  temperature: 0.7,
  maxTokens: 4096,
  chatId: '',
  userId: '',
  token: '',
  capability: 'chat',
  refAudioPresenter: '',
  refAudioExpert: '',
}

// ═══════════════════════════════════════════════════════════════════════════════
// DECORATIVE COMPONENTS — Motifs africains subtils (inspiration login-form)
// ═══════════════════════════════════════════════════════════════════════════════

/** Losange kente décoratif — motif géométrique africain traditionnel */
function KenteDiamond({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" className={className} aria-hidden="true">
      <polygon points="50,5 95,50 50,95 5,50" stroke="currentColor" strokeWidth="2" fill="none" />
      <polygon points="50,20 80,50 50,80 20,50" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <polygon points="50,35 65,50 50,65 35,50" stroke="currentColor" strokeWidth="1" fill="none" />
      <circle cx="50" cy="50" r="3" fill="currentColor" />
    </svg>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function AIProvidersPage() {
  const queryClient = useQueryClient()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<AIProviderInfo | null>(null)
  const [formData, setFormData] = useState<ProviderFormData>(EMPTY_FORM)
  const [isSaving, setIsSaving] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)
  const [activatingId, setActivatingId] = useState<string | null>(null)
  const [isTestingAll, setIsTestingAll] = useState(false)
  const [isQuickSwitching, setIsQuickSwitching] = useState(false)
  const [dynamicModels, setDynamicModels] = useState<string[]>([])
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [showModelSwitcher, setShowModelSwitcher] = useState(false)
  const [switchingModel, setSwitchingModel] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const hasAutoSeeded = useRef(false)
  const [activeTab, setActiveTab] = useState<string>('providers')

  // Failover state
  const [isUpdatingFailoverConfig, setIsUpdatingFailoverConfig] = useState(false)
  const [isResettingHealth, setIsResettingHealth] = useState(false)
  const [isReordering, setIsReordering] = useState<string | null>(null)
  const [isEventsExpanded, setIsEventsExpanded] = useState(true)

  // ─── TanStack Query : providers ───
  const providersQuery = useQuery<{ providers: AIProviderInfo[] }>({
    queryKey: ['ai-providers'],
    queryFn: async () => {
      const res = await fetch('/api/ai-providers')
      if (!res.ok) throw new Error('Erreur réseau')
      return res.json()
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const providers = providersQuery.data?.providers ?? []
  const isLoading = providersQuery.isLoading

  // ─── Auto-seed Z-AI par défaut si la liste est vide (one-shot via ref) ───
  useEffect(() => {
    if (providersQuery.data && providers.length === 0 && !hasAutoSeeded.current) {
      hasAutoSeeded.current = true
      void (async () => {
        try {
          const seedRes = await fetch('/api/ai-providers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: 'Z-AI (par défaut)',
              provider: 'ZAI',
              model: 'default',
              temperature: 0.7,
              maxTokens: 4096,
            }),
          })
          if (seedRes.ok) {
            toast.success('Fournisseur par défaut créé', {
              description: 'Z-AI (par défaut) a été ajouté automatiquement',
            })
            queryClient.invalidateQueries({ queryKey: ['ai-providers'] })
          }
        } catch {
          // Silently fail
        }
      })()
    }
  }, [providersQuery.data, providers.length, queryClient])

  // Toast sur erreur de chargement
  useEffect(() => {
    if (providersQuery.error) {
      toast.error('Erreur', { description: 'Impossible de charger les fournisseurs IA' })
    }
  }, [providersQuery.error])

  // ─── TanStack Query : failover status (polling 30s) ───
  const failoverQuery = useQuery<FailoverStatus>({
    queryKey: ['ai-providers-failover'],
    queryFn: async () => {
      const res = await fetch('/api/ai-providers/failover/status')
      if (!res.ok) throw new Error('Erreur réseau')
      return res.json()
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })

  const failoverStatus = failoverQuery.data ?? null
  const isFailoverLoading = failoverQuery.isLoading

  // Helpers d'invalidation du cache
  const refreshProviders = () => queryClient.invalidateQueries({ queryKey: ['ai-providers'] })
  const refreshFailoverStatus = () =>
    queryClient.invalidateQueries({ queryKey: ['ai-providers-failover'] })

  // ─── Derived state : active providers (multi-capability) ───
  const activeChatProvider = providers.find(p => p.isActive && (p.capability === 'chat' || !p.capability))
  const activeTtsProvider = providers.find(p => p.isActive && p.capability === 'tts')
  const activeProvider = activeChatProvider

  // ─── Fetch dynamic models from a provider's API ───
  // AI-PROVIDERS-MODELS-V2 : merge dynamic (API /models) + static (PROVIDER_MODELS).
  // Si l'API échoue, fallback sur PROVIDER_MODELS[providerType].
  const fetchDynamicModels = useCallback(async (providerId: string) => {
    setIsLoadingModels(true)
    try {
      const res = await fetch(`/api/ai-providers/models?providerId=${providerId}`)
      if (res.ok) {
        const data = await res.json()
        const apiModels: string[] = data.models || []
        // Merge dynamic + static, déduplication
        const providerType = (activeProvider?.provider as LocalProviderType) || 'ZAI'
        const staticModels = PROVIDER_MODELS[providerType] || []
        const merged = [...new Set([...staticModels, ...apiModels])].sort()
        setDynamicModels(merged.length > 0 ? merged : staticModels)
      } else {
        // Fallback : utiliser PROVIDER_MODELS[providerType]
        const providerType = (activeProvider?.provider as LocalProviderType) || 'ZAI'
        setDynamicModels(PROVIDER_MODELS[providerType] || [])
      }
    } catch {
      // Fallback : utiliser PROVIDER_MODELS[providerType]
      const providerType = (activeProvider?.provider as LocalProviderType) || 'ZAI'
      setDynamicModels(PROVIDER_MODELS[providerType] || [])
    } finally {
      setIsLoadingModels(false)
    }
  }, [activeProvider])

  // ─── Quick model switch for the active provider ───
  const handleQuickModelSwitch = async (model: string) => {
    if (!activeProvider || model === activeProvider.model) return
    setSwitchingModel(model)
    try {
      const res = await fetch(`/api/ai-providers/${activeProvider.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      })
      if (!res.ok) throw new Error('Erreur lors du changement de modèle')

      toast.success('Modèle changé', { description: `Maintenant utiliser : ${model}` })
      refreshProviders()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Erreur inconnue' })
    } finally {
      setSwitchingModel(null)
      setShowModelSwitcher(false)
    }
  }

  const openModelSwitcher = async () => {
    if (!activeProvider) return
    setShowModelSwitcher(true)
    fetchDynamicModels(activeProvider.id)
  }

  // ─── Create provider ───
  const handleCreate = async () => {
    setIsSaving(true)
    try {
      const extraConfig: Record<string, string> = {}
      if (formData.provider === 'ZAI') {
        if (formData.chatId) extraConfig.chatId = formData.chatId
        if (formData.userId) extraConfig.userId = formData.userId
        if (formData.token) extraConfig.token = formData.token
        if (formData.baseUrl) extraConfig.baseUrl = formData.baseUrl
        if (formData.apiKey) extraConfig.apiKey = formData.apiKey
      }
      if (formData.provider === 'VOXTRAL') {
        if (formData.refAudioPresenter) extraConfig.refAudioPresenter = formData.refAudioPresenter
        if (formData.refAudioExpert) extraConfig.refAudioExpert = formData.refAudioExpert
      }

      const res = await fetch('/api/ai-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          provider: formData.provider,
          baseUrl: formData.provider !== 'ZAI' ? formData.baseUrl : null,
          apiKey: formData.provider !== 'ZAI' ? formData.apiKey : null,
          model: formData.model,
          temperature: formData.temperature,
          maxTokens: formData.maxTokens,
          extraConfig: Object.keys(extraConfig).length > 0 ? extraConfig : undefined,
          capability: formData.capability,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la création')
      }

      toast.success('Fournisseur créé', { description: `"${formData.name}" a été ajouté` })
      setShowCreateDialog(false)
      setFormData(EMPTY_FORM)
      refreshProviders()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Erreur inconnue' })
    } finally {
      setIsSaving(false)
    }
  }

  // ─── Update provider ───
  const handleUpdate = async () => {
    if (!selectedProvider) return
    setIsSaving(true)
    try {
      const extraConfig: Record<string, string> = {}
      if (formData.provider === 'ZAI') {
        if (formData.chatId) extraConfig.chatId = formData.chatId
        if (formData.userId) extraConfig.userId = formData.userId
        if (formData.token) extraConfig.token = formData.token
        if (formData.baseUrl) extraConfig.baseUrl = formData.baseUrl
        if (formData.apiKey) extraConfig.apiKey = formData.apiKey
      }
      if (formData.provider === 'VOXTRAL') {
        if (formData.refAudioPresenter) extraConfig.refAudioPresenter = formData.refAudioPresenter
        if (formData.refAudioExpert) extraConfig.refAudioExpert = formData.refAudioExpert
      }

      const res = await fetch(`/api/ai-providers/${selectedProvider.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          provider: formData.provider,
          baseUrl: formData.provider !== 'ZAI' ? formData.baseUrl : null,
          apiKey: formData.provider !== 'ZAI' ? formData.apiKey : undefined,
          model: formData.model,
          temperature: formData.temperature,
          maxTokens: formData.maxTokens,
          extraConfig: Object.keys(extraConfig).length > 0 ? extraConfig : undefined,
          capability: formData.capability,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la mise à jour')
      }

      toast.success('Fournisseur mis à jour', { description: `"${formData.name}" a été modifié` })
      setShowEditDialog(false)
      setSelectedProvider(null)
      refreshProviders()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Erreur inconnue' })
    } finally {
      setIsSaving(false)
    }
  }

  // ─── Delete provider ───
  // Règle backend (ai_provider_usecase.go → Delete) : impossible de supprimer
  // un provider ACTIF — retourne 409 Conflict "cannot delete active provider".
  // On désactive donc d'abord le provider si nécessaire, puis on le supprime.
  // L'AlertDialogAction de Radix ferme le dialog par défaut au click ; on appelle
  // e.preventDefault() pour garder le dialog ouvert pendant l'async et pouvoir
  // afficher l'état de chargement + les erreurs inline.
  const handleDelete = async (e?: React.SyntheticEvent) => {
    e?.preventDefault()
    if (!selectedProvider) return
    setIsDeleting(true)
    try {
      // 1. Si le provider est actif, le désactiver d'abord (sinon 409 backend).
      if (selectedProvider.isActive) {
        const deactivateRes = await fetch('/api/ai-providers/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providerId: selectedProvider.id, active: false }),
        })
        if (!deactivateRes.ok) {
          let msg = 'Erreur lors de la désactivation'
          try {
            const errBody = await deactivateRes.json()
            msg = errBody.error || errBody.message || msg
          } catch { /* réponse non-JSON, on garde le message par défaut */ }
          throw new Error(msg)
        }
      }

      // 2. Supprimer le provider.
      const res = await fetch(`/api/ai-providers/${selectedProvider.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        let msg = 'Erreur lors de la suppression'
        try {
          const errBody = await res.json()
          msg = errBody.error || errBody.message || msg
        } catch { /* réponse non-JSON, on garde le message par défaut */ }
        throw new Error(msg)
      }

      toast.success('Fournisseur supprimé', {
        description: `« ${selectedProvider.name} » a été retiré${selectedProvider.isActive ? ' (désactivé puis supprimé)' : ''}`,
      })
      setShowDeleteDialog(false)
      setSelectedProvider(null)
      refreshProviders()
      // La désactivation/suppression modifie aussi l'état du failover.
      refreshFailoverStatus()
    } catch (err) {
      toast.error('Suppression impossible', {
        description: err instanceof Error ? err.message : 'Erreur inconnue',
      })
    } finally {
      setIsDeleting(false)
    }
  }

  // ─── Toggle provider active/inactive ───
  const handleActivate = async (providerId: string, forceActive?: boolean) => {
    setActivatingId(providerId)
    try {
      const body: Record<string, unknown> = { providerId }
      if (forceActive !== undefined) body.active = forceActive
      const res = await fetch('/api/ai-providers/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Erreur lors de l\'activation')

      const data = await res.json()
      toast.success(data.active ? 'Fournisseur activé' : 'Fournisseur désactivé', { description: data.message })
      refreshProviders()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Erreur inconnue' })
    } finally {
      setActivatingId(null)
    }
  }

  // ─── Quick switch provider (active sans désactiver les autres) ───
  const handleQuickSwitch = async (providerId: string) => {
    if (!providerId) return
    const target = providers.find(p => p.id === providerId)
    if (!target) return

    setIsQuickSwitching(true)
    try {
      const res = await fetch('/api/ai-providers/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId, active: true }),
      })
      if (!res.ok) throw new Error('Erreur lors du changement')

      const data = await res.json()
      toast.success('Fournisseur activé', { description: `${target.name} ajouté au failover (P${target.priority})` })
      refreshProviders()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Erreur inconnue' })
    } finally {
      setIsQuickSwitching(false)
    }
  }

  // ─── Test provider ───
  const handleTest = async (providerId: string) => {
    setTestingId(providerId)
    try {
      const res = await fetch(`/api/ai-providers/${providerId}/test`, {
        method: 'POST',
      })
      const data = await res.json()

      if (data.success) {
        toast.success('Connexion réussie', { description: data.message })
      } else {
        toast.error('Échec du test', { description: data.message })
      }
      refreshProviders()
    } catch {
      toast.error('Erreur', { description: 'Impossible de tester le fournisseur' })
    } finally {
      setTestingId(null)
    }
  }

  // ─── Test all providers (séquentiel) ───
  const handleTestAll = async () => {
    if (providers.length === 0) return
    setIsTestingAll(true)

    const results: { name: string; success: boolean }[] = []

    for (const provider of providers) {
      setTestingId(provider.id)
      try {
        const res = await fetch(`/api/ai-providers/${provider.id}/test`, {
          method: 'POST',
        })
        const data = await res.json()
        results.push({ name: provider.name, success: data.success === true })
      } catch {
        results.push({ name: provider.name, success: false })
      }
    }

    setTestingId(null)
    setIsTestingAll(false)
    refreshProviders()

    const succeeded = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    if (failed === 0) {
      toast.success('Tous les tests réussis', {
        description: `${succeeded}/${results.length} fournisseurs fonctionnent correctement`,
      })
    } else {
      toast.warning('Certains tests ont échoué', {
        description: `${succeeded} réussi(s), ${failed} échoué(s) sur ${results.length} fournisseurs`,
      })
    }
  }

  // ─── Open edit dialog (récupère la version complète avec apiKey) ───
  const openEdit = async (provider: AIProviderInfo) => {
    setSelectedProvider(provider)
    try {
      const res = await fetch(`/api/ai-providers/${provider.id}`)
      const data = await res.json()
      const full = data.provider

      // Parser extraConfig pour VOXTRAL (URLs des voix)
      let refAudioPresenter = ''
      let refAudioExpert = ''
      if (full.extraConfig) {
        try {
          const ec = typeof full.extraConfig === 'string'
            ? JSON.parse(full.extraConfig)
            : full.extraConfig
          refAudioPresenter = ec.refAudioPresenter || ''
          refAudioExpert = ec.refAudioExpert || ''
        } catch { /* ignore parse error */ }
      }

      setFormData({
        name: full.name,
        provider: full.provider as LocalProviderType,
        baseUrl: full.baseUrl || PROVIDER_DEFAULT_URLS[full.provider as LocalProviderType] || '',
        apiKey: '',
        model: full.model || PROVIDER_MODELS[full.provider as LocalProviderType]?.[0] || '',
        temperature: full.temperature ?? 0.7,
        maxTokens: full.maxTokens ?? 4096,
        chatId: '',
        userId: '',
        token: '',
        capability: (full.capability as ProviderFormData['capability']) || 'chat',
        refAudioPresenter,
        refAudioExpert,
      })
    } catch {
      setFormData({
        name: provider.name,
        provider: provider.provider as LocalProviderType,
        baseUrl: provider.baseUrl || '',
        apiKey: '',
        model: provider.model || '',
        temperature: provider.temperature ?? 0.7,
        maxTokens: provider.maxTokens ?? 4096,
        chatId: '',
        userId: '',
        token: '',
        capability: (provider.capability as ProviderFormData['capability']) || 'chat',
        refAudioPresenter: '',
        refAudioExpert: '',
      })
    }
    setShowEditDialog(true)
  }

  const openCreate = (type?: LocalProviderType) => {
    const pType = type || 'OPENAI'
    setFormData({
      ...EMPTY_FORM,
      provider: pType,
      baseUrl: PROVIDER_DEFAULT_URLS[pType],
      model: PROVIDER_MODELS[pType]?.[0] || '',
      capability: PROVIDER_META[pType]?.defaultCapability || 'chat',
    })
    setShowCreateDialog(true)
  }

  // ─── Failover handlers ───
  const handleToggleFailover = async (enabled: boolean) => {
    setIsUpdatingFailoverConfig(true)
    try {
      const res = await fetch('/api/ai-providers/failover/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      if (!res.ok) throw new Error('Erreur')

      toast.success(
        enabled ? 'Failover activé' : 'Failover désactivé',
        {
          description: enabled
            ? 'Le système basculera automatiquement vers le prochain fournisseur en cas d\'échec'
            : 'Le basculement automatique est désactivé',
        }
      )
      refreshFailoverStatus()
    } catch {
      toast.error('Erreur', { description: 'Impossible de modifier la configuration' })
    } finally {
      setIsUpdatingFailoverConfig(false)
    }
  }

  const handleUpdateFailoverConfig = async (updates: Partial<FailoverConfig>) => {
    setIsUpdatingFailoverConfig(true)
    try {
      const res = await fetch('/api/ai-providers/failover/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) throw new Error('Erreur')

      toast.success('Configuration mise à jour')
      refreshFailoverStatus()
    } catch {
      toast.error('Erreur', { description: 'Impossible de mettre à jour la configuration' })
    } finally {
      setIsUpdatingFailoverConfig(false)
    }
  }

  const handleMoveProvider = async (providerId: string, direction: 'up' | 'down') => {
    if (!failoverStatus) return
    const providerList = [...failoverStatus.providers]
    const idx = providerList.findIndex(p => p.id === providerId)
    if (idx === -1) return
    if (direction === 'up' && idx === 0) return
    if (direction === 'down' && idx === providerList.length - 1) return

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    ;[providerList[idx], providerList[swapIdx]] = [providerList[swapIdx], providerList[idx]]

    const newPriorities = providerList.map((p, i) => ({
      id: p.id,
      priority: i + 1,
    }))

    setIsReordering(providerId)
    try {
      const res = await fetch('/api/ai-providers/priority', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priorities: newPriorities }),
      })
      if (!res.ok) throw new Error('Erreur')

      toast.success('Ordre mis à jour', {
        description: direction === 'up'
          ? `${providerList[idx].name} monté en priorité ${(idx + 1)}`
          : `${providerList[idx].name} descendu en priorité ${(idx + 1)}`,
      })
      refreshFailoverStatus()
    } catch {
      toast.error('Erreur', { description: 'Impossible de modifier l\'ordre' })
    } finally {
      setIsReordering(null)
    }
  }

  const handleResetHealth = async () => {
    setIsResettingHealth(true)
    try {
      const res = await fetch('/api/ai-providers/failover/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetAll: true }),
      })
      if (!res.ok) throw new Error('Erreur')

      toast.success('Santé réinitialisée', {
        description: 'Tous les compteurs de santé ont été remis à zéro',
      })
      refreshFailoverStatus()
    } catch {
      toast.error('Erreur', { description: 'Impossible de réinitialiser' })
    } finally {
      setIsResettingHealth(false)
    }
  }

  // ─── Failover helpers ───
  const formatTime = (ts: number | string | null | undefined) => {
    if (!ts) return '—'
    const date = typeof ts === 'string' ? new Date(ts) : new Date(ts)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffH = Math.floor(diffMin / 60)

    if (diffMin < 1) return 'À l\'instant'
    if (diffMin < 60) return `Il y a ${diffMin}min`
    if (diffH < 24) return `Il y a ${diffH}h`
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  const formatEventType = (type: string) => {
    switch (type) {
      case 'FAIL_OVER': return { label: 'Basculement', color: 'text-warning bg-warning/10', icon: ArrowRightLeft, badge: 'warning' as const }
      case 'RECOVERY': return { label: 'Récupération', color: 'text-success-text bg-success/10', icon: CheckCircle2, badge: 'success' as const }
      case 'MANUAL_SWITCH': return { label: 'Manuel', color: 'text-secondary bg-secondary/10', icon: Settings2, badge: 'secondary' as const }
      case 'COOLDOWN_EXPIRED': return { label: 'Cooldown', color: 'text-info bg-info/10', icon: Timer, badge: 'info' as const }
      case 'ALL_FAILED': return { label: 'Échec total', color: 'text-destructive bg-destructive/10', icon: AlertTriangle, badge: 'danger' as const }
      default: return { label: type, color: 'text-muted-foreground bg-muted', icon: Activity, badge: 'default' as const }
    }
  }

  // Helper : carte statut health → variant Badge
  const healthStatusVariant = (status: ProviderWithHealth['status']) => {
    switch (status) {
      case 'HEALTHY': return 'success' as const
      case 'DEGRADED': return 'warning' as const
      case 'COOLING_DOWN': return 'danger' as const
      case 'UNKNOWN': return 'info' as const
      default: return 'default' as const
    }
  }

  const healthStatusLabel = (status: ProviderWithHealth['status']) => {
    switch (status) {
      case 'HEALTHY': return 'Sain'
      case 'DEGRADED': return 'Dégradé'
      case 'COOLING_DOWN': return 'Cooldown'
      case 'UNKNOWN': return 'Inconnu'
      default: return status
    }
  }

  // Helper pour récupérer le meta d'un provider (avec fallback)
  const getProviderMeta = (providerType: string): ProviderMeta => {
    return PROVIDER_META[providerType as LocalProviderType] || PROVIDER_META.OPENAI_COMPATIBLE
  }

  // ─── Loading state ───
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="ds-kente-strip rounded-t-lg" />
        <div className="flex items-center justify-between">
          <div>
            <PulseSkeleton className="h-8 w-56 mb-2" />
            <PulseSkeleton className="h-4 w-80" />
          </div>
          <PulseSkeleton className="h-11 w-32" />
        </div>
        <StatCardSkeletonGrid count={4} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <PulseSkeleton key={i} className="h-64 w-full" variant="card" />
          ))}
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════════

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative space-y-5">
        {/* ─── Bande kente supérieure (signature africaine) ─── */}
        <div className="ds-kente-strip rounded-t-lg" aria-hidden="true" />

        {/* ═══════════ Header « Savane EdTech » ═══════════ */}
        <header className="relative overflow-hidden rounded-xl border border-border bg-card ds-kente-watermark">
          {/* Bande kente verticale (bord droit) */}
          <div
            className="absolute top-0 bottom-0 right-0 w-2 z-10 pointer-events-none"
            aria-hidden="true"
            style={{
              backgroundImage: `repeating-linear-gradient(
                0deg,
                #84CC16 0px, #84CC16 40px,
                #C2410C 40px, #C2410C 80px,
                #F59E0B 80px, #F59E0B 120px,
                #2C3E50 120px, #2C3E50 160px
              )`,
            }}
          />

          {/* Losanges kente décoratifs (très subtils) */}
          <KenteDiamond className="absolute top-3 right-8 w-20 h-20 text-gold opacity-[0.06] pointer-events-none" />
          <KenteDiamond className="absolute bottom-2 right-16 w-14 h-14 text-primary opacity-[0.04] pointer-events-none" />

          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 pr-6">
            <div className="flex items-center gap-4">
              {/* Icône dans un badge gradient lime → or */}
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-gold flex items-center justify-center shadow-md shrink-0">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight font-display flex items-center gap-2">
                  Fournisseurs IA
                  {failoverStatus?.config.enabled && (
                    <span className="h-2 w-2 rounded-full bg-success animate-pulse" title="Failover actif" />
                  )}
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                  Gérez vos fournisseurs d&apos;intelligence artificielle et le basculement automatique
                </p>
              </div>
            </div>
            <Button
              className="bg-gradient-to-r from-primary to-lime-600 hover:from-primary/90 hover:to-lime-600/90 text-white shrink-0 ds-press"
              onClick={() => openCreate()}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Ajouter
            </Button>
          </div>
        </header>

        {/* ═══════════ Stats bar compacte ═══════════ */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 rounded-lg bg-muted/50 border border-border/50 text-sm ds-kente-pattern-subtle">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Layers className="h-3.5 w-3.5" />
            <span className="text-xs">{providers.length} fournisseur{providers.length !== 1 ? 's' : ''}</span>
          </div>
          <Separator orientation="vertical" className="h-4" />
          <div className="flex items-center gap-1.5">
            {activeChatProvider ? (
              <>
                <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                <span className="text-xs font-medium">Chat&nbsp;: {activeChatProvider.name}</span>
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-warning" />
                <span className="text-xs text-warning">Aucun chat actif</span>
              </>
            )}
          </div>
          {activeTtsProvider && (
            <>
              <Separator orientation="vertical" className="h-4" />
              <div className="flex items-center gap-1.5">
                <AudioLines className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                <span className="text-xs font-medium">Voix&nbsp;: {activeTtsProvider.name}</span>
              </div>
            </>
          )}
          <Separator orientation="vertical" className="h-4" />
          <div className="flex items-center gap-1.5">
            {activeProvider?.lastTestOk === true ? (
              <><Wifi className="h-3.5 w-3.5 text-success-text" /><span className="text-xs text-success-text">Test OK</span></>
            ) : activeProvider?.lastTestOk === false ? (
              <><WifiOff className="h-3.5 w-3.5 text-destructive" /><span className="text-xs text-destructive">Test échoué</span></>
            ) : (
              <><Activity className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-xs text-muted-foreground">Non testé</span></>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {activeProvider && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={openModelSwitcher}
              >
                <Layers className="h-3 w-3" />
                <span className="hidden sm:inline">Changer modèle</span>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={handleTestAll}
              disabled={isTestingAll || providers.length === 0}
            >
              {isTestingAll ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              Tout tester
            </Button>
          </div>
        </div>

        {/* ═══════════ Tabs (3 sections) ═══════════ */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="providers" className="gap-1.5">
              <Zap className="h-3.5 w-3.5" />
              Fournisseurs
            </TabsTrigger>
            <TabsTrigger value="failover" className="gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" />
              Failover &amp; Santé
              {failoverStatus?.config.enabled && (
                <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
              )}
            </TabsTrigger>
            <TabsTrigger value="diagnostics" className="gap-1.5">
              <Cpu className="h-3.5 w-3.5" />
              Diagnostics
            </TabsTrigger>
          </TabsList>

          {/* ═══════════════════════ Tab 1: Fournisseurs ═══════════════════════ */}
          <TabsContent value="providers" className="mt-4">
            {providers.length === 0 ? (
              /* ─── Empty State ─── */
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center py-16 px-4"
              >
                <div className="p-4 rounded-full bg-secondary/10 mb-4 relative">
                  <Server className="h-8 w-8 text-secondary" />
                  <KenteDiamond className="absolute -top-2 -right-2 w-8 h-8 text-gold opacity-30" />
                </div>
                <h3 className="text-lg font-semibold mb-1 font-display tracking-tight">Aucun fournisseur IA configuré</h3>
                <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
                  Le système utilise <strong>Z-AI par défaut</strong>. Ajoutez un fournisseur pour personnaliser le comportement de l&apos;IA.
                </p>
                <Button
                  className="bg-gradient-to-r from-primary to-lime-600 hover:from-primary/90 hover:to-lime-600/90 text-white"
                  onClick={() => openCreate()}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Ajouter un fournisseur
                </Button>
              </motion.div>
            ) : (
              /* ─── Provider Grid (EntityCard) ─── */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <AnimatePresence mode="popLayout">
                  {providers.map((provider, index) => {
                    const meta = getProviderMeta(provider.provider)
                    const Icon = meta.icon
                    const isTesting = testingId === provider.id
                    const isActivating = activatingId === provider.id
                    const isActive = provider.isActive

                    // Health depuis le failover status (si disponible)
                    const healthInfo = failoverStatus?.providers.find(p => p.id === provider.id)
                    const successRate = healthInfo?.health && healthInfo.health.totalCalls > 0
                      ? ((healthInfo.health.totalCalls - healthInfo.health.totalFailures) / healthInfo.health.totalCalls) * 100
                      : null

                    return (
                      <motion.div
                        key={provider.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2, delay: index * 0.04 }}
                        className={`rounded-lg ds-lift ${isActive ? 'ds-glow-gold' : ''}`}
                      >
                        <EntityCard
                          title={provider.name}
                          subtitle={provider.model || '—'}
                          thumbnailIcon={Icon}
                          badge={{
                            label: `P${provider.priority}`,
                            variant: isActive ? 'success' : 'primary',
                          }}
                          meta={`T: ${provider.temperature ?? 0.7} · Max: ${provider.maxTokens ?? 4096} · Dernier test: ${formatTime(provider.lastTestAt)}`}
                          index={index}
                        >
                          {/* ─── Base URL (info technique) ─── */}
                          {provider.baseUrl && (
                            <p className="mt-2 text-[10px] text-muted-foreground truncate font-mono" title={provider.baseUrl}>
                              {provider.baseUrl}
                            </p>
                          )}

                          {/* ─── Badges row (Actif + capability + test status) ─── */}
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {isActive ? (
                              <Badge variant="success" size="sm" className="gap-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                                Actif
                              </Badge>
                            ) : (
                              <Badge variant="default" size="sm">Inactif</Badge>
                            )}
                            {provider.capability && (
                              <Badge
                                variant={provider.capability === 'tts' ? 'gold' : provider.capability === 'audio' ? 'danger' : 'info'}
                                size="sm"
                                className="gap-1"
                              >
                                {provider.capability === 'tts' && <AudioLines className="h-2.5 w-2.5" />}
                                {provider.capability === 'audio' && <Mic className="h-2.5 w-2.5" />}
                                {provider.capability.toUpperCase()}
                              </Badge>
                            )}
                            {provider.hasApiKey && (
                              <Badge variant="success" size="sm" className="gap-1">
                                <Shield className="h-2.5 w-2.5" />
                                Clé
                              </Badge>
                            )}
                            {provider.lastTestOk === true && (
                              <span className="flex items-center justify-center h-5 w-5 rounded-full bg-success/10 text-success-text" title="Test OK">
                                <Check className="h-3 w-3" />
                              </span>
                            )}
                            {provider.lastTestOk === false && (
                              <span className="flex items-center justify-center h-5 w-5 rounded-full bg-destructive/10 text-destructive" title="Test échoué">
                                <X className="h-3 w-3" />
                              </span>
                            )}
                            {provider.lastTestOk == null && (
                              <span className="flex items-center justify-center h-5 w-5 rounded-full bg-warning/10 text-warning" title="Non testé">
                                <AlertCircle className="h-3 w-3" />
                              </span>
                            )}
                          </div>

                          {/* ─── Mini health bar (si failover status disponible) ─── */}
                          {successRate !== null && (
                            <div className="mt-3">
                              <ProgressBar
                                value={successRate}
                                accent={successRate >= 80 ? 'success' : successRate >= 50 ? 'warning' : 'destructive'}
                                size="sm"
                                label="Taux de succès"
                                index={index}
                              />
                            </div>
                          )}

                          {/* ─── Action buttons (touch-friendly ≥ 40px) ─── */}
                          <div className="mt-4 flex items-center gap-1.5">
                            {!isActive && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-10 gap-1 text-xs flex-1"
                                onClick={() => handleActivate(provider.id)}
                                disabled={isActivating}
                                aria-label={`Activer ${provider.name}`}
                              >
                                {isActivating ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Power className="h-3.5 w-3.5" />
                                )}
                                <span>Activer</span>
                              </Button>
                            )}
                            {isActive && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-10 gap-1 text-xs flex-1"
                                onClick={() => handleActivate(provider.id, false)}
                                disabled={isActivating}
                                aria-label={`Désactiver ${provider.name}`}
                              >
                                {isActivating ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Power className="h-3.5 w-3.5" />
                                )}
                                <span>Désactiver</span>
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-10 w-10 p-0"
                              onClick={() => handleTest(provider.id)}
                              disabled={isTesting}
                              aria-label={`Tester ${provider.name}`}
                              title="Tester la connexion"
                            >
                              {isTesting ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-10 w-10 p-0"
                              onClick={() => openEdit(provider)}
                              aria-label={`Modifier ${provider.name}`}
                              title="Modifier"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-10 w-10 p-0 text-destructive hover:text-destructive"
                              onClick={() => {
                                setSelectedProvider(provider)
                                setShowDeleteDialog(true)
                              }}
                              aria-label={`Supprimer ${provider.name}`}
                              title={provider.isActive ? 'Supprimer (désactivera d’abord)' : 'Supprimer'}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </EntityCard>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>
            )}
          </TabsContent>

          {/* ═══════════════════════ Tab 2: Failover & Santé ═══════════════════════ */}
          <TabsContent value="failover" className="mt-4">
            {isFailoverLoading ? (
              <div className="space-y-4">
                <StatCardSkeletonGrid count={5} />
                <PulseSkeleton className="h-48 w-full" variant="card" />
                <PulseSkeleton className="h-32 w-full" variant="card" />
              </div>
            ) : failoverStatus ? (
              <div className="space-y-5">
                {/* ─── Enable/Disable Toggle + ProgressRing global ─── */}
                <div className="relative overflow-hidden rounded-xl border border-border bg-card p-4 ds-kente-top">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-success/10">
                        <ShieldCheck className="h-5 w-5 text-success-text" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold font-display flex items-center gap-2">
                          Basculement automatique (Failover)
                          {failoverStatus.config.enabled && (
                            <Badge variant="success" size="sm" className="gap-1">
                              <HeartPulse className="h-3 w-3 animate-pulse" />
                              Actif
                            </Badge>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Bascule vers un autre fournisseur si l&apos;actif échoue
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {/* ProgressRing : % healthy */}
                      {failoverStatus.summary.totalProviders > 0 && (
                        <ProgressRing
                          value={(failoverStatus.summary.healthy / failoverStatus.summary.totalProviders) * 100}
                          size={64}
                          strokeWidth={6}
                          accent={failoverStatus.summary.healthy === failoverStatus.summary.totalProviders ? 'success' : 'warning'}
                          sublabel="Sains"
                          index={0}
                        />
                      )}
                      <Switch
                        checked={failoverStatus.config.enabled}
                        onCheckedChange={handleToggleFailover}
                        disabled={isUpdatingFailoverConfig || failoverStatus.summary.totalProviders < 2}
                        aria-label="Activer le failover"
                      />
                    </div>
                  </div>
                </div>

                {/* Warning si < 2 providers */}
                {failoverStatus.summary.totalProviders < 2 && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30">
                    <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                    <p className="text-xs text-warning">
                      <strong>Minimum 2 fournisseurs requis.</strong> Ajoutez au moins un fournisseur de secours pour que le failover fonctionne.
                    </p>
                  </div>
                )}

                {/* ─── StatCards grid (5 métriques) ─── */}
                <div role="status" aria-label="Métriques du failover" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  <StatCard
                    label="Total providers"
                    value={failoverStatus.summary.totalProviders}
                    icon={Layers}
                    accent="primary"
                    index={0}
                  />
                  <StatCard
                    label="Sains"
                    value={failoverStatus.summary.healthy}
                    icon={CheckCircle2}
                    accent="success"
                    index={1}
                  />
                  <StatCard
                    label="Dégradés"
                    value={failoverStatus.summary.degraded}
                    icon={AlertTriangle}
                    accent="warning"
                    index={2}
                  />
                  <StatCard
                    label="Cooldown"
                    value={failoverStatus.summary.coolingDown}
                    icon={Clock}
                    accent="info"
                    index={3}
                  />
                  <StatCard
                    label="Basculements 24h"
                    value={failoverStatus.summary.last24hEvents}
                    icon={TrendingUp}
                    accent="gold"
                    hint={`Total cumulé : ${failoverStatus.summary.totalFailovers}`}
                    index={4}
                  />
                </div>

                {/* ─── Configuration failover ─── */}
                <div className="rounded-xl border border-border bg-card overflow-hidden ds-kente-top">
                  <div className="p-4 border-b border-border/50">
                    <h3 className="text-sm font-semibold font-display flex items-center gap-1.5">
                      <Settings2 className="h-4 w-4" />
                      Configuration
                    </h3>
                  </div>
                  <div className="p-4 space-y-4">
                    {/* maxConsecutiveFailures slider */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-xs font-medium">Échecs avant cooldown</Label>
                          <p className="text-[10px] text-muted-foreground">Nombre d&apos;échecs consécutifs avant mise en cooldown</p>
                        </div>
                        <Badge variant="secondary" size="md" className="font-mono tabular-nums">
                          {failoverStatus.config.maxConsecutiveFailures}
                        </Badge>
                      </div>
                      <Slider
                        value={[failoverStatus.config.maxConsecutiveFailures]}
                        min={1}
                        max={10}
                        step={1}
                        onValueChange={([v]) => handleUpdateFailoverConfig({ maxConsecutiveFailures: v })}
                        disabled={isUpdatingFailoverConfig}
                      />
                    </div>

                    <Separator />

                    {/* cooldownDurationMs slider + presets */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-xs font-medium">Durée de cooldown</Label>
                          <p className="text-[10px] text-muted-foreground">Temps d&apos;attente avant réessai du provider</p>
                        </div>
                        <Badge variant="info" size="md" className="font-mono tabular-nums">
                          {Math.round(failoverStatus.config.cooldownDurationMs / 1000)}s
                        </Badge>
                      </div>
                      <Slider
                        value={[Math.min(failoverStatus.config.cooldownDurationMs, 60000)]}
                        min={1000}
                        max={60000}
                        step={1000}
                        onValueChange={([v]) => handleUpdateFailoverConfig({ cooldownDurationMs: v })}
                        disabled={isUpdatingFailoverConfig}
                      />
                      {/* Presets pour durées longues */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {[
                          { label: '1m', value: 60_000 },
                          { label: '5m', value: 300_000 },
                          { label: '15m', value: 900_000 },
                          { label: '30m', value: 1_800_000 },
                        ].map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => handleUpdateFailoverConfig({ cooldownDurationMs: opt.value })}
                            disabled={isUpdatingFailoverConfig}
                            className={`h-7 px-2.5 rounded-md text-[11px] font-bold transition-all ${
                              failoverStatus.config.cooldownDurationMs === opt.value
                                ? 'bg-primary text-primary-text'
                                : 'bg-muted text-muted-foreground hover:bg-muted/80'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <Separator />

                    {/* retryAllProviders switch */}
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-xs font-medium">Réessayer tous les fournisseurs</Label>
                        <p className="text-[10px] text-muted-foreground">
                          Si activé, le système réessaie tous les fournisseurs même après un cooldown
                        </p>
                      </div>
                      <Switch
                        checked={failoverStatus.config.retryAllProviders}
                        onCheckedChange={(v) => handleUpdateFailoverConfig({ retryAllProviders: v })}
                        disabled={isUpdatingFailoverConfig}
                        aria-label="Réessayer tous les fournisseurs"
                      />
                    </div>

                    {/* Reset health */}
                    <Separator />
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1.5"
                        onClick={handleResetHealth}
                        disabled={isResettingHealth}
                      >
                        {isResettingHealth ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                        Réinitialiser la santé
                      </Button>
                    </div>
                  </div>
                </div>

                {/* ─── Ordre de priorité ─── */}
                {failoverStatus.providers.length > 0 && (
                  <div className="rounded-xl border border-border bg-card overflow-hidden ds-kente-top">
                    <div className="p-4 border-b border-border/50">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold font-display flex items-center gap-1.5">
                          <ArrowUpDown className="h-4 w-4" />
                          Ordre de failover
                        </h3>
                        <span className="text-[10px] text-muted-foreground">
                          Utilisez les flèches pour réordonner
                        </span>
                      </div>
                    </div>
                    <div className="p-4 space-y-2">
                      <AnimatePresence mode="popLayout">
                        {failoverStatus.providers.map((p, idx) => {
                          const meta = getProviderMeta(p.provider)
                          const PIcon = meta.icon
                          return (
                            <motion.div
                              key={p.id}
                              layout
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: 10 }}
                              transition={{ duration: 0.15, delay: idx * 0.02 }}
                              className={`flex items-center gap-2 sm:gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                                p.status === 'COOLING_DOWN'
                                  ? 'border-destructive/30 bg-destructive/10'
                                  : p.status === 'DEGRADED'
                                    ? 'border-warning/30 bg-warning/10'
                                    : p.status === 'UNKNOWN'
                                      ? 'border-muted-foreground/20 bg-muted/20'
                                      : p.isActive
                                        ? 'border-secondary/30 bg-secondary/10'
                                        : 'border-border'
                              }`}
                            >
                              {/* Priority number */}
                              <div className={`flex items-center justify-center h-7 w-7 rounded-full text-[11px] font-bold shrink-0 ${
                                idx === 0
                                  ? 'bg-gradient-to-br from-primary to-lime-600 text-white'
                                  : 'bg-muted text-muted-foreground'
                              }`}>
                                {idx + 1}
                              </div>

                              {/* Provider icon */}
                              <div className={`p-1.5 rounded-md shrink-0 ${meta.bgClass}`}>
                                <PIcon className="h-3.5 w-3.5" style={{ color: meta.color }} />
                              </div>

                              {/* Provider info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium truncate">{p.name}</span>
                                  {p.isActive && (
                                    <Badge variant="secondary" size="sm" className="shrink-0">PRINCIPAL</Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[11px] text-muted-foreground font-mono tabular-nums">{p.model || '—'}</span>
                                  {p.health && p.health.totalCalls > 0 && (
                                    <span className="text-[10px] text-muted-foreground">
                                      {p.health.totalCalls} appels · {(p.health.totalFailures / p.health.totalCalls * 100).toFixed(0)}% échec
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Status indicator (gère UNKNOWN) */}
                              <div className="hidden sm:flex items-center shrink-0">
                                <Badge variant={healthStatusVariant(p.status)} size="sm" className="gap-1">
                                  {p.status === 'HEALTHY' && <CheckCircle2 className="h-3 w-3" />}
                                  {p.status === 'DEGRADED' && <AlertTriangle className="h-3 w-3" />}
                                  {p.status === 'COOLING_DOWN' && <Clock className="h-3 w-3" />}
                                  {p.status === 'UNKNOWN' && <HelpCircle className="h-3 w-3" />}
                                  {healthStatusLabel(p.status)}
                                  {p.status === 'DEGRADED' && p.health?.consecutiveFailures && (
                                    <span className="ml-0.5">({p.health.consecutiveFailures}/{failoverStatus.config.maxConsecutiveFailures})</span>
                                  )}
                                </Badge>
                              </div>

                              {/* Reorder buttons */}
                              <div className="flex flex-col gap-0.5 shrink-0">
                                <button
                                  onClick={() => handleMoveProvider(p.id, 'up')}
                                  disabled={idx === 0 || isReordering !== null}
                                  className={`h-7 w-7 rounded-md flex items-center justify-center border transition-colors ${
                                    idx === 0
                                      ? 'border-border/30 text-muted-foreground/20 cursor-not-allowed'
                                      : 'border-border/60 text-muted-foreground hover:bg-primary/10 hover:text-primary-text hover:border-primary/30'
                                  }`}
                                  aria-label={`Monter ${p.name} en priorité`}
                                >
                                  {isReordering === p.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <ChevronUp className="h-3.5 w-3.5" />
                                  )}
                                </button>
                                <button
                                  onClick={() => handleMoveProvider(p.id, 'down')}
                                  disabled={idx === failoverStatus.providers.length - 1 || isReordering !== null}
                                  className={`h-7 w-7 rounded-md flex items-center justify-center border transition-colors ${
                                    idx === failoverStatus.providers.length - 1
                                      ? 'border-border/30 text-muted-foreground/20 cursor-not-allowed'
                                      : 'border-border/60 text-muted-foreground hover:bg-primary/10 hover:text-primary-text hover:border-primary/30'
                                  }`}
                                  aria-label={`Descendre ${p.name} en priorité`}
                                >
                                  {isReordering === p.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              </div>
                            </motion.div>
                          )
                        })}
                      </AnimatePresence>
                    </div>
                  </div>
                )}

                {/* ─── Timeline des événements récents ─── */}
                {failoverStatus.recentEvents.length > 0 && (
                  <div className="rounded-xl border border-border bg-card overflow-hidden ds-kente-top">
                    <div className="p-4 border-b border-border/50">
                      <div
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => setIsEventsExpanded(!isEventsExpanded)}
                      >
                        <h3 className="text-sm font-semibold font-display flex items-center gap-1.5">
                          <Activity className="h-4 w-4" />
                          Événements récents
                          <Badge variant="default" size="sm" className="ml-1">
                            24 dernières heures
                          </Badge>
                        </h3>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label={isEventsExpanded ? 'Réduire' : 'Développer'}>
                          {isEventsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    <AnimatePresence>
                      {isEventsExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="p-4">
                            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                              {failoverStatus.recentEvents.map((event) => {
                                const typeInfo = formatEventType(event.eventType)
                                const TypeIcon = typeInfo.icon
                                return (
                                  <div
                                    key={event.id}
                                    className="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-muted/30 border border-border/50"
                                  >
                                    <div className={`p-1.5 rounded shrink-0 ${typeInfo.color}`}>
                                      <TypeIcon className="h-3.5 w-3.5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-xs font-medium">{typeInfo.label}</span>
                                        {event.fromProvider && (
                                          <span className="text-[10px] text-muted-foreground">
                                            {event.fromProvider}
                                            {event.toProvider && (
                                              <> → <span className="font-medium">{event.toProvider}</span></>
                                            )}
                                          </span>
                                        )}
                                        {event.resolved && (
                                          <Badge variant="success" size="sm" className="gap-0.5">
                                            <CheckCircle2 className="h-2.5 w-2.5" />
                                            Résolu
                                          </Badge>
                                        )}
                                      </div>
                                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                                        {event.reason}
                                      </p>
                                    </div>
                                    <span className="text-[10px] text-muted-foreground shrink-0">
                                      {formatTime(event.createdAt)}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* ─── How it works ─── */}
                <div className="p-3 rounded-lg bg-muted/30 border border-dashed border-border/50">
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    <strong className="text-foreground">Comment ça marche ?</strong> Lorsqu&apos;un fournisseur IA échoue {failoverStatus.config.maxConsecutiveFailures} fois
                    consécutivement, il est mis en cooldown pendant {Math.ceil(failoverStatus.config.cooldownDurationMs / 60000)} min.
                    Le système bascule automatiquement vers le fournisseur suivant dans l&apos;ordre de priorité.
                    Après le cooldown, le fournisseur est automatiquement réessayé.
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <ShieldCheck className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Impossible de charger le statut du failover</p>
              </div>
            )}
          </TabsContent>

          {/* ═══════════════════════ Tab 3: Diagnostics ═══════════════════════ */}
          <TabsContent value="diagnostics" className="mt-4">
            {isFailoverLoading ? (
              <div className="space-y-4">
                <PulseSkeleton className="h-48 w-full" variant="card" />
                <PulseSkeleton className="h-32 w-full" variant="card" />
              </div>
            ) : failoverStatus ? (
              <div className="space-y-5">
                {/* ─── Per-provider diagnostics ─── */}
                <div className="rounded-xl border border-border bg-card overflow-hidden ds-kente-top">
                  <div className="p-4 border-b border-border/50">
                    <h3 className="text-sm font-semibold font-display flex items-center gap-1.5">
                      <Cpu className="h-4 w-4" />
                      Diagnostics par fournisseur
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Taux de succès, appels et échecs pour chaque provider
                    </p>
                  </div>
                  <div className="p-4 space-y-3">
                    {failoverStatus.providers.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">Aucun fournisseur à diagnostiquer</p>
                    ) : (
                      failoverStatus.providers.map((p, idx) => {
                        const meta = getProviderMeta(p.provider)
                        const PIcon = meta.icon
                        const h = p.health
                        const successRate = h && h.totalCalls > 0
                          ? ((h.totalCalls - h.totalFailures) / h.totalCalls) * 100
                          : null
                        const failureRate = h && h.totalCalls > 0
                          ? (h.totalFailures / h.totalCalls) * 100
                          : 0

                        return (
                          <motion.div
                            key={p.id}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.03 }}
                            className="p-3 rounded-lg border border-border/50 bg-muted/20"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <div className={`p-1.5 rounded-md shrink-0 ${meta.bgClass}`}>
                                <PIcon className="h-4 w-4" style={{ color: meta.color }} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium truncate">{p.name}</span>
                                  <Badge variant={healthStatusVariant(p.status)} size="sm">
                                    {healthStatusLabel(p.status)}
                                  </Badge>
                                  {p.isActive && <Badge variant="success" size="sm">Actif</Badge>}
                                </div>
                                <span className="text-[11px] text-muted-foreground font-mono">{p.model || '—'}</span>
                              </div>
                            </div>

                            {h ? (
                              <>
                                {/* Success rate */}
                                {successRate !== null && (
                                  <div className="mb-2">
                                    <ProgressBar
                                      value={successRate}
                                      accent={successRate >= 80 ? 'success' : successRate >= 50 ? 'warning' : 'destructive'}
                                      size="sm"
                                      label="Taux de succès"
                                      index={idx}
                                    />
                                  </div>
                                )}

                                {/* Stats grid */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                                  <div className="p-1.5 rounded bg-muted/50">
                                    <p className="text-muted-foreground">Appels</p>
                                    <p className="font-mono font-bold tabular-nums">{h.totalCalls}</p>
                                  </div>
                                  <div className="p-1.5 rounded bg-muted/50">
                                    <p className="text-muted-foreground">Échecs</p>
                                    <p className="font-mono font-bold tabular-nums text-destructive">{h.totalFailures}</p>
                                  </div>
                                  <div className="p-1.5 rounded bg-muted/50">
                                    <p className="text-muted-foreground">Basculements</p>
                                    <p className="font-mono font-bold tabular-nums text-warning">{h.totalFailovers}</p>
                                  </div>
                                  <div className="p-1.5 rounded bg-muted/50">
                                    <p className="text-muted-foreground">Échecs cons.</p>
                                    <p className="font-mono font-bold tabular-nums">{h.consecutiveFailures}</p>
                                  </div>
                                </div>

                                {/* Timestamps */}
                                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[10px] text-muted-foreground">
                                  <span>Dernier succès : {formatTime(h.lastSuccessAt)}</span>
                                  <span>Dernier échec : {formatTime(h.lastFailureAt)}</span>
                                  {h.isCoolingDown && (
                                    <Badge variant="danger" size="sm" className="gap-0.5">
                                      <Clock className="h-2.5 w-2.5" />
                                      En cooldown
                                    </Badge>
                                  )}
                                </div>
                              </>
                            ) : (
                              <p className="text-[11px] text-muted-foreground italic">
                                Aucune donnée de santé — le provider n&apos;a pas encore été sollicité.
                              </p>
                            )}
                          </motion.div>
                        )
                      })
                    )}
                  </div>
                </div>

                {/* ─── Event log complet ─── */}
                <div className="rounded-xl border border-border bg-card overflow-hidden ds-kente-top">
                  <div className="p-4 border-b border-border/50">
                    <h3 className="text-sm font-semibold font-display flex items-center gap-1.5">
                      <Activity className="h-4 w-4" />
                      Journal des événements
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {failoverStatus.recentEvents.length} événement(s) sur les dernières 24h
                    </p>
                  </div>
                  <div className="p-4">
                    {failoverStatus.recentEvents.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">Aucun événement récent</p>
                    ) : (
                      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                        {failoverStatus.recentEvents.map((event) => {
                          const typeInfo = formatEventType(event.eventType)
                          const TypeIcon = typeInfo.icon
                          return (
                            <div
                              key={event.id}
                              className="px-3 py-2 rounded-lg bg-muted/30 border border-border/50"
                            >
                              <div className="flex items-start gap-2.5">
                                <div className={`p-1.5 rounded shrink-0 ${typeInfo.color}`}>
                                  <TypeIcon className="h-3.5 w-3.5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-xs font-medium">{typeInfo.label}</span>
                                    {event.fromProvider && (
                                      <span className="text-[10px] text-muted-foreground">
                                        {event.fromProvider}
                                        {event.toProvider && (
                                          <> → <span className="font-medium">{event.toProvider}</span></>
                                        )}
                                      </span>
                                    )}
                                    {event.resolved && (
                                      <Badge variant="success" size="sm" className="gap-0.5">
                                        <CheckCircle2 className="h-2.5 w-2.5" />
                                        Résolu
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    {event.reason}
                                  </p>
                                  {event.errorDetails && (
                                    <p className="text-[10px] text-destructive/80 mt-1 font-mono break-all">
                                      {event.errorDetails}
                                    </p>
                                  )}
                                </div>
                                <span className="text-[10px] text-muted-foreground shrink-0">
                                  {formatTime(event.createdAt)}
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <Cpu className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Impossible de charger les diagnostics</p>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* ═══════════════════════ Dialogues ═══════════════════════ */}

        {/* ─── Create Dialog (GlassModal) ─── */}
        <GlassModal
          open={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
          title="Ajouter un fournisseur IA"
          description="Configurez un nouveau fournisseur d'intelligence artificielle"
          size="lg"
          footer={
            <div className="flex items-center justify-between gap-2 w-full">
              <div />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Annuler
                </Button>
                <Button
                  className="bg-gradient-to-r from-primary to-lime-600 hover:from-primary/90 hover:to-lime-600/90 text-white"
                  onClick={handleCreate}
                  disabled={isSaving || !formData.name}
                >
                  {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Créer le fournisseur
                </Button>
              </div>
            </div>
          }
        >
          <ProviderForm
            formData={formData}
            setFormData={setFormData}
            showApiKey={showApiKey}
            setShowApiKey={setShowApiKey}
          />
        </GlassModal>

        {/* ─── Edit Dialog (GlassModal) ─── */}
        <GlassModal
          open={showEditDialog}
          onClose={() => setShowEditDialog(false)}
          title="Modifier le fournisseur"
          description={`Modifier la configuration de « ${selectedProvider?.name ?? ''} »`}
          size="lg"
          footer={
            <div className="flex items-center justify-between gap-2 w-full">
              <div>
                {selectedProvider && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => handleTest(selectedProvider.id)}
                    disabled={testingId === selectedProvider.id}
                  >
                    {testingId === selectedProvider.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plug className="h-3.5 w-3.5" />
                    )}
                    Tester la connexion
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                  Annuler
                </Button>
                <Button
                  className="bg-gradient-to-r from-primary to-lime-600 hover:from-primary/90 hover:to-lime-600/90 text-white"
                  onClick={handleUpdate}
                  disabled={isSaving || !formData.name}
                >
                  {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Enregistrer
                </Button>
              </div>
            </div>
          }
        >
          <ProviderForm
            formData={formData}
            setFormData={setFormData}
            showApiKey={showApiKey}
            setShowApiKey={setShowApiKey}
            isEdit
          />
        </GlassModal>

        {/* ─── Delete Confirmation (AlertDialog — destructive) ───
            Context-aware : si le provider est ACTIF, on explique qu'il sera
            désactivé d'abord puis supprimé (règle backend 409 Conflict). */}
        <AlertDialog
          open={showDeleteDialog}
          onOpenChange={(open) => { if (!isDeleting) setShowDeleteDialog(open) }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {selectedProvider?.isActive
                  ? 'Désactiver puis supprimer le fournisseur ?'
                  : 'Supprimer le fournisseur ?'}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <span>
                  {selectedProvider?.isActive ? (
                    <>
                      Le fournisseur « <strong className="text-foreground">{selectedProvider?.name}</strong> » est
                      actuellement <strong className="text-foreground">actif</strong>. Pour le supprimer, il sera
                      d'abord <strong className="text-foreground">désactivé</strong> (bascule du failover sur le
                      provider suivant), puis supprimé définitivement. Cette action est irréversible.
                    </>
                  ) : (
                    <>
                      Êtes-vous sûr de vouloir supprimer « <strong className="text-foreground">{selectedProvider?.name}</strong> » ?
                      Cette action est irréversible.
                    </>
                  )}
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Annuler</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Suppression…
                  </span>
                ) : selectedProvider?.isActive ? (
                  'Désactiver puis supprimer'
                ) : (
                  'Supprimer'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ─── Model Switcher (GlassModal) ─── */}
        <GlassModal
          open={showModelSwitcher}
          onClose={() => setShowModelSwitcher(false)}
          title="Changer de modèle"
          description={
            activeProvider
              ? `Sélectionnez un modèle pour ${activeProvider.name}. Modèle actuel : ${activeProvider.model ?? '—'}`
              : 'Sélectionnez un modèle'
          }
          size="md"
        >
          <div className="space-y-3">
            {isLoadingModels ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary-text" />
                <span className="ml-2 text-sm text-muted-foreground">Chargement des modèles...</span>
              </div>
            ) : dynamicModels.length > 0 ? (
              <div className="max-h-80 overflow-y-auto space-y-1 pr-1">
                {dynamicModels.map((model) => (
                  <button
                    key={model}
                    onClick={() => handleQuickModelSwitch(model)}
                    disabled={switchingModel !== null}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-all flex items-center justify-between group ${
                      model === activeProvider?.model
                        ? 'border-primary/30 bg-primary/10'
                        : 'border-transparent hover:border-primary/30 hover:bg-primary/10'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {model === activeProvider?.model ? (
                        <Check className="h-4 w-4 text-primary-text shrink-0" />
                      ) : (
                        <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 shrink-0 group-hover:border-primary-text" />
                      )}
                      <span className={`font-mono text-xs ${model === activeProvider?.model ? 'font-bold text-primary-text' : ''}`}>
                        {model}
                      </span>
                    </div>
                    {switchingModel === model && (
                      <Loader2 className="h-4 w-4 animate-spin text-primary-text" />
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Impossible de charger les modèles</p>
                <p className="text-xs text-muted-foreground mt-1">Saisissez un modèle manuellement ci-dessous</p>
              </div>
            )}
            <div className="border-t pt-3 space-y-2">
              <Label className="text-xs text-muted-foreground">Ou saisir un modèle manuellement :</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="nom-du-modèle"
                  className="flex-1 text-sm font-mono tabular-nums"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const target = e.target as HTMLInputElement
                      if (target.value.trim()) handleQuickModelSwitch(target.value.trim())
                    }
                  }}
                  id="manual-model-input"
                />
                <Button
                  size="sm"
                  className="bg-gradient-to-r from-primary to-lime-600 hover:from-primary/90 hover:to-lime-600/90 text-white"
                  onClick={() => {
                    const input = document.getElementById('manual-model-input') as HTMLInputElement
                    if (input?.value.trim()) handleQuickModelSwitch(input.value.trim())
                  }}
                  disabled={switchingModel !== null}
                >
                  Appliquer
                </Button>
              </div>
            </div>
          </div>
        </GlassModal>
      </div>
    </MotionConfig>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDER FORM — Formulaire de création/édition
// ═══════════════════════════════════════════════════════════════════════════════

function ProviderForm({
  formData,
  setFormData,
  showApiKey,
  setShowApiKey,
  isEdit = false,
}: {
  formData: ProviderFormData
  setFormData: Dispatch<SetStateAction<ProviderFormData>>
  showApiKey: boolean
  setShowApiKey: Dispatch<SetStateAction<boolean>>
  isEdit?: boolean
}) {
  const meta = PROVIDER_META[formData.provider]
  const Icon = meta.icon
  const models = PROVIDER_MODELS[formData.provider]

  const handleProviderChange = (provider: LocalProviderType) => {
    setFormData({
      ...formData,
      provider,
      baseUrl: PROVIDER_DEFAULT_URLS[provider],
      model: PROVIDER_MODELS[provider]?.[0] || '',
      apiKey: '',
      chatId: '',
      userId: '',
      token: '',
      capability: PROVIDER_META[provider]?.defaultCapability || 'chat',
    })
  }

  return (
    <div className="space-y-5">
      {/* ─── Provider type selector (grille 9 cartes cliquables) ─── */}
      <div className="space-y-2">
        <Label>Type de fournisseur</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {(Object.entries(PROVIDER_META) as [LocalProviderType, ProviderMeta][]).map(([type, m]) => {
            const TypeIcon = m.icon
            const isSelected = formData.provider === type
            return (
              <button
                key={type}
                type="button"
                onClick={() => handleProviderChange(type)}
                className={`flex items-center gap-2 p-2.5 rounded-lg border-2 text-sm transition-all ds-press ${
                  isSelected
                    ? `${m.borderClass} ${m.bgClass} ${m.textClass} font-semibold`
                    : 'border-border hover:border-muted-foreground/30'
                }`}
                aria-pressed={isSelected}
              >
                <TypeIcon className="h-4 w-4 shrink-0" style={{ color: m.color }} />
                <span className="text-xs truncate">{m.label}</span>
              </button>
            )
          })}
        </div>
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <Icon className="h-3 w-3 shrink-0" style={{ color: meta.color }} />
          {meta.description}
        </p>
      </div>

      {/* ─── Nom ─── */}
      <div className="space-y-2">
        <Label htmlFor="provider-name">Nom du fournisseur</Label>
        <Input
          id="provider-name"
          placeholder="Ex: Mon OpenAI, Groq Production..."
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        />
      </div>

      {/* ─── Base URL (sauf ZAI) ─── */}
      {formData.provider !== 'ZAI' && (
        <div className="space-y-2">
          <Label htmlFor="provider-baseurl">URL de base de l&apos;API</Label>
          <Input
            id="provider-baseurl"
            placeholder={PROVIDER_DEFAULT_URLS[formData.provider]}
            value={formData.baseUrl}
            onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            URL de base pour les requêtes chat/completions
          </p>
        </div>
      )}

      {/* ─── API Key (sauf ZAI → extraConfig) ─── */}
      {formData.provider !== 'ZAI' && (
        <div className="space-y-2">
          <Label htmlFor="provider-apikey">Clé API</Label>
          <div className="relative">
            <Input
              id="provider-apikey"
              type={showApiKey ? 'text' : 'password'}
              placeholder={isEdit ? 'Laisser vide pour ne pas modifier' : 'sk-...'}
              value={formData.apiKey}
              onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showApiKey ? 'Masquer la clé' : 'Afficher la clé'}
            >
              {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {/* ─── Section ZAI spécifique (chatId, userId, token, baseUrl, apiKey dans extraConfig) ─── */}
      {formData.provider === 'ZAI' && (
        <div className="space-y-4 rounded-lg border border-secondary/30 bg-secondary/10 p-4">
          <p className="text-xs text-secondary font-medium">
            Configuration Z-AI (optionnel — sinon les variables d&apos;environnement sont utilisées)
          </p>
          <div className="space-y-2">
            <Label htmlFor="zai-baseurl" className="text-xs">Base URL</Label>
            <Input
              id="zai-baseurl"
              placeholder="https://z.ai/api/v1"
              value={formData.baseUrl}
              onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="zai-apikey" className="text-xs">API Key</Label>
            <Input
              id="zai-apikey"
              placeholder="Z.ai"
              value={formData.apiKey}
              onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="zai-chatid" className="text-xs">Chat ID</Label>
              <Input
                id="zai-chatid"
                placeholder="chat-..."
                value={formData.chatId}
                onChange={(e) => setFormData({ ...formData, chatId: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zai-userid" className="text-xs">User ID</Label>
              <Input
                id="zai-userid"
                placeholder="d4cf..."
                value={formData.userId}
                onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="zai-token" className="text-xs">Token JWT</Label>
            <Input
              id="zai-token"
              type="password"
              placeholder="eyJhb..."
              value={formData.token}
              onChange={(e) => setFormData({ ...formData, token: e.target.value })}
            />
          </div>
        </div>
      )}

      {/* ─── Section VOXTRAL spécifique (refAudioPresenter, refAudioExpert) ─── */}
      {formData.provider === 'VOXTRAL' && (
        <div className="space-y-4 rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-4">
          <p className="text-xs text-cyan-700 dark:text-cyan-300 font-medium flex items-center gap-1.5">
            <AudioLines className="h-3.5 w-3.5" />
            Configuration des voix (voice cloning)
          </p>
          <div className="space-y-2">
            <Label htmlFor="voxtral-presenter" className="text-xs">
              URL audio voix Présentateur
            </Label>
            <Input
              id="voxtral-presenter"
              placeholder="https://...voix-presentateur.wav"
              value={formData.refAudioPresenter}
              onChange={(e) => setFormData({ ...formData, refAudioPresenter: e.target.value })}
            />
            <p className="text-[11px] text-muted-foreground">
              URL d&apos;un fichier WAV/MP3 court (~10-15s) d&apos;une voix à cloner pour le Présentateur.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="voxtral-expert" className="text-xs">
              URL audio voix Expert
            </Label>
            <Input
              id="voxtral-expert"
              placeholder="https://...voix-expert.wav"
              value={formData.refAudioExpert}
              onChange={(e) => setFormData({ ...formData, refAudioExpert: e.target.value })}
            />
            <p className="text-[11px] text-muted-foreground">
              URL d&apos;un fichier WAV/MP3 court (~10-15s) d&apos;une voix différente pour l&apos;Expert.
            </p>
          </div>
          {formData.refAudioPresenter && formData.refAudioExpert ? (
            <p className="text-[11px] text-success-text flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Mode multi-voix activé : le script sera parsé par speaker et chaque segment utilisera sa voix.
            </p>
          ) : formData.refAudioPresenter || formData.refAudioExpert ? (
            <p className="text-[11px] text-warning">
              Mode mono-voix : une seule voix sera utilisée pour tout le podcast.
              Configurez les 2 URLs pour activer le multi-voix.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Aucune voix configurée — la voix par défaut sera utilisée.
              Configurez au moins une URL pour personnaliser la voix.
            </p>
          )}
        </div>
      )}

      {/* ─── Modèle ─── */}
      <div className="space-y-2">
        <Label htmlFor="provider-model">Modèle</Label>
        <div className="flex gap-2">
          <Select
            value={formData.model}
            onValueChange={(val) => setFormData({ ...formData, model: val })}
          >
            <SelectTrigger id="provider-model" className="flex-1">
              <SelectValue placeholder="Sélectionner un modèle" />
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Ou saisir un modèle custom"
            value={formData.model}
            onChange={(e) => setFormData({ ...formData, model: e.target.value })}
            className="flex-1"
          />
        </div>
      </div>

      {/* ─── Capability ─── */}
      <div className="space-y-2">
        <Label htmlFor="provider-capability">Capacité</Label>
        <Select
          value={formData.capability}
          onValueChange={(val) => setFormData({ ...formData, capability: val as ProviderFormData['capability'] })}
        >
          <SelectTrigger id="provider-capability" className="w-full">
            <SelectValue placeholder="Sélectionner une capacité" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="chat">
              <div className="flex items-center gap-2">
                <Brain className="h-3.5 w-3.5 text-info" />
                <span>Chat (LLM textuel)</span>
              </div>
            </SelectItem>
            <SelectItem value="tts">
              <div className="flex items-center gap-2">
                <AudioLines className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                <span>TTS (synthèse vocale)</span>
              </div>
            </SelectItem>
            <SelectItem value="audio">
              <div className="flex items-center gap-2">
                <Mic className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                <span>Audio (LLM multimodal)</span>
              </div>
            </SelectItem>
            <SelectItem value="transcription">
              <div className="flex items-center gap-2">
                <AudioLines className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Transcription (speech-to-text)</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Détermine l&apos;usage du provider : <strong>chat</strong> pour les scripts/évaluations,{' '}
          <strong>tts</strong> pour la synthèse audio des podcasts / exam-prep.
        </p>
      </div>

      {/* ─── Température ─── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Température</Label>
          <span className="text-sm font-mono tabular-nums text-muted-foreground">{formData.temperature.toFixed(1)}</span>
        </div>
        <Slider
          value={[formData.temperature]}
          onValueChange={([val]) => setFormData({ ...formData, temperature: val })}
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

      {/* ─── Max Tokens ─── */}
      <div className="space-y-2">
        <Label htmlFor="provider-maxtokens">Max tokens</Label>
        <Input
          id="provider-maxtokens"
          type="number"
          min={100}
          max={128000}
          step={256}
          value={formData.maxTokens}
          onChange={(e) => setFormData({ ...formData, maxTokens: parseInt(e.target.value) || 4096 })}
        />
        <p className="text-xs text-muted-foreground">
          Nombre maximum de tokens par défaut dans la réponse. La génération d&apos;épreuves ajuste automatiquement cette valeur (8192-16384) selon le nombre de questions. Pour les autres usages, 4096 est recommandé.
        </p>
      </div>
    </div>
  )
}
