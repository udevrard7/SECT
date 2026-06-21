import { NextRequest, NextResponse } from 'next/server'
import { getAIProvider } from '@/lib/ai-providers/factory'

/**
 * POST /api/landing-demo
 * Public (no auth) — powers the interactive demo on the landing page.
 * Body: { topic: string }
 * Returns a single AI-generated multiple-choice question (QCM) about the topic.
 *
 * Strategy (resilient):
 *  1. Try the configured AI provider from the DB factory (Mistral/ZAI/OpenAI...).
 *     This works both in sandbox (ZAI config file) and on Vercel (DB-configured
 *     providers like Mistral AI, which is the active provider in production).
 *  2. If the AI call fails for any reason (DB down, provider error, timeout),
 *     fall back to a local deterministic QCM generator so the demo ALWAYS
 *     returns something useful to the visitor.
 *
 * Rate-limited per-IP via a simple in-memory counter.
 */

interface QCMResult {
  question: string
  options: string[]
  correctIndex: number
  difficulty: 'Facile' | 'Moyen' | 'Difficile'
  explanation: string
  source: 'ai' | 'local'
}

// --- In-memory rate limiter (per IP, rolling window) ---
const WINDOW_MS = 60_000 // 1 minute
const MAX_PER_WINDOW = 8
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

/* ─── Local fallback QCM generator (deterministic, no AI) ─── */
// A curated bank of ready-made questions for common academic topics.
// Used ONLY when the AI is unavailable, so the demo never breaks.
const LOCAL_BANK: Array<{ keywords: string[]; qcm: QCMResult }> = [
  {
    keywords: ['photosynthèse', 'photosynthese', 'plante', 'biologie', 'végétal', 'vegetal', 'chlorophylle'],
    qcm: {
      question: "La photosynthèse convertit l'énergie lumineuse en quelle forme d'énergie chimique ?",
      options: ['ATP et NADPH', 'ADP uniquement', 'Glucose pur', 'Oxygène libre'],
      correctIndex: 0,
      difficulty: 'Moyen',
      explanation:
        "La photosynthèse transforme l'énergie lumineuse en énergie chimique stockée dans l'ATP et le NADPH, utilisés ensuite pour synthétiser le glucose.",
    },
  },
  {
    keywords: ['droit', 'constitutionnel', 'constitution', 'juridique', 'loi', 'état'],
    qcm: {
      question: "Qu'est-ce qu'une Constitution dans un État de droit ?",
      options: [
        'Un recueil de lois ordinaires',
        "L'ensemble des normes internationales",
        'La loi suprême qui organise les pouvoirs publics',
        'Un décret présidentiel',
      ],
      correctIndex: 2,
      difficulty: 'Facile',
      explanation:
        "La Constitution est la norme juridique suprême : elle organise les pouvoirs (exécutif, législatif, judiciaire) et garantit les droits fondamentaux.",
    },
  },
  {
    keywords: ['algorithme', 'tri', 'code', 'programmation', 'informatique', 'python', 'javascript', 'complexité'],
    qcm: {
      question: "Quelle est la complexité temporelle moyenne du tri rapide (quicksort) ?",
      options: ['O(n)', 'O(n log n)', 'O(n²)', 'O(log n)'],
      correctIndex: 1,
      difficulty: 'Difficile',
      explanation:
        'En moyenne, le tri rapide a une complexité O(n log n). Dans le pire des cas (pivot mal choisi), il dégénère en O(n²).',
    },
  },
  {
    keywords: ['mathématique', 'matrice', 'algèbre', 'calcul', 'intégrale', 'dérivée', 'mathematique'],
    qcm: {
      question: "La dérivée de la fonction f(x) = x² est :",
      options: ['x', '2x', 'x²/2', '2'],
      correctIndex: 1,
      difficulty: 'Facile',
      explanation: "La dérivée de xⁿ est n·xⁿ⁻¹. Donc la dérivée de x² est 2x.",
    },
  },
  {
    keywords: ['économie', 'economie', 'pib', 'marché', 'inflation', 'balance', 'commerce'],
    qcm: {
      question: "Que mesure le Produit Intérieur Brut (PIB) ?",
      options: [
        'La richesse totale des citoyens',
        "La valeur des biens et services produits dans un pays",
        'Le volume des exportations',
        'Le taux de chômage',
      ],
      correctIndex: 1,
      difficulty: 'Facile',
      explanation:
        "Le PIB mesure la valeur monétaire de l'ensemble des biens et services finaux produits sur le territoire d'un pays pendant une période donnée.",
    },
  },
  {
    keywords: ['histoire', 'révolution', 'revolution', 'guerre', 'indépendance', 'independance', 'colonial'],
    qcm: {
      question: "En quelle année a débuté la Révolution française ?",
      options: ['1776', '1789', '1804', '1815'],
      correctIndex: 1,
      difficulty: 'Facile',
      explanation:
        'La Révolution française débute en 1789 avec la prise de la Bastille le 14 juillet, symbole de la fin de la monarchie absolue.',
    },
  },
]

function generateLocal(topic: string): QCMResult {
  const lower = topic.toLowerCase()
  // 1. Try to match a banked topic by keyword
  for (const entry of LOCAL_BANK) {
    if (entry.keywords.some((k) => lower.includes(k))) {
      return { ...entry.qcm, source: 'local' }
    }
  }
  // 2. Generic templated question for any other topic
  return {
    question: `Parmi ces propositions concernant « ${topic} », laquelle est correcte ?`,
    options: [
      `C'est un concept fondamental lié à ${topic}`,
      `C'est un phénomène sans rapport avec ${topic}`,
      `C'est une méthode obsèle`,
      `C'est uniquement théorique`,
    ],
    correctIndex: 0,
    difficulty: 'Moyen',
    explanation: `Cette question est un exemple généré localement. Pour des questions adaptées en temps réel à votre sujet, l'IA est activée lorsque le service est disponible.`,
    source: 'local',
  }
}

/* ─── AI call with strict JSON parsing + validation ─── */
async function generateWithAI(topic: string): Promise<QCMResult> {
  const provider = await getAIProvider()
  const response = await provider.chatCompletion({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Sujet: ${topic}` },
    ],
    temperature: 0.7,
  })

  const raw = response.choices?.[0]?.message?.content?.trim() || ''
  if (!raw) throw new Error('Réponse IA vide')

  // Strip accidental code fences and extract first JSON object
  const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  const jsonStr = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned

  const parsed = JSON.parse(jsonStr)

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

  return { ...parsed, source: 'ai' }
}

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

    // Try AI first; fall back to local generator on any failure
    try {
      const qcm = await generateWithAI(topic)
      return NextResponse.json({ qcm })
    } catch (aiErr) {
      const reason = aiErr instanceof Error ? aiErr.message : 'unknown'
      console.warn('[landing-demo] AI failed, using local fallback:', reason)
      const qcm = generateLocal(topic)
      return NextResponse.json({ qcm })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    console.error('[landing-demo] Error:', message)
    return NextResponse.json(
      { error: "L'IA n'a pas pu générer la question. Réessayez." },
      { status: 500 }
    )
  }
}
