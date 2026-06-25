import { NextRequest, NextResponse } from 'next/server'
import { db, withRetry } from '@/lib/db'
import { withAuth, type AuthenticatedUser } from '@/lib/auth-session'
import { getAIProvider } from '@/lib/ai-providers'

/**
 * POST /api/exam-prep/practice/[id]/submit
 *
 * L'étudiant soumet sa réponse à une question d'entraînement.
 * - Correction auto pour QCU/QCM (comparaison des propositions).
 * - Correction IA pour QRC/TRS/REFLEXION/CODE (score 0..1 + feedback).
 * - Persiste un PracticeAttempt.
 * - Met à jour le ReviewItem (SRS SM-2) pour le chapitre si fourni.
 * - Renvoie { attempt, explication (révélée), srs }.
 *
 * Body : { reponse: string, chapterId?: string, dureeSec?: number }
 */
export const maxDuration = 60

interface SubmitBody {
  reponse: string
  chapterId?: string
  dureeSec?: number
}

async function _POST(
  request: NextRequest,
  context: { params: { id: string }; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const { id: questionId } = await context.params
    const body = (await request.json()) as SubmitBody
    const { reponse, chapterId, dureeSec } = body

    if (!reponse || typeof reponse !== 'string' || reponse.trim().length === 0) {
      return NextResponse.json({ error: 'reponse est requis' }, { status: 400 })
    }

    // ─── Charge la question + vérifie l'accès au document ───
    const question = await withRetry(() =>
      db.question.findUnique({
        where: { id: questionId },
        include: {
          document: {
            select: {
              id: true,
              uniteEnseignement: {
                select: { filiereId: true, niveau: true, niveaux: true, actif: true },
              },
            },
          },
        },
      })
    )

    if (!question || question.deletedAt) {
      return NextResponse.json({ error: 'Question introuvable.' }, { status: 404 })
    }

    // Scoping : la question doit venir d'un document accessible à l'étudiant
    const ue = question.document?.uniteEnseignement
    const hasAccess =
      ue &&
      ue.actif &&
      ue.filiereId === user.filiereId &&
      (ue.niveau === user.niveau || (ue.niveaux && ue.niveaux.includes(user.niveau ?? '')))
    if (!hasAccess) {
      return NextResponse.json({ error: 'Accès non autorisé à cette question.' }, { status: 403 })
    }

    // ─── Correction ───
    let score: number
    let correct: boolean
    let feedback: string

    if (question.type === 'QCU' || question.type === 'QCM') {
      // Correction auto par comparaison des propositions
      const propositions = question.propositions
        ? safeJsonParse<Array<{ texte: string; correct: boolean }>>(question.propositions, [])
        : []
      const correctTexts = propositions.filter((p) => p.correct).map((p) => p.texte)
      const studentTexts = safeJsonParse<string[]>(reponse, [reponse])

      const intersection = studentTexts.filter((s) => correctTexts.includes(s))
      if (question.type === 'QCU') {
        correct = intersection.length === 1 && correctTexts.length === 1
        score = correct ? 1 : 0
      } else {
        // QCM : score partiel = (bonnes réponses sélectionnées - mauvaises) / total correctes
        const wrongSelected = studentTexts.length - intersection.length
        score = Math.max(0, (intersection.length - wrongSelected) / Math.max(1, correctTexts.length))
        correct = score === 1
      }
      feedback = correct
        ? '✓ Correct !'
        : `Réponse attendue : ${correctTexts.join(', ')}`
    } else {
      // QRC / TRS / REFLEXION / CODE → correction IA
      const aiResult = await aiGradeQuestion(
        question.enonce,
        question.reponseCorrecte ?? '(réponse attendue non définie)',
        reponse,
        question.type
      )
      score = aiResult.score
      correct = aiResult.correct
      feedback = aiResult.feedback
    }

    // ─── Persiste le PracticeAttempt ───
    const attempt = await withRetry(() =>
      db.practiceAttempt.create({
        data: {
          userId: user.id,
          questionId,
          documentId: question.documentId,
          chapterId: chapterId ?? null,
          reponse: reponse.slice(0, 4000),
          score,
          feedback: feedback.slice(0, 1000),
          correct,
          dureeSec: dureeSec ?? null,
        },
        select: { id: true, score: true, correct: true, feedback: true, createdAt: true },
      })
    )

    // ─── Met à jour le SRS (ReviewItem) si chapterId fourni ───
    let srs: { nextReviewAt: string; masteryLevel: number; interval: number } | null = null
    if (chapterId) {
      srs = await updateReviewItemSrs(user.id, chapterId, correct)
    }

    return NextResponse.json({
      attempt: {
        id: attempt.id,
        score: attempt.score,
        correct: attempt.correct,
        feedback: attempt.feedback,
      },
      // Révèle l'explication stockée sur la question (feedback pédagogique)
      explication: question.explication ?? null,
      reponseCorrecte: question.type === 'QCU' || question.type === 'QCM'
        ? (question.propositions
            ? safeJsonParse<Array<{ texte: string; correct: boolean }>>(question.propositions, [])
                .filter((p) => p.correct)
                .map((p) => p.texte)
                .join(', ')
            : null)
        : question.reponseCorrecte,
      srs,
    })
  } catch (error) {
    console.error('[exam-prep/practice/submit] error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la correction. Réessayez.' },
      { status: 500 }
    )
  }
}

// ─── Correction IA pour questions ouvertes ───

async function aiGradeQuestion(
  enonce: string,
  reponseAttendue: string,
  reponseEtudiant: string,
  type: string
): Promise<{ score: number; correct: boolean; feedback: string }> {
  try {
    const provider = await getAIProvider()
    const completion = await provider.chatCompletion({
      messages: [
        {
          role: 'system',
          content: `Tu es un correcteur pédagogique. Évalue la réponse de l'étudiant de façon bienveillante mais rigoureuse. Réponds UNIQUEMENT en JSON valide.`
        },
        {
          role: 'user',
          content: `Type de question: ${type}
Énoncé: ${enonce}
Réponse attendue: ${reponseAttendue}
Réponse de l'étudiant: ${reponseEtudiant}

Évalue la réponse. Réponds en JSON:
{
  "score": 0.0 à 1.0,
  "correct": true si score >= 0.5 sinon false,
  "feedback": "feedback pédagogique 1-2 phrases : ce qui est juste, ce qui manque, conseil pour progresser"
}`
        },
      ],
    })

    const text = completion.choices[0]?.message?.content || ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { score?: number; correct?: boolean; feedback?: string }
      return {
        score: typeof parsed.score === 'number' ? Math.min(1, Math.max(0, parsed.score)) : 0,
        correct: typeof parsed.correct === 'boolean' ? parsed.correct : (parsed.score ?? 0) >= 0.5,
        feedback: parsed.feedback ?? 'Évaluation indisponible.',
      }
    }
  } catch (err) {
    console.error('[exam-prep/practice/submit] AI grade failed:', err)
  }
  // Fallback
  return { score: 0, correct: false, feedback: 'Évaluation automatique indisponible. Comparez avec la réponse attendue.' }
}

// ─── Algorithme SM-2 (SuperMemo 2) pour spaced repetition ───

async function updateReviewItemSrs(
  userId: string,
  chapterId: string,
  correct: boolean
): Promise<{ nextReviewAt: string; masteryLevel: number; interval: number }> {
  const quality = correct ? 5 : 2 // mapping simple correct→5, faux→2

  const existing = await withRetry(() =>
    db.reviewItem.findUnique({ where: { userId_chapterId: { userId, chapterId } } })
  )

  let interval: number
  let easeFactor: number
  let repetitions: number
  let masteryLevel: number

  if (existing) {
    easeFactor = existing.easeFactor
    repetitions = existing.repetitions
    masteryLevel = existing.masteryLevel

    if (quality < 3) {
      repetitions = 0
      interval = 1
    } else {
      repetitions += 1
      interval = repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.round(existing.interval * easeFactor)
    }
    easeFactor = Math.max(1.3, easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    masteryLevel = Math.min(1, Math.max(0, masteryLevel + (correct ? 0.15 : -0.1)))
  } else {
    // Création initiale
    if (quality < 3) {
      repetitions = 0
      interval = 1
    } else {
      repetitions = 1
      interval = 1
    }
    easeFactor = 2.5
    masteryLevel = correct ? 0.2 : 0
  }

  const nextReviewAt = new Date(Date.now() + interval * 86400000)

  await withRetry(() =>
    db.reviewItem.upsert({
      where: { userId_chapterId: { userId, chapterId } },
      create: {
        userId, chapterId, interval, easeFactor, repetitions,
        lastReviewedAt: new Date(), nextReviewAt, masteryLevel,
      },
      update: {
        interval, easeFactor, repetitions,
        lastReviewedAt: new Date(), nextReviewAt, masteryLevel,
      },
    })
  )

  return {
    nextReviewAt: nextReviewAt.toISOString(),
    masteryLevel,
    interval,
  }
}

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export const POST = withAuth(_POST, ['ETUDIANT'])
