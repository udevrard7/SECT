import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Submit exam
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { autoSubmit } = body

    // Get session
    const session = await db.sessionPassation.findUnique({
      where: { id },
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

    if (session.statut !== 'EN_COURS') {
      return NextResponse.json({ error: 'Session déjà soumise' }, { status: 400 })
    }

    // Mark session as submitted
    const now = new Date()
    const updatedSession = await db.sessionPassation.update({
      where: { id },
      data: {
        statut: 'SOUMISE',
        dateFin: now,
        logEvents: session.logEvents
          ? JSON.stringify([
              ...JSON.parse(session.logEvents),
              { type: autoSubmit ? 'AUTO_SUBMIT' : 'MANUAL_SUBMIT', timestamp: now.toISOString() },
            ])
          : JSON.stringify([{ type: autoSubmit ? 'AUTO_SUBMIT' : 'MANUAL_SUBMIT', timestamp: now.toISOString() }]),
      },
    })

    // Auto-grade QCU and QCM questions
    let totalScore = 0
    const detailParQuestion: Record<string, unknown>[] = []

    for (const eq of session.epreuve.questions) {
      const question = eq.question
      const reponse = session.reponses.find((r) => r.questionId === question.id)

      let questionScore = 0
      let correctAnswer: unknown = null

      try {
        correctAnswer = question.reponseCorrecte ? JSON.parse(question.reponseCorrecte) : null
      } catch {
        correctAnswer = question.reponseCorrecte
      }

      if (question.type === 'QCU') {
        // Binary scoring: correct = bareme, incorrect = 0
        if (reponse && reponse.contenu === correctAnswer) {
          questionScore = eq.bareme
        }
      } else if (question.type === 'QCM') {
        // Partial scoring: proportion of correctly selected answers
        if (reponse && correctAnswer) {
          try {
            const studentAnswers = JSON.parse(reponse.contenu || '[]') as string[]
            const correctAnswers: unknown[] = Array.isArray(correctAnswer) ? correctAnswer : [correctAnswer]

            const correctSelections = studentAnswers.filter((a: string) => correctAnswers.includes(a)).length
            const incorrectSelections = studentAnswers.filter((a: string) => !correctAnswers.includes(a)).length
            const totalCorrect = correctAnswers.length

            // Score = (correct - incorrect) / totalCorrect * bareme, minimum 0
            questionScore = Math.max(0, ((correctSelections - incorrectSelections) / totalCorrect) * eq.bareme)
          } catch {
            questionScore = 0
          }
        }
      }
      // QRC and TRS: no auto-grading, will be corrected manually

      // Update the response with score
      if (reponse) {
        await db.reponse.update({
          where: { id: reponse.id },
          data: { score: questionScore },
        })
      }

      totalScore += questionScore
      detailParQuestion.push({
        questionId: question.id,
        type: question.type,
        bareme: eq.bareme,
        score: questionScore,
        repondu: !!reponse,
      })
    }

    // Create result
    const totalPossible = (session.epreuve.questions as any[]).reduce((sum: number, eq: any) => sum + eq.bareme, 0)

    const resultat = await db.resultat.create({
      data: {
        sessionId: id,
        scoreFinal: totalScore,
        detailParQuestion: JSON.stringify(detailParQuestion),
        commentaires: null,
      },
    })

    // Update session with score
    await db.sessionPassation.update({
      where: { id },
      data: { score: totalScore },
    })

    return NextResponse.json({
      session: updatedSession,
      resultat: {
        ...resultat,
        detailParQuestion: JSON.parse(resultat.detailParQuestion || '[]'),
      },
      score: totalScore,
      totalPossible,
      percentage: totalPossible > 0 ? Math.round((totalScore / totalPossible) * 100) : 0,
      autoGraded: detailParQuestion.filter((d) => d.type === 'QCU' || d.type === 'QCM').length,
      pendingCorrection: detailParQuestion.filter((d) => d.type === 'QRC' || d.type === 'QCM').length,
      message: autoSubmit ? 'Épreuve soumise automatiquement (temps écoulé)' : 'Épreuve soumise avec succès',
    })
  } catch (error) {
    console.error('Submit session error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la soumission' },
      { status: 500 }
    )
  }
}

// Get session details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const session = await db.sessionPassation.findUnique({
      where: { id },
      include: {
        etudiant: { select: { id: true, name: true, email: true } },
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
        resultat: true,
      },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session non trouvée' }, { status: 404 })
    }

    return NextResponse.json({
      session: {
        ...session,
        logEvents: session.logEvents ? JSON.parse(session.logEvents) : null,
      },
    })
  } catch (error) {
    console.error('Get session error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération de la session' },
      { status: 500 }
    )
  }
}
