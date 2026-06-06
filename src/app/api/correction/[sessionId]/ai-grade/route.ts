import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAIProvider } from '@/lib/ai-providers'

export const maxDuration = 60

// Helper: find question data from both EpreuveQuestion relations and contenu JSONB
function findQuestionData(
  epreuve: {
    questions: Array<{
      questionId: string
      bareme: number
      question: { id: string; type: string; enonce: string; reponseCorrecte: string | null }
    }>
    contenu: unknown
  },
  questionId: string
): { type: string; enonce: string; reponseCorrecte: string | null; bareme: number } | null {
  // Try EpreuveQuestion relation first
  const eq = epreuve.questions.find((q) => q.questionId === questionId)
  if (eq) {
    return {
      type: eq.question.type,
      enonce: eq.question.enonce,
      reponseCorrecte: eq.question.reponseCorrecte,
      bareme: eq.bareme,
    }
  }

  // Try contenu JSONB
  const contenuData = epreuve.contenu as Record<string, unknown> | null
  if (contenuData && typeof contenuData === 'object' && Array.isArray(contenuData.questions)) {
    const contenuQuestions = contenuData.questions as Array<Record<string, unknown>>
    const q = contenuQuestions.find(
      (cq) => String(cq.id) === questionId || `contenu-q${contenuQuestions.indexOf(cq)}` === questionId
    )
    if (q) {
      return {
        type: String(q.type || 'QRC'),
        enonce: String(q.enonce || ''),
        reponseCorrecte: q.reponseCorrecte ? JSON.stringify(q.reponseCorrecte) : null,
        bareme: typeof q.bareme === 'number' ? q.bareme : 1,
      }
    }
  }

  return null
}

// AI-grade a single QRC or TRS answer
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params
    const body = await request.json()
    const { questionId } = body

    if (!questionId) {
      return NextResponse.json({ error: 'Question requise' }, { status: 400 })
    }

    // Get the answer
    const reponse = await db.reponse.findUnique({
      where: {
        sessionId_questionId: { sessionId, questionId },
      },
      include: {
        session: {
          include: {
            epreuve: {
              include: {
                questions: {
                  include: {
                    question: {
                      select: {
                        id: true,
                        type: true,
                        enonce: true,
                        reponseCorrecte: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!reponse) {
      return NextResponse.json({ error: 'Réponse non trouvée' }, { status: 404 })
    }

    // Find question data from relations or contenu JSONB
    const questionData = findQuestionData(reponse.session.epreuve as any, questionId)

    if (!questionData) {
      return NextResponse.json({ error: 'Question non trouvée' }, { status: 404 })
    }

    if (!['QRC', 'TRS', 'REFLEXION'].includes(questionData.type)) {
      return NextResponse.json({ error: 'Seules les QRC, TRS et REFLEXION peuvent être corrigées par l\'IA' }, { status: 400 })
    }

    // Get the correct answer and bareme
    let correctAnswer: string | null = null
    try {
      correctAnswer = questionData.reponseCorrecte ? JSON.parse(questionData.reponseCorrecte) : null
    } catch {
      correctAnswer = questionData.reponseCorrecte
    }
    const bareme = questionData.bareme

    // Use AI to grade
    const aiProvider = await getAIProvider()

    const isQRC = questionData.type === 'QRC'

    const prompt = isQRC
      ? `Tu es un correcteur pédagogique expert pour l'enseignement supérieur. Évalue la réponse courte d'un étudiant.

Question: ${questionData.enonce}

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

Consigne: ${questionData.enonce}

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
        {
          role: 'user',
          content: prompt
        }
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

    // Clamp note between 0 and bareme
    const aiNote = Math.max(0, Math.min(bareme, Number(aiResult.note) || 0))

    // Update the answer with AI proposal
    await db.reponse.update({
      where: {
        sessionId_questionId: { sessionId, questionId },
      },
      data: {
        noteIA: aiNote,
        justificationIA: aiResult.justification || '',
      },
    })

    // Audit log
    await db.auditLog.create({
      data: {
        userId: 'system',
        userEmail: 'system',
        action: 'AI_GRADE_RESPONSE',
        entite: 'Reponse',
        entiteId: `${sessionId}_${questionId}`,
        details: `Correction IA — session ${sessionId}, question ${questionId}, note ${aiNote}/${bareme}`,
      },
    })

    return NextResponse.json({
      noteIA: aiNote,
      bareme,
      justification: aiResult.justification,
      message: 'Évaluation IA effectuée',
    })
  } catch (error) {
    console.error('AI grade error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de l\'évaluation IA' },
      { status: 500 }
    )
  }
}

// Teacher validates/adjusts a grade or finalizes correction
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params
    const body = await request.json()
    const { questionId, score, commentaire, finalizeAll } = body

    if (finalizeAll) {
      // Finalize all answers and calculate final score
      const session = await db.sessionPassation.findUnique({
        where: { id: sessionId },
        include: {
          reponses: true,
          epreuve: {
            include: {
              questions: {
                include: {
                  question: { select: { id: true, type: true } },
                },
              },
            },
          },
          resultat: true,
        },
      })

      if (!session) {
        return NextResponse.json({ error: 'Session non trouvée' }, { status: 404 })
      }

      // Build unified questions from both formats
      type UnifiedQ = { questionId: string; bareme: number; type: string }
      const allQuestions: UnifiedQ[] = []

      // From EpreuveQuestion relations
      for (const eq of session.epreuve.questions) {
        allQuestions.push({
          questionId: eq.questionId,
          bareme: eq.bareme,
          type: eq.question.type,
        })
      }

      // From contenu JSONB if no EpreuveQuestion relations
      if (allQuestions.length === 0 && session.epreuve.contenu) {
        const contenuData = session.epreuve.contenu as Record<string, unknown> | null
        if (contenuData && typeof contenuData === 'object' && Array.isArray(contenuData.questions)) {
          const contenuQuestions = contenuData.questions as Array<Record<string, unknown>>
          for (let idx = 0; idx < contenuQuestions.length; idx++) {
            const q = contenuQuestions[idx]
            allQuestions.push({
              questionId: String(q.id || `contenu-q${idx}`),
              bareme: typeof q.bareme === 'number' ? q.bareme : 1,
              type: String(q.type || 'QRC'),
            })
          }
        }
      }

      // Calculate total score
      const detailParQuestion = allQuestions.map((q) => {
        const rep = session.reponses.find((r) => r.questionId === q.questionId)
        return {
          questionId: q.questionId,
          type: q.type,
          bareme: q.bareme,
          score: rep?.score ?? null,
          noteIA: rep?.noteIA || null,
          repondu: !!rep?.contenu,
        }
      })

      // Only count scores from graded responses (score !== null)
      const totalScore = session.reponses.reduce((sum, r) => sum + (r.score ?? 0), 0)
      const totalPossible = allQuestions.reduce((sum, q) => sum + q.bareme, 0)

      // Create or update resultat (with dateRetour since we auto-return)
      if (session.resultat) {
        await db.resultat.update({
          where: { id: session.resultat.id },
          data: {
            scoreFinal: totalScore,
            totalPossible,
            detailParQuestion: JSON.stringify(detailParQuestion),
            dateCorrection: new Date(),
            dateRetour: new Date(),
          },
        })
      } else {
        await db.resultat.create({
          data: {
            sessionId,
            scoreFinal: totalScore,
            totalPossible,
            detailParQuestion: JSON.stringify(detailParQuestion),
            dateCorrection: new Date(),
            dateRetour: new Date(),
          },
        })
      }

      // Update session status to RETOURNEE directly (auto-return)
      // Teacher clicks "Finaliser" → copy is corrected AND returned in one step
      await db.sessionPassation.update({
        where: { id: sessionId },
        data: {
          statut: 'RETOURNEE',
          score: totalScore,
        },
      })

      // Audit log — finalize & return correction
      await db.auditLog.create({
        data: {
          userId: 'system',
          userEmail: 'system',
          action: 'FINALIZE_AND_RETURN_CORRECTION',
          entite: 'SessionPassation',
          entiteId: sessionId,
          details: `Correction finalisée et copie rendue — score ${totalScore}/${totalPossible}`,
        },
      })

      return NextResponse.json({
        score: totalScore,
        totalPossible,
        percentage: totalPossible > 0 ? Math.round((totalScore / totalPossible) * 100) : 0,
        message: 'Correction finalisée et copie rendue',
        statut: 'RETOURNEE',
      })
    }

    // Update individual answer
    if (!questionId) {
      return NextResponse.json({ error: 'Question requise' }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {}
    if (score !== undefined) updateData.score = score
    if (commentaire !== undefined) updateData.commentaire = commentaire

    await db.reponse.update({
      where: {
        sessionId_questionId: { sessionId, questionId },
      },
      data: updateData,
    })

    return NextResponse.json({ message: 'Note mise à jour' })
  } catch (error) {
    console.error('Update grade error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour de la note' },
      { status: 500 }
    )
  }
}
