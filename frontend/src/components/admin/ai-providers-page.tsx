'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
  AudioLines, // KOKORO-TTS-1 : icône TTS pour HuggingFace
  Mic,        // DASHSCOPE-AUDIO-1 : icône audio pour DashScope
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { PulseSkeleton } from '@/components/ds'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import type { AIProviderInfo, AIProviderType } from '@/lib/ai-providers/types'
import { PROVIDER_TYPES } from '@/lib/ai-providers/types'

// ─── Provider type config ───
const PROVIDER_META: Record<AIProviderType, {
  label: string
  description: string
  icon: any
  color: string
  bgClass: string
  textClass: string
  borderClass: string
  gradientClass: string
}> = {
  ZAI: {
    label: 'Z-AI',
    description: 'Z.ai Intelligence Artificielle',
    icon: Zap,
    color: '#8b5cf6',
    bgClass: 'bg-secondary/10',
    textClass: 'text-secondary',
    borderClass: 'border-secondary/30',
    gradientClass: 'from-secondary via-secondary to-secondary',
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
  },
  // DASHSCOPE-AUDIO-1 : Alibaba Bailian / Model Studio — TTS natif (qwen3-tts-flash)
  DASHSCOPE: {
    label: 'DashScope',
    description: 'Alibaba Bailian — TTS (qwen3-tts-flash)',
    icon: Mic,
    color: '#e11d48',
    bgClass: 'bg-rose-500/10',
    textClass: 'text-rose-600 dark:text-rose-400',
    borderClass: 'border-rose-500/30',
    gradientClass: 'from-rose-500 via-rose-500 to-pink-500',
  },
  // KOKORO-TTS-1 : Hugging Face Space Gradio — TTS (Kokoro-82M)
  HUGGINGFACE: {
    label: 'Hugging Face',
    description: 'Spaces Gradio — TTS (Kokoro-82M)',
    icon: AudioLines,
    color: '#d97706',
    bgClass: 'bg-amber-500/10',
    textClass: 'text-amber-600 dark:text-amber-400',
    borderClass: 'border-amber-500/30',
    gradientClass: 'from-amber-500 via-amber-500 to-orange-500',
  },
  // NEUPHONIC-TTS-1 : Neuphonic NeuTTS Nano French — voix FR native (voice cloning)
  NEUPHONIC: {
    label: 'Neuphonic',
    description: 'NeuTTS Nano French — voix FR native',
    icon: Mic,
    color: '#7c3aed',
    bgClass: 'bg-violet-500/10',
    textClass: 'text-violet-600 dark:text-violet-400',
    borderClass: 'border-violet-500/30',
    gradientClass: 'from-violet-500 via-violet-500 to-purple-500',
  },
}

const PROVIDER_MODELS: Record<AIProviderType, string[]> = {
  ZAI: ['default'],
  OPENAI: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'o1', 'o1-mini', 'o3-mini'],
  OPENAI_COMPATIBLE: [
    'gpt-5.4-mini', 'gpt-5.4', 'gpt-5.4-nano', 'gpt-5.5',
    'deepseek-v4-flash', 'deepseek-v4-pro',
    'grok-4', 'grok-4-20-non-reasoning', 'grok-code-fast-1',
    'glm-5.1',
    'qwen3.7-max', 'qwen3.7-plus', 'qwen3.6-plus', 'qwen3.6-flash', 'qwen3.6-max-preview',
    'qwen3.5-plus', 'qwen3.5-flash', 'qwen3.5-omni-flash', 'qwen3.5-omni-plus',
    'qwen-flash', 'qwen-plus', 'qwen3-max', 'qwen-vl-max',
    'qwen3-omni-flash', 'qwen3-vl-flash', 'qwen3-vl-plus',
    'kimi-k2.6',
    'llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'gemma2-9b-it', 'deepseek-r1-distill-llama-70b', 'qwen-2.5-32b',
  ],
  ANTHROPIC: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307', 'claude-3-5-haiku-20241022'],
  GOOGLE: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash-lite'],
  // DASHSCOPE-AUDIO-1 : modèles TTS DashScope (capability='tts')
  DASHSCOPE: ['qwen3-tts-flash', 'qwen3-tts-instruct-flash', 'qwen-tts-2025-05-22', 'cosyvoice-v1'],
  // KOKORO-TTS-1 : modèle Kokoro-82M (Space Gradio, capability='tts')
  HUGGINGFACE: ['hexgrad/Kokoro-82M'],
  // NEUPHONIC-TTS-1 : modèle NeuTTS Nano French (voice cloning FR)
  NEUPHONIC: ['neuphonic/neutts-nano-french', 'neuphonic/neutts-nano-french-q4-gguf', 'neuphonic/neutts-nano-french-q8-gguf'],
}

const PROVIDER_DEFAULT_URLS: Record<AIProviderType, string> = {
  ZAI: 'https://z.ai/api/v1',
  OPENAI: 'https://api.openai.com/v1',
  OPENAI_COMPATIBLE: 'https://api.groq.com/openai/v1',
  ANTHROPIC: 'https://api.anthropic.com/v1',
  GOOGLE: 'https://generativelanguage.googleapis.com/v1beta/openai',
  // DASHSCOPE-AUDIO-1 : host racine du MaaS DashScope
  DASHSCOPE: 'https://dashscope.aliyuncs.com',
  // KOKORO-TTS-1 : Space Gradio Pendrokar/Kokoro-TTS (host public)
  HUGGINGFACE: 'https://pendrokar-kokoro-tts.hf.space',
  // NEUPHONIC-TTS-1 : Space Gradio officiel neuphonic/neutts-nano-multilingual-collection
  NEUPHONIC: 'https://neuphonic-neutts-nano-multilingual-collection.hf.space',
}

// ─── Failover types ───
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
  status: 'HEALTHY' | 'DEGRADED' | 'COOLING_DOWN'
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
    coolingDown: number
    failoverEnabled: boolean
    totalCalls: number
    totalFailovers: number
    last24hEvents: number
  }
  providers: ProviderWithHealth[]
  recentEvents: FailoverEvent[]
}

// ─── Form data type ───
interface ProviderFormData {
  name: string
  provider: AIProviderType
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
  chatId: string
  userId: string
  token: string
  // KOKORO-TTS-1 : capability du provider (chat / tts / audio)
  capability: 'chat' | 'tts' | 'audio' | 'transcription'
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
}

// ─── Main Component ───
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
  const hasAutoSeeded = useRef(false)

  // Failover state
  const [isUpdatingFailoverConfig, setIsUpdatingFailoverConfig] = useState(false)
  const [isResettingHealth, setIsResettingHealth] = useState(false)
  const [isReordering, setIsReordering] = useState<string | null>(null)
  const [isEventsExpanded, setIsEventsExpanded] = useState(true)

  // ─── Data state (BUGFIX QUERY-MIGRATION-GROUP-A : TanStack Query) ───
  // Le cache survit au démontage → 0 refetch au retour, 0 skeleton, navigation
  // instantanée. Le polling du failover status est géré par refetchInterval
  // (auto-cleanup au démontage, plus de fuite mémoire).
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

  // Auto-seed default provider if list is empty (one-shot via ref).
  // Garde la logique métier d'origine : si aucun fournisseur n'existe, on crée
  // automatiquement le Z-AI par défaut.
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

  // Toast sur erreur de chargement (équivalent du catch du fetch original).
  useEffect(() => {
    if (providersQuery.error) {
      toast.error('Erreur', { description: 'Impossible de charger les fournisseurs IA' })
    }
  }, [providersQuery.error])

  const failoverQuery = useQuery<FailoverStatus>({
    queryKey: ['ai-providers-failover'],
    queryFn: async () => {
      const res = await fetch('/api/ai-providers/failover/status')
      if (!res.ok) throw new Error('Erreur réseau')
      return res.json()
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
    // Polling 30s du failover status (auto-cleanup au démontage, plus de
    // setInterval à nettoyer manuellement).
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })

  const failoverStatus = failoverQuery.data ?? null
  const isFailoverLoading = failoverQuery.isLoading

  // Helpers pour invalider le cache après mutation.
  const refreshProviders = () => queryClient.invalidateQueries({ queryKey: ['ai-providers'] })
  const refreshFailoverStatus = () =>
    queryClient.invalidateQueries({ queryKey: ['ai-providers-failover'] })

  // Fetch dynamic models from a provider's API
  const fetchDynamicModels = useCallback(async (providerId: string) => {
    setIsLoadingModels(true)
    try {
      const res = await fetch(`/api/ai-providers/models?providerId=${providerId}`)
      if (res.ok) {
        const data = await res.json()
        setDynamicModels(data.models || [])
      } else {
        setDynamicModels([])
      }
    } catch {
      setDynamicModels([])
    } finally {
      setIsLoadingModels(false)
    }
  }, [])

  // Quick model switch for the active provider
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

      toast.success('Modèle changé', {
        description: `Maintenant utiliser : ${model}`,
      })
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

  // Create provider
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
          // KOKORO-TTS-1 : envoyer la capability (chat / tts / audio)
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

  // Update provider
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
          // KOKORO-TTS-1 : envoyer la capability (chat / tts / audio)
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

  // Delete provider
  const handleDelete = async () => {
    if (!selectedProvider) return
    try {
      const res = await fetch(`/api/ai-providers/${selectedProvider.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Erreur lors de la suppression')

      toast.success('Fournisseur supprimé', { description: `"${selectedProvider.name}" a été retiré` })
      setShowDeleteDialog(false)
      setSelectedProvider(null)
      refreshProviders()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Erreur inconnue' })
    }
  }

  // Activate provider
  const handleActivate = async (providerId: string) => {
    setActivatingId(providerId)
    try {
      const res = await fetch('/api/ai-providers/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId }),
      })
      if (!res.ok) throw new Error('Erreur lors de l\'activation')

      const data = await res.json()
      toast.success('Fournisseur activé', { description: data.message })
      refreshProviders()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Erreur inconnue' })
    } finally {
      setActivatingId(null)
    }
  }

  // Quick switch provider
  const handleQuickSwitch = async (providerId: string) => {
    if (!providerId) return
    const target = providers.find(p => p.id === providerId)
    if (!target || target.isActive) return

    setIsQuickSwitching(true)
    try {
      const res = await fetch('/api/ai-providers/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId }),
      })
      if (!res.ok) throw new Error('Erreur lors du changement')

      const data = await res.json()
      toast.success('Fournisseur changé', { description: `Maintenant utiliser : ${target.name}` })
      refreshProviders()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Erreur inconnue' })
    } finally {
      setIsQuickSwitching(false)
    }
  }

  // Test provider
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
    } catch (err) {
      toast.error('Erreur', { description: 'Impossible de tester le fournisseur' })
    } finally {
      setTestingId(null)
    }
  }

  // Test all providers
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

  // Open edit dialog
  const openEdit = async (provider: AIProviderInfo) => {
    setSelectedProvider(provider)
    try {
      const res = await fetch(`/api/ai-providers/${provider.id}`)
      const data = await res.json()
      const full = data.provider

      setFormData({
        name: full.name,
        provider: full.provider as AIProviderType,
        baseUrl: full.baseUrl || PROVIDER_DEFAULT_URLS[full.provider as AIProviderType] || '',
        apiKey: '',
        model: full.model || PROVIDER_MODELS[full.provider as AIProviderType]?.[0] || '',
        temperature: full.temperature ?? 0.7,
        maxTokens: full.maxTokens ?? 4096,
        chatId: '',
        userId: '',
        token: '',
        // KOKORO-TTS-1 : charger la capability existante (défaut 'chat')
        capability: (full.capability as ProviderFormData['capability']) || 'chat',
      })
    } catch {
      setFormData({
        name: provider.name,
        provider: provider.provider as AIProviderType,
        baseUrl: provider.baseUrl || '',
        apiKey: '',
        model: provider.model || '',
        temperature: provider.temperature ?? 0.7,
        maxTokens: provider.maxTokens ?? 4096,
        chatId: '',
        userId: '',
        token: '',
        capability: (provider.capability as ProviderFormData['capability']) || 'chat',
      })
    }
    setShowEditDialog(true)
  }

  const openCreate = (type?: AIProviderType) => {
    const pType = type || 'OPENAI'
    setFormData({
      ...EMPTY_FORM,
      provider: pType,
      baseUrl: PROVIDER_DEFAULT_URLS[pType],
      model: PROVIDER_MODELS[pType]?.[0] || '',
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
  const formatTime = (ts: number | string | null) => {
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
      case 'FAIL_OVER': return { label: 'Basculement', color: 'text-warning bg-warning/10', icon: ArrowRightLeft }
      case 'RECOVERY': return { label: 'Récupération', color: 'text-success-text bg-success/10', icon: CheckCircle2 }
      case 'MANUAL_SWITCH': return { label: 'Manuel', color: 'text-secondary bg-secondary/10', icon: Settings2 }
      case 'COOLDOWN_EXPIRED': return { label: 'Cooldown', color: 'text-info bg-info/10', icon: Timer }
      case 'ALL_FAILED': return { label: 'Échec total', color: 'text-destructive bg-destructive/10', icon: X }
      default: return { label: type, color: 'text-gray-600 bg-gray-50 dark:bg-gray-950/30', icon: Activity }
    }
  }

  // Derived state
  const activeProvider = providers.find(p => p.isActive)

  // ─── Loading state ───
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <PulseSkeleton className="h-7 w-48 mb-1" />
            <PulseSkeleton className="h-4 w-72" />
          </div>
          <PulseSkeleton className="h-9 w-28" />
        </div>
        <PulseSkeleton className="h-10 w-full" />
        <PulseSkeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ─── Compact Header ─── */}
      <div className="flex items-center justify-between gap-4 ds-kente-pattern -mx-4 -mt-4 rounded-lg px-4 py-4 sm:-mx-6 sm:px-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2 font-display">
            <Sparkles className="h-5 w-5 text-secondary" />
            Fournisseurs IA
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Gérez vos fournisseurs d&apos;intelligence artificielle et le basculement automatique
          </p>
        </div>
        <Button
          className="bg-secondary hover:bg-secondary/90 text-white shrink-0"
          onClick={() => openCreate()}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Ajouter
        </Button>
      </div>

      {/* ─── Inline Stats Bar ─── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 rounded-lg bg-muted/50 border border-border/50 text-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Layers className="h-3.5 w-3.5" />
          <span className="text-xs">{providers.length} fournisseur{providers.length !== 1 ? 's' : ''}</span>
        </div>
        <Separator orientation="vertical" className="h-4" />
        <div className="flex items-center gap-1.5">
          {activeProvider ? (
            <>
              <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
              <span className="text-xs font-medium">{activeProvider.name}</span>
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-warning" />
              <span className="text-xs text-warning">Aucun actif</span>
            </>
          )}
        </div>
        <Separator orientation="vertical" className="h-4" />
        <div className="flex items-center gap-1.5">
          {activeProvider?.lastTestOk === true ? (
            <><Wifi className="h-3.5 w-3.5 text-success-text" /><span className="text-xs text-success-text">Test OK</span></>
          ) : activeProvider?.lastTestOk === false ? (
            <><WifiOff className="h-3.5 w-3.5 text-destructive" /><span className="text-xs text-destructive">Test échoué</span></>
          ) : (
            <><Activity className="h-3.5 w-3.5 text-gray-400" /><span className="text-xs text-muted-foreground">Non testé</span></>
          )}
        </div>
        <div className="ml-auto">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
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

      {/* ─── Tabs ─── */}
      <Tabs defaultValue="providers" className="w-full">
        <TabsList>
          <TabsTrigger value="providers" className="gap-1.5">
            <Zap className="h-3.5 w-3.5" />
            Fournisseurs
          </TabsTrigger>
          <TabsTrigger value="failover" className="gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Failover
            {failoverStatus?.config.enabled && (
              <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
            )}
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
              <div className="p-4 rounded-full bg-secondary/10 mb-4">
                <Server className="h-8 w-8 text-secondary" />
              </div>
              <h3 className="text-lg font-semibold mb-1 font-display tracking-tight">Aucun fournisseur IA configuré</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
                Le système utilise <strong>Z-AI par défaut</strong>. Ajoutez un fournisseur pour personnaliser le comportement de l&apos;IA.
              </p>
              <Button
                className="bg-secondary hover:bg-secondary/90 text-white"
                onClick={() => openCreate()}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Ajouter un fournisseur
              </Button>
            </motion.div>
          ) : (
            /* ─── Provider List ─── */
            <div className="rounded-lg border overflow-hidden">
              <AnimatePresence>
                {providers.map((provider, index) => {
                  const meta = PROVIDER_META[provider.provider as AIProviderType] || PROVIDER_META.OPENAI_COMPATIBLE
                  const Icon = meta.icon
                  const isTesting = testingId === provider.id
                  const isActivating = activatingId === provider.id

                  return (
                    <motion.div
                      key={provider.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ delay: index * 0.03 }}
                      className={`relative flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-4 py-3 transition-colors ${
                        provider.isActive
                          ? 'bg-secondary/10 border-l-[3px] border-l-primary'
                          : 'border-l-[3px] border-l-transparent hover:bg-muted/30'
                      } ${index < providers.length - 1 ? 'border-b border-border/50' : ''}`}
                    >
                      {/* Left: Icon + Name + Badges */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`p-1.5 rounded-md shrink-0 ${meta.bgClass}`}>
                          <Icon className="h-4 w-4" style={{ color: meta.color }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium truncate">{provider.name}</span>
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              {meta.label}
                            </Badge>
                            {/* KOKORO-TTS-1 : badge capability (chat / tts / audio) */}
                            {provider.capability && (
                              <Badge
                                className={`text-[10px] shrink-0 gap-1 ${
                                  provider.capability === 'tts'
                                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                    : provider.capability === 'audio'
                                      ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                      : 'bg-muted text-muted-foreground'
                                }`}
                              >
                                {provider.capability === 'tts' && <AudioLines className="h-2.5 w-2.5" />}
                                {provider.capability === 'audio' && <Mic className="h-2.5 w-2.5" />}
                                {provider.capability.toUpperCase()}
                              </Badge>
                            )}
                            <Badge variant="secondary" className="text-[10px] font-mono tabular-nums shrink-0">
                              {provider.model || '—'}
                            </Badge>
                            {provider.isActive && (
                              <Badge className="bg-success/10 text-success-text text-[10px] shrink-0 gap-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                                Actif
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                            <span>T: {provider.temperature ?? 0.7}</span>
                            <span className="text-muted-foreground/40">·</span>
                            <span>Max: {provider.maxTokens ?? 4096}</span>
                            {provider.hasApiKey && (
                              <>
                                <span className="text-muted-foreground/40">·</span>
                                <Shield className="h-3 w-3 text-success-text" />
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Status + Actions */}
                      <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                        {/* Connection status */}
                        {provider.lastTestOk === true && (
                          <span className="flex items-center justify-center h-6 w-6 rounded-full bg-success/10 text-success-text">
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        )}
                        {provider.lastTestOk === false && (
                          <span className="flex items-center justify-center h-6 w-6 rounded-full bg-destructive/10 text-destructive">
                            <X className="h-3.5 w-3.5" />
                          </span>
                        )}
                        {provider.lastTestOk == null && (
                          <span className="flex items-center justify-center h-6 w-6 rounded-full bg-warning/10 text-warning">
                            <AlertCircle className="h-3.5 w-3.5" />
                          </span>
                        )}

                        {/* Activate */}
                        {!provider.isActive && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => handleActivate(provider.id)}
                            disabled={isActivating}
                          >
                            {isActivating ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Power className="h-3 w-3" />
                            )}
                            <span className="hidden sm:inline">Activer</span>
                          </Button>
                        )}

                        {/* Test */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => handleTest(provider.id)}
                          disabled={isTesting}
                          title="Tester"
                        >
                          {isTesting ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                        </Button>

                        {/* Edit */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => openEdit(provider)}
                          title="Modifier"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>

                        {/* Delete */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => {
                            setSelectedProvider(provider)
                            setShowDeleteDialog(true)
                          }}
                          disabled={provider.isActive}
                          title="Supprimer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════ Tab 2: Failover ═══════════════════════ */}
        <TabsContent value="failover" className="mt-4">
          {isFailoverLoading ? (
            <div className="space-y-4">
              <PulseSkeleton className="h-10 w-full" />
              <PulseSkeleton className="h-48 w-full" />
              <PulseSkeleton className="h-32 w-full" />
            </div>
          ) : failoverStatus ? (
            <div className="space-y-4">
              {/* ─── Enable/Disable Toggle ─── */}
              <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="p-1.5 rounded-md bg-success/10">
                    <ShieldCheck className="h-4 w-4 text-success-text" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Basculement automatique (Failover)</p>
                    <p className="text-xs text-muted-foreground">
                      Bascule vers un autre fournisseur si l&apos;actif échoue
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {failoverStatus.config.enabled && (
                    <Badge className="bg-success/10 text-success-text text-[10px] gap-1">
                      <HeartPulse className="h-3 w-3 animate-pulse" />
                      Actif
                    </Badge>
                  )}
                  <Switch
                    checked={failoverStatus.config.enabled}
                    onCheckedChange={handleToggleFailover}
                    disabled={isUpdatingFailoverConfig || failoverStatus.summary.totalProviders < 2}
                  />
                </div>
              </div>

              {/* Warning if < 2 providers */}
              {failoverStatus.summary.totalProviders < 2 && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30">
                  <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                  <p className="text-xs text-warning">
                    <strong>Minimum 2 fournisseurs requis.</strong> Ajoutez au moins un fournisseur de secours pour que le failover fonctionne.
                  </p>
                </div>
              )}

              {/* ─── Summary Stats ─── */}
              <div className="grid grid-cols-4 gap-2">
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-success/10">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success-text shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Sains</p>
                    <p className="text-sm font-bold text-success-text font-mono tabular-nums">{failoverStatus.summary.healthy}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-warning/10">
                  <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Dégradés</p>
                    <p className="text-sm font-bold text-warning font-mono tabular-nums">{failoverStatus.summary.degraded}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10">
                  <Clock className="h-3.5 w-3.5 text-destructive shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Cooldown</p>
                    <p className="text-sm font-bold text-destructive font-mono tabular-nums">{failoverStatus.summary.coolingDown}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-secondary/10">
                  <TrendingUp className="h-3.5 w-3.5 text-secondary shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Basculements</p>
                    <p className="text-sm font-bold text-secondary font-mono tabular-nums">{failoverStatus.summary.totalFailovers}</p>
                  </div>
                </div>
              </div>

              {/* ─── Priority Order ─── */}
              {failoverStatus.providers.length > 0 && (
                <Card>
                  <CardHeader className="pb-3 pt-4 px-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-1.5 font-display">
                        <ArrowUpDown className="h-3.5 w-3.5" />
                        Ordre de failover
                      </CardTitle>
                      <span className="text-[10px] text-muted-foreground">
                        Utilisez les flèches pour réordonner
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="space-y-1.5">
                      <AnimatePresence mode="popLayout">
                        {failoverStatus.providers.map((p, idx) => (
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
                                  : p.isActive
                                    ? 'border-secondary/30 bg-secondary/10'
                                    : 'border-border'
                            }`}
                          >
                            {/* Priority number */}
                            <div className={`flex items-center justify-center h-6 w-6 rounded-full text-[11px] font-bold shrink-0 ${
                              idx === 0
                                ? 'bg-secondary text-white'
                                : 'bg-muted text-muted-foreground'
                            }`}>
                              {idx + 1}
                            </div>

                            {/* Provider info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium truncate">{p.name}</span>
                                {p.isActive && (
                                  <Badge className="bg-secondary/10 text-secondary text-[9px] h-4 px-1">
                                    PRINCIPAL
                                  </Badge>
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

                            {/* Status indicator */}
                            <div className="hidden sm:flex items-center shrink-0">
                              {p.status === 'HEALTHY' && (
                                <span className="flex items-center gap-1 text-[10px] text-success-text bg-success/10 px-2 py-0.5 rounded-full">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Sain
                                </span>
                              )}
                              {p.status === 'DEGRADED' && (
                                <span className="flex items-center gap-1 text-[10px] text-warning bg-warning/10 px-2 py-0.5 rounded-full">
                                  <AlertTriangle className="h-3 w-3" />
                                  Dégradé
                                  {p.health?.consecutiveFailures && (
                                    <span>({p.health.consecutiveFailures}/{failoverStatus.config.maxConsecutiveFailures})</span>
                                  )}
                                </span>
                              )}
                              {p.status === 'COOLING_DOWN' && (
                                <span className="flex items-center gap-1 text-[10px] text-destructive bg-destructive/10 px-2 py-0.5 rounded-full">
                                  <Clock className="h-3 w-3" />
                                  Cooldown
                                </span>
                              )}
                            </div>

                            {/* ALWAYS VISIBLE reorder buttons */}
                            <div className="flex flex-col gap-0.5 shrink-0">
                              <button
                                onClick={() => handleMoveProvider(p.id, 'up')}
                                disabled={idx === 0 || isReordering !== null}
                                className={`h-6 w-6 rounded-md flex items-center justify-center border transition-colors ${
                                  idx === 0
                                    ? 'border-border/30 text-muted-foreground/20 cursor-not-allowed'
                                    : 'border-border/60 text-muted-foreground hover:bg-secondary/10 hover:text-secondary hover:border-secondary/30'
                                }`}
                                title="Monter en priorité"
                              >
                                {isReordering === p.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <ChevronUp className="h-3.5 w-3.5" />
                                )}
                              </button>
                              <button
                                onClick={() => handleMoveProvider(p.id, 'down')}
                                disabled={idx === failoverStatus.providers.length - 1 || isReordering !== null}
                                className={`h-6 w-6 rounded-md flex items-center justify-center border transition-colors ${
                                  idx === failoverStatus.providers.length - 1
                                    ? 'border-border/30 text-muted-foreground/20 cursor-not-allowed'
                                    : 'border-border/60 text-muted-foreground hover:bg-secondary/10 hover:text-secondary hover:border-secondary/30'
                                }`}
                                title="Descendre en priorité"
                              >
                                {isReordering === p.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <ChevronDown className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ─── Configuration ─── */}
              <Card>
                <CardHeader className="pb-3 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center gap-1.5 font-display">
                    <Settings2 className="h-3.5 w-3.5" />
                    Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Max consecutive failures */}
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div>
                        <p className="text-xs font-medium">Échecs avant cooldown</p>
                        <p className="text-[10px] text-muted-foreground">
                          Nombre d&apos;échecs consécutifs
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 5].map(n => (
                          <button
                            key={n}
                            onClick={() => handleUpdateFailoverConfig({ maxConsecutiveFailures: n })}
                            disabled={isUpdatingFailoverConfig}
                            className={`h-7 w-7 rounded-md text-xs font-bold transition-all ${
                              failoverStatus.config.maxConsecutiveFailures === n
                                ? 'bg-secondary text-white'
                                : 'bg-muted text-muted-foreground hover:bg-muted/80'
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Cooldown duration */}
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div>
                        <p className="text-xs font-medium">Durée de cooldown</p>
                        <p className="text-[10px] text-muted-foreground">
                          Temps d&apos;attente avant réessai
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
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
                            className={`h-7 px-2 rounded-md text-[11px] font-bold transition-all ${
                              failoverStatus.config.cooldownDurationMs === opt.value
                                ? 'bg-secondary text-white'
                                : 'bg-muted text-muted-foreground hover:bg-muted/80'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Reset health button */}
                  <div className="flex justify-end mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={handleResetHealth}
                      disabled={isResettingHealth}
                    >
                      {isResettingHealth ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                      ) : (
                        <RotateCcw className="h-3 w-3 mr-1.5" />
                      )}
                      Réinitialiser la santé
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* ─── Recent Events (Collapsible) ─── */}
              {failoverStatus.recentEvents.length > 0 && (
                <Card>
                  <CardHeader className="pb-3 pt-4 px-4">
                    <div className="flex items-center justify-between cursor-pointer" onClick={() => setIsEventsExpanded(!isEventsExpanded)}>
                      <CardTitle className="text-sm flex items-center gap-1.5 font-display">
                        <Activity className="h-3.5 w-3.5" />
                        Événements récents
                        <Badge variant="outline" className="text-[10px] ml-1">
                          24 dernières heures
                        </Badge>
                      </CardTitle>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                        {isEventsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </CardHeader>
                  <AnimatePresence>
                    {isEventsExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <CardContent className="px-4 pb-4">
                          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                            {failoverStatus.recentEvents.map((event) => {
                              const typeInfo = formatEventType(event.eventType)
                              const TypeIcon = typeInfo.icon
                              return (
                                <div
                                  key={event.id}
                                  className="flex items-start gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/50"
                                >
                                  <div className={`p-1 rounded shrink-0 ${typeInfo.color}`}>
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
                        </CardContent>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              )}

              {/* ─── How it works ─── */}
              <div className="p-3 rounded-lg bg-muted/30 border border-dashed">
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
      </Tabs>

      {/* ─── Create Dialog ─── */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-secondary" />
              Ajouter un fournisseur IA
            </DialogTitle>
            <DialogDescription>
              Configurez un nouveau fournisseur d&apos;intelligence artificielle
            </DialogDescription>
          </DialogHeader>

          <ProviderForm
            formData={formData}
            setFormData={setFormData}
            showApiKey={showApiKey}
            setShowApiKey={setShowApiKey}
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Annuler
            </Button>
            <Button
              className="bg-secondary hover:bg-secondary/90 text-white"
              onClick={handleCreate}
              disabled={isSaving || !formData.name}
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Créer le fournisseur
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Dialog ─── */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-secondary" />
              Modifier le fournisseur
            </DialogTitle>
            <DialogDescription>
              Modifier la configuration de &quot;{selectedProvider?.name}&quot;
            </DialogDescription>
          </DialogHeader>

          <ProviderForm
            formData={formData}
            setFormData={setFormData}
            showApiKey={showApiKey}
            setShowApiKey={setShowApiKey}
            isEdit
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Annuler
            </Button>
            <Button
              className="bg-secondary hover:bg-secondary/90 text-white"
              onClick={handleUpdate}
              disabled={isSaving || !formData.name}
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation ─── */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le fournisseur ?</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer &quot;{selectedProvider?.name}&quot; ?
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Model Switcher Dialog ─── */}
      <Dialog open={showModelSwitcher} onOpenChange={setShowModelSwitcher}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-secondary" />
              Changer de modèle
            </DialogTitle>
            <DialogDescription>
              Sélectionnez un modèle pour le fournisseur actif <strong>{activeProvider?.name}</strong>.
              Modèle actuel : <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{activeProvider?.model}</code>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {isLoadingModels ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-secondary" />
                <span className="ml-2 text-sm text-muted-foreground">Chargement des modèles...</span>
              </div>
            ) : dynamicModels.length > 0 ? (
              <div className="max-h-80 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                {dynamicModels.map((model) => (
                  <button
                    key={model}
                    onClick={() => handleQuickModelSwitch(model)}
                    disabled={switchingModel !== null}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-all flex items-center justify-between group ${
                      model === activeProvider?.model
                        ? 'border-secondary/30 bg-secondary/10'
                        : 'border-transparent hover:border-secondary/30 hover:bg-secondary/10'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {model === activeProvider?.model ? (
                        <Check className="h-4 w-4 text-secondary shrink-0" />
                      ) : (
                        <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 shrink-0 group-hover:border-secondary" />
                      )}
                      <span className={`font-mono text-xs ${model === activeProvider?.model ? 'font-bold text-secondary' : ''}`}>
                        {model}
                      </span>
                    </div>
                    {switchingModel === model && (
                      <Loader2 className="h-4 w-4 animate-spin text-secondary" />
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Aucun modèle récupéré depuis l&apos;API</p>
                <p className="text-xs text-muted-foreground mt-1">Utilisez le formulaire d&apos;édition pour saisir un modèle manuellement</p>
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
                  className="bg-secondary hover:bg-secondary/90 text-white"
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
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Provider Form Component ───
function ProviderForm({
  formData,
  setFormData,
  showApiKey,
  setShowApiKey,
  isEdit = false,
}: {
  formData: ProviderFormData
  setFormData: React.Dispatch<React.SetStateAction<ProviderFormData>>
  showApiKey: boolean
  setShowApiKey: React.Dispatch<React.SetStateAction<boolean>>
  isEdit?: boolean
}) {
  const meta = PROVIDER_META[formData.provider]
  const Icon = meta.icon
  const models = PROVIDER_MODELS[formData.provider]

  const handleProviderChange = (provider: AIProviderType) => {
    setFormData({
      ...formData,
      provider,
      baseUrl: PROVIDER_DEFAULT_URLS[provider],
      model: PROVIDER_MODELS[provider]?.[0] || '',
      apiKey: '',
      chatId: '',
      userId: '',
      token: '',
    })
  }

  return (
    <div className="space-y-5">
      {/* Provider type selector */}
      <div className="space-y-2">
        <Label>Type de fournisseur</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {(Object.entries(PROVIDER_META) as [AIProviderType, typeof PROVIDER_META.ZAI][]).map(([type, m]) => {
            const TypeIcon = m.icon
            const isSelected = formData.provider === type
            return (
              <button
                key={type}
                type="button"
                onClick={() => handleProviderChange(type)}
                className={`flex items-center gap-2 p-2.5 rounded-lg border-2 text-sm transition-all ${
                  isSelected
                    ? `${m.borderClass} ${m.bgClass} ${m.textClass} font-semibold`
                    : 'border-border hover:border-muted-foreground/30'
                }`}
              >
                <TypeIcon className="h-4 w-4 shrink-0" style={{ color: m.color }} />
                <span className="text-xs truncate">{m.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="provider-name">Nom du fournisseur</Label>
        <Input
          id="provider-name"
          placeholder="Ex: Mon OpenAI, Groq Production..."
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        />
      </div>

      {/* Base URL - not for ZAI */}
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

      {/* API Key - not for ZAI */}
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
            >
              {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {/* ZAI-specific fields */}
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

      {/* Model */}
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

      {/* KOKORO-TTS-1 : Capability (chat / tts / audio / transcription) */}
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
          <strong>tts</strong> pour la synthèse audio des podcasts /exam-prep.
        </p>
      </div>

      {/* Temperature */}
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

      {/* Max Tokens */}
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
          Nombre maximum de tokens par défaut dans la réponse. La génération d'épreuves ajuste automatiquement cette valeur (8192-16384) selon le nombre de questions. Pour les autres usages, 4096 est recommandé.
        </p>
      </div>
    </div>
  )
}
