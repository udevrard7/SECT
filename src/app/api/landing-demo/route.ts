import { NextRequest, NextResponse } from 'next/server'
import { getZAI } from '@/lib/zai'

/**
 * POST /api/landing-demo
 * Public (no auth) — powers the interactive demo on the landing page.
 * Body: { topic: string }
 * Returns a single AI-generated multiple-choice question (QCM) about the topic.
 *
 * This route is intentionally lightweight and public so visitors can experience
 * the AI before signing up. It is rate-limited per-IP via a simple in-memory
 * counter to prevent abuse.
 */

interface QCMResult {
  question: string
  options: string[]
  correctIndex: number
  difficulty: 'Facile' | 'Moyen' | 'Difficile'
  explanation: string
}

// --- In-memory rate limiter (per IP, rolling window) ---
const WINDOW_MS = 60_000 // 1 minute
const MAX_PER_WINDOW = 5
const hits = new Map<string, { count: number; resetAt: number }>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = hits.get(ip)
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }
  entry.count += 1
  return entry.count > MAX_PER_WINDOW
}

function getClientIp(req: NextRequest): string {
  const xf = req.headers.get('x-forwarded-for')
  if (xf) return xf.split(',')[0].trim()
  return req.headers.get('x-real-ip') || 'unknown'
}

const SYSTEM_PROMPT = `Tu es un générateur de questions d'examen pour l'enseignement supérieur africain.
À partir d'un sujet, génère UNE seule question de type QCM (un seul choix correct, 4 options).
Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ou après, au format exact:
{"question":"...","options":["A","B","C","D"],"correctIndex":0,"difficulty":"Moyen","explanation":"..."}
- question: claire, niveau universitaire, en français
- options: 4 propositions plausibles dont une seule correcte
- correctIndex: index (0-3) de la bonne réponse
- difficulty: l'une de "Facile", "Moyen", "Difficile"
- explanation: 1-2 phrases justifiant la bonne réponse
Ne mets aucun markdown, aucun \`\`\`, juste le JSON brut.`

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request)
    if (rateLimited(ip)) {
      return NextResponse.json(
        { error: 'Trop de demandes. Réessayez dans une minute.' },
        { status: 429 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const topic = typeof body?.topic === 'string' ? body.topic.trim() : ''

    if (!topic || topic.length < 2) {
      return NextResponse.json(
        { error: 'Veuillez saisir un sujet valide.' },
        { status: 400 }
      )
    }
    if (topic.length > 200) {
      return NextResponse.json(
        { error: 'Le sujet est trop long (200 caractères max).' },
        { status: 400 }
      )
    }

    const zai = await getZAI()
    const response = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Sujet: ${topic}` },
      ],
      thinking: { type: 'disabled' },
    })

    const raw = response.choices?.[0]?.message?.content?.trim() || ''
    if (!raw) {
      throw new Error('Réponse IA vide')
    }

    // Strip accidental code fences and extract first JSON object
    const cleaned = raw
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim()
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    const jsonStr = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned

    let parsed: QCMResult
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      throw new Error('Réponse IA illisible')
    }

    // Validate shape
    if (
      typeof parsed.question !== 'string' ||
      !Array.isArray(parsed.options) ||
      parsed.options.length !== 4 ||
      typeof parsed.correctIndex !== 'number' ||
      parsed.correctIndex < 0 ||
      parsed.correctIndex > 3 ||
      typeof parsed.explanation !== 'string'
    ) {
      throw new Error('Structure de réponse invalide')
    }

    const validDiff = ['Facile', 'Moyen', 'Difficile']
    if (!validDiff.includes(parsed.difficulty)) {
      parsed.difficulty = 'Moyen'
    }

    return NextResponse.json({ qcm: parsed })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    console.error('[landing-demo] Error:', message)
    return NextResponse.json(
      { error: "L'IA n'a pas pu générer la question. Réessayez." },
      { status: 500 }
    )
  }
}
