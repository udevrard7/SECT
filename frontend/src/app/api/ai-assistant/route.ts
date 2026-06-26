import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-session'
import { getAIProvider } from '@/lib/ai-providers/factory'
import type { ChatMessage } from '@/lib/ai-providers/types'

/**
 * POST /api/ai-assistant — Assistant pédagogique IA contextuel.
 *
 * 🔒 Authentifié (tous rôles). Utilise le système de failover IA
 * (Mistral → Groq → OpenRouter) via getAIProvider().
 *
 * Body: { message: string, context?: { page?: string; role?: string } }
 * Response: { response: string, provider: string }
 *
 * Le system prompt est pédagogique : l'IA aide l'utilisateur à comprendre
 * ses cours, préparer ses examens, interpréter ses résultats, etc. Elle
 * refuse poliment les demandes hors-scope (hors pédagogie/évaluation).
 */
const SYSTEM_PROMPT = `Tu es l'assistant pédagogique de SECT, une plateforme d'évaluation académique pour l'enseignement supérieur en Côte d'Ivoire.

Ton rôle :
- Aider les étudiants à comprendre leurs cours, préparer leurs examens, analyser leurs résultats
- Aider les enseignants à créer des questions, élaborer des grilles de correction, analyser les performances
- Aider les responsables à interpréter les statistiques et identifier les étudiants en difficulté
- Expliquer des concepts pédagogiques avec clarté et des exemples concrets

Règles :
- Réponds en français, de manière pédagogique et encourageante
- Sois concis mais complet (max 300 mots par réponse)
- Si la question sort du cadre pédagogique/évaluation, redirige poliment
- N'invente jamais de faits ; si tu ne sais pas, dis-le
- Utilise des exemples adaptés au contexte universitaire africain quand pertinent`

const _postHandler = async (request: NextRequest) => {
  try {
    const body = await request.json()
    const { message, context } = body as { message?: string; context?: { page?: string; role?: string } }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json(
        { error: 'Message requis' },
        { status: 400 }
      )
    }

    if (message.length > 2000) {
      return NextResponse.json(
        { error: 'Message trop long (max 2000 caractères)' },
        { status: 400 }
      )
    }

    // Construire les messages pour l'IA
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
    ]

    // Contexte utilisateur (rôle + page courante) pour des réponses ciblées
    if (context?.role) {
      messages.push({
        role: 'system',
        content: `L'utilisateur est connecté en tant que ${context.role}. Adapte ton aide à ce rôle.`,
      })
    }
    if (context?.page) {
      messages.push({
        role: 'system',
        content: `L'utilisateur se trouve actuellement sur la page "${context.page}".`,
      })
    }

    messages.push({ role: 'user', content: message })

    // Appel IA via le système de failover (Mistral → Groq → OpenRouter)
    const provider = await getAIProvider()
    const result = await provider.chatCompletion({
      messages,
      temperature: 0.7,
      maxTokens: 600,
    })

    const responseContent = result.choices[0]?.message?.content ?? ''

    return NextResponse.json({
      response: responseContent,
      provider: result.model,
    })
  } catch (error) {
    console.error('[AI Assistant] Error:', error)
    const msg = error instanceof Error ? error.message : 'Erreur inconnue'
    return NextResponse.json(
      { error: `L'assistant IA est temporairement indisponible: ${msg}` },
      { status: 500 }
    )
  }
}

export const POST = withAuth(_postHandler, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT', 'ETUDIANT'])
