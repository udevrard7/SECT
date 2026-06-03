import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAIProvider } from '@/lib/ai-providers'

export const maxDuration = 60

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
        question: true,
        session: {
          include: {
            epreuve: {
              include: {
                questions: { where: { questionId } },
              },
            },
          },
        },
      },
    })

    if (!reponse) {
      return NextResponse.json({ error: 'Réponse non trouvée' }, { status: 404 })
    }

    if (reponse.question.type !== 'QRC' && reponse.question.type !== 'TRS') {
      return NextResponse.json({ error: 'Seules les QRC et TRS peuvent être corrigées par l\'IA' }, { status: 400 })
    }

    // Get the correct answer and bareme
    const correctAnswer = reponse.question.reponseCorrecte
      ? JSON.parse(reponse.question.reponseCorrecte)
      : null
    const bareme = reponse.session.epreuve.questions[0]?.bareme || 1

    // Use AI to grade
    const aiProvider = await getAIProvider()

    const isQRC = reponse.question.type === 'QRC'

    const prompt = isQRC
      ? `Tu es un correcteur pédagogique expert pour l'enseignement supérieur. Évalue la réponse courte d'un étudiant.

Question: ${reponse.question.enonce}

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

Consigne: ${reponse.question.enonce}

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
      aiGrade: {
        note: aiNote,
        bareme,
        justification: aiResult.justification,
      },
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

// Teacher validates/adjusts a grade
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
              questions: true,
            },
          },
          resultat: true,
        },
      })

      if (!session) {
        return NextResponse.json({ error: 'Session non trouvée' }, { status: 404 })
      }

      // Calculate total score
      const detailParQuestion = session.reponses.map((r) => {
        const eq = session.epreuve.questions.find((q) => q.questionId === r.questionId)
        return {
          questionId: r.questionId,
          type: eq?.question ? 'QCU/QCM/QRC/TRS' : 'unknown',
          bareme: eq?.bareme || 0,
          score: r.score || 0,
          noteIA: r.noteIA,
          repondu: !!r.contenu,
        }
      })

      const totalScore = session.reponses.reduce((sum, r) => sum + (r.score || 0), 0)
      const totalPossible = session.epreuve.questions.reduce((sum, eq) => sum + eq.bareme, 0)

      // Create or update resultat
      if (session.resultat) {
        await db.resultat.update({
          where: { id: session.resultat.id },
          data: {
            scoreFinal: totalScore,
            detailParQuestion: JSON.stringify(detailParQuestion),
            dateCorrection: new Date(),
          },
        })
      } else {
        await db.resultat.create({
          data: {
            sessionId,
            scoreFinal: totalScore,
            detailParQuestion: JSON.stringify(detailParQuestion),
            dateCorrection: new Date(),
          },
        })
      }

      // Update session status
      await db.sessionPassation.update({
        where: { id: sessionId },
        data: {
          statut: 'CORRIGEE',
          score: totalScore,
        },
      })

      // Audit log — finalize correction
      await db.auditLog.create({
        data: {
          userId: 'system',
          userEmail: 'system',
          action: 'FINALIZE_CORRECTION',
          entite: 'SessionPassation',
          entiteId: sessionId,
          details: `Correction finalisée — score ${totalScore}/${totalPossible}`,
        },
      })

      return NextResponse.json({
        score: totalScore,
        totalPossible,
        percentage: totalPossible > 0 ? Math.round((totalScore / totalPossible) * 100) : 0,
        message: 'Correction finalisée',
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
