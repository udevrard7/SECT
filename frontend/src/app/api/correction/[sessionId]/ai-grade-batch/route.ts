import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAIProvider } from '@/lib/ai-providers'
import { withAuth, type AuthenticatedUser } from '@/lib/auth-session'
import { verifyCorrectionOwnership } from '@/lib/correction-access'

export const maxDuration = 120

// Helper: extract question data from contenu JSONB
function getQuestionsFromContenu(contenu: unknown): Array<{
  id: string
  questionId: string
  type: string
  enonce: string
  reponseCorrecte: string | null
  bareme: number
}> {
  const contenuData = contenu as Record<string, unknown> | null
  if (!contenuData || typeof contenuData !== 'object' || !Array.isArray(contenuData.questions)) return []

  return (contenuData.questions as Array<Record<string, unknown>>).map((q, idx) => ({
    id: String(q.id || `contenu-q${idx}`),
    questionId: String(q.id || `contenu-q${idx}`),
    type: String(q.type || 'QRC'),
    enonce: String(q.enonce || ''),
    reponseCorrecte: q.reponseCorrecte ? JSON.stringify(q.reponseCorrecte) : null,
    bareme: typeof q.bareme === 'number' ? q.bareme : 1,
  }))
}

export const POST = withAuth(
  async (
    request: NextRequest,
    { params, user }: { params: Promise<{ sessionId: string }>; user: AuthenticatedUser }
  ) => {
    try {
    const { sessionId } = await params

    // Get session with all responses
    const session = await db.sessionPassation.findUnique({
      where: { id: sessionId },
      include: {
        epreuve: {
          include: {
            questions: {
              include: {
                question: true,
              },
            },
          },
        },
        reponses: true,
      },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session non trouvée' }, { status: 404 })
    }

    // ─── Ownership check ───
    const ownershipError = await verifyCorrectionOwnership(user, session.epreuve.enseignantId)
    if (ownershipError) return ownershipError

    // Build unified questions list
    type UnifiedQ = {
      questionId: string
      type: string
      enonce: string
      reponseCorrecte: string | null
      bareme: number
    }

    let allQuestions: UnifiedQ[] = []

    // From EpreuveQuestion relations
    for (const eq of session.epreuve.questions) {
      allQuestions.push({
        questionId: eq.questionId,
        type: eq.question.type,
        enonce: eq.question.enonce,
        reponseCorrecte: eq.question.reponseCorrecte,
        bareme: eq.bareme,
      })
    }

    // From contenu JSONB if no relations
    if (allQuestions.length === 0 && session.epreuve.contenu) {
      allQuestions = getQuestionsFromContenu(session.epreuve.contenu)
    }

    // Filter QRC/TRS/REFLEXION/CODE questions that need AI grading
    const questionsToGrade = allQuestions.filter((q) => {
      if (!['QRC', 'TRS', 'REFLEXION', 'CODE'].includes(q.type)) return false
      const reponse = session.reponses.find((r) => r.questionId === q.questionId)
      return reponse && reponse.contenu && reponse.noteIA === null
    })

    if (questionsToGrade.length === 0) {
      return NextResponse.json({ graded: 0, message: 'Aucune question à évaluer' })
    }

    const aiProvider = await getAIProvider()
    let gradedCount = 0
    const errors: string[] = []

    for (const q of questionsToGrade) {
      const reponse = session.reponses.find((r) => r.questionId === q.questionId)!

      try {
        let correctAnswer: unknown = null
        try {
          correctAnswer = q.reponseCorrecte ? JSON.parse(q.reponseCorrecte) : null
        } catch {
          correctAnswer = q.reponseCorrecte
        }

        const isQRC = q.type === 'QRC'
        const bareme = q.bareme

        const prompt = isQRC
          ? `Tu es un correcteur pédagogique expert pour l'enseignement supérieur. Évalue la réponse courte d'un étudiant.

Question: ${q.enonce}

Réponse attendue (modèle): ${correctAnswer || 'Non définie'}

Réponse de l'étudiant: ${reponse.contenu || '(Aucune réponse)'}

Barème: ${bareme} point(s)

Évalue la réponse et donne:
1. Une note sur ${bareme} (nombre décimal possible)
2. Une justification courte en français

Réponds UNIQUEMENT en JSON:
{
  "note": nombre_sur_${bareme},
  "justification": "justification courte"
}`
          : `Tu es un correcteur pédagogique expert pour l'enseignement supérieur. Évalue le devoir structuré d'un étudiant.

Consigne: ${q.enonce}

Grille de correction: ${correctAnswer || 'Non définie'}

Réponse de l'étudiant: ${reponse.contenu || '(Aucune réponse)'}

Barème total: ${bareme} point(s)

Évalue en utilisant la grille de correction si disponible. Donne:
1. Une note sur ${bareme} (nombre décimal possible)
2. Une justification détaillée en français avec évaluation par critère si applicable

Réponds UNIQUEMENT en JSON:
{
  "note": nombre_sur_${bareme},
  "justification": "justification détaillée"
}`

        const completion = await aiProvider.chatCompletion({
          messages: [
            {
              role: 'system',
              content: 'Tu es un correcteur pédagogique bienveillant mais rigoureux. Tu évalues les réponses des étudiants de manière juste et constructive. Tu réponds UNIQUEMENT en JSON valide.'
            },
            { role: 'user', content: prompt }
          ],
        })

        const responseText = completion.choices[0]?.message?.content || ''

        let aiResult
        try {
          const jsonMatch = responseText.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            aiResult = JSON.parse(jsonMatch[0])
          } else {
            throw new Error('No JSON found')
          }
        } catch {
          aiResult = {
            note: bareme * 0.5,
            justification: 'Évaluation IA non disponible - note moyenne attribuée par défaut',
          }
        }

        const aiNote = Math.max(0, Math.min(bareme, Number(aiResult.note) || 0))

        await db.reponse.update({
          where: {
            sessionId_questionId: { sessionId, questionId: q.questionId },
          },
          data: {
            noteIA: aiNote,
            justificationIA: aiResult.justification || '',
          },
        })

        gradedCount++
      } catch (err) {
        errors.push(`Question ${q.questionId}: ${err instanceof Error ? err.message : 'Erreur'}`)
      }
    }

    // Audit log
    await db.auditLog.create({
      data: {
        userId: user.id,
        userEmail: user.email,
        action: 'AI_BATCH_GRADE',
        entite: 'SessionPassation',
        entiteId: sessionId,
        details: `Correction IA batch — ${gradedCount}/${questionsToGrade.length} questions évaluées`,
      },
    })

    return NextResponse.json({
      graded: gradedCount,
      total: questionsToGrade.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `${gradedCount}/${questionsToGrade.length} questions évaluées par l'IA`,
    })
  } catch (error) {
    console.error('Batch AI grade error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de l\'évaluation IA en batch' },
      { status: 500 }
    )
  }
  },
  ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT']
)
