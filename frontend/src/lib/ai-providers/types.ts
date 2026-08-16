/**
 * AI Provider abstraction layer types.
 * All AI providers must implement the AIProvider interface.
 */

export type AIProviderType = 'ZAI' | 'OPENAI' | 'OPENAI_COMPATIBLE' | 'ANTHROPIC' | 'GOOGLE' | 'MISTRAL' | 'VOXTRAL' | 'DASHSCOPE' | 'DEEPSEEK' | 'CEREBRAS'

// DASHSCOPE-AUDIO-1 / KOKORO-TTS-1 : capacité d'un provider IA.
// - 'chat' : LLM textuel (génération de script, Q&A, etc.) — providers Mistral, ZAI, etc.
// - 'tts' : synthèse vocale (text → audio) — providers HuggingFace Kokoro, DashScope qwen3-tts.
// - 'audio' : LLM audio multimodal (réservé évolution future).
// - 'transcription' : speech-to-text (réservé évolution future).
export type AIProviderCapability = 'chat' | 'tts' | 'audio' | 'transcription'

export interface AIProviderConfig {
  id: string
  name: string
  provider: AIProviderType
  baseUrl?: string | null
  apiKey?: string | null
  model?: string | null
  temperature?: number | null
  maxTokens?: number | null
  isActive: boolean
  priority?: number | null
  extraConfig?: string | null // JSON string for provider-specific settings
  lastTestAt?: Date | null
  lastTestOk?: boolean | null
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatCompletionResult {
  choices: Array<{
    index: number
    message: { role: string; content: string }
    finish_reason: string
  }>
  id: string
  model: string
  object: string
  created: number
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface AIProvider {
  /** Unique identifier for this provider instance */
  readonly id: string
  /** Display name */
  readonly name: string
  /** Provider type */
  readonly providerType: AIProviderType

  /**
   * Create a chat completion.
   * This is the main method that all AI-calling code uses.
   */
  chatCompletion(params: {
    messages: ChatMessage[]
    model?: string
    temperature?: number
    maxTokens?: number
    [key: string]: unknown
  }): Promise<ChatCompletionResult>

  /**
   * Test the connection to this provider.
   * Returns a simple success/failure with a message.
   */
  testConnection(): Promise<{ success: boolean; message: string; responseTime?: number }>
}

/** Provider info for the UI (no sensitive data) */
export interface AIProviderInfo {
  id: string
  name: string
  provider: AIProviderType
  baseUrl?: string | null
  model?: string | null
  temperature?: number | null
  maxTokens?: number | null
  isActive: boolean
  hasApiKey: boolean
  priority?: number
  extraConfig?: string | null
  capability?: AIProviderCapability | null // DASHSCOPE-AUDIO-1 / KOKORO-TTS-1
  lastTestAt?: string | null
  lastTestOk?: boolean | null
  createdAt: string
  updatedAt: string
}

/** Supported provider types with metadata */
/** Failover event types for logging */
export type FailoverEventType = 'FAIL_OVER' | 'RECOVERY' | 'MANUAL_SWITCH' | 'COOLDOWN_EXPIRED' | 'ALL_FAILED'

/** Provider health status (from FailoverProvider) */
export interface ProviderHealthStatus {
  providerId: string
  providerName: string
  consecutiveFailures: number
  lastFailureAt: number | null
  lastSuccessAt: number | null
  totalCalls: number
  totalFailures: number
  totalFailovers: number
  isCoolingDown: boolean
}

/** Failover configuration */
export interface FailoverConfigType {
  enabled: boolean
  maxConsecutiveFailures: number
  cooldownDurationMs: number
  retryAllProviders: boolean
}

export const PROVIDER_TYPES: Record<AIProviderType, {
  label: string
  description: string
  icon: string
  requiresBaseUrl: boolean
  requiresApiKey: boolean
  defaultBaseUrl: string
  defaultModel: string
  models: string[]
}> = {
  ZAI: {
    label: 'Z-AI',
    description: 'Z.ai Intelligence Artificielle (SDK natif)',
    icon: 'Zap',
    requiresBaseUrl: false,
    requiresApiKey: false,
    defaultBaseUrl: 'https://z.ai/api/v1',
    defaultModel: 'default',
    models: ['default'],
  },
  OPENAI: {
    label: 'OpenAI',
    description: 'OpenAI GPT-4.1, GPT-4o, o3-mini, etc.',
    icon: 'Brain',
    requiresBaseUrl: false,
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4.1',
    models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o', 'gpt-4o-mini', 'o3-mini', 'o1', 'o1-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
  },
  OPENAI_COMPATIBLE: {
    label: 'OpenAI-Compatible',
    description: 'Tout fournisseur compatible API OpenAI (Groq, Together, Ollama, Mistral, etc.)',
    icon: 'Plug',
    requiresBaseUrl: true,
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'llama-3.1-70b-versatile', 'llama-3.2-1b-instant', 'llama-3.2-3b-instant', 'llama-3.2-11b-vision-instant', 'llama-3.2-90b-vision-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it', 'deepseek-r1-distill-llama-70b', 'qwen-qwq-32b', 'qwen-2.5-32b', 'whisper-large-v3', 'distil-whisper-large-v3-en'],
  },
  ANTHROPIC: {
    label: 'Anthropic',
    description: 'Claude Sonnet 4, Claude 3.5 Sonnet, etc.',
    icon: 'MessageSquare',
    requiresBaseUrl: false,
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-20250514',
    models: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
  },
  GOOGLE: {
    label: 'Google AI',
    description: 'Gemini 2.5 Pro/Flash, Gemini 2.0 via OpenAI-compatible endpoint',
    icon: 'Globe',
    requiresBaseUrl: false,
    requiresApiKey: true,
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-pro-preview-06-05',
    models: ['gemini-2.5-pro-preview-06-05', 'gemini-2.5-flash-preview-05-20', 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  },
  MISTRAL: {
    label: 'Mistral AI',
    description: 'Mistral Large, Mistral Small, Codestral — API Mistral directe',
    icon: 'Sparkles',
    requiresBaseUrl: false,
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-large-latest',
    models: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest', 'codestral-latest', 'open-mistral-nemo', 'open-mixtral-8x22b', 'open-mixtral-8x7b', 'open-mistral-7b'],
  },
  VOXTRAL: {
    label: 'Mistral Voxtral',
    description: 'Mistral Voxtral — synthèse vocale avec voice cloning (TTS)',
    icon: 'AudioWaveform',
    requiresBaseUrl: true,
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'voxtral-mini-tts-latest',
    models: ['voxtral-mini-tts-latest', 'voxtral-mini-tts-2603'],
  },
  DASHSCOPE: {
    label: 'DashScope (Alibaba)',
    description: 'Qwen Max, Qwen Plus, Qwen Turbo — Alibaba Cloud AI',
    icon: 'Mic',
    requiresBaseUrl: true,
    requiresApiKey: true,
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-max',
    models: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen-long', 'qwen3-max', 'qwen3-coder-plus', 'qwen3-omni-flash', 'qwen-vl-max', 'qwen3-vl-plus', 'qwen3-vl-flash'],
  },
  DEEPSEEK: {
    label: 'DeepSeek',
    description: 'DeepSeek Chat (V3), DeepSeek Reasoner (R1)',
    icon: 'Brain',
    requiresBaseUrl: false,
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  CEREBRAS: {
    label: 'Cerebras',
    description: 'Llama 4 Scout, Llama 3.3/3.1 — inference ultra-rapide',
    icon: 'Cpu',
    requiresBaseUrl: true,
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.cerebras.ai/v1',
    defaultModel: 'llama-4-scout-17b-16e-instruct',
    models: ['llama-4-scout-17b-16e-instruct', 'llama-3.3-70b', 'llama3.1-8b', 'llama3.1-70b'],
  },
}
