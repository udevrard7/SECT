import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Get sessions needing correction for a teacher
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const enseignantId = searchParams.get('enseignantId')
    const epreuveId = searchParams.get('epreuveId')

    if (!enseignantId) {
      return NextResponse.json({ error: 'Enseignant requis' }, { status: 400 })
    }

    // Find all submitted sessions for this teacher's exams
    const where: Record<string, unknown> = {
      epreuve: { enseignantId },
      statut: { in: ['SOUMISE', 'CORRIGEE'] },
    }
    if (epreuveId) where.epreuveId = epreuveId

    const sessions = await db.sessionPassation.findMany({
      where,
      orderBy: { dateFin: 'asc' },
      include: {
        etudiant: { select: { id: true, name: true, email: true } },
        epreuve: {
          select: {
            id: true,
            titre: true,
            duree: true,
            statut: true,
            questions: {
              include: {
                question: {
                  select: {
                    id: true,
                    type: true,
                    enonce: true,
                    propositions: true,
                    reponseCorrecte: true,
                    explication: true,
                    difficulte: true,
                  },
                },
              },
              orderBy: { ordre: 'asc' },
            },
          },
        },
        reponses: true,
        resultat: true,
      },
    })

    // Parse JSON fields and identify which need manual correction
    const parsedSessions = sessions.map((session) => {
      const reponses = session.reponses.map((r) => ({
        ...r,
      }))

      // Find QRC/TRS answers that need manual correction
      const needsCorrection = session.epreuve.questions.filter((eq) => {
        if (eq.question.type !== 'QRC' && eq.question.type !== 'TRS') return false
        const reponse = reponses.find((r) => r.questionId === eq.question.id)
        return reponse && (reponse.score === null || reponse.noteIA === null)
      })

      const allCorrected = session.reponses.every((r) => r.score !== null)

      return {
        ...session,
        logEvents: session.logEvents ? JSON.parse(session.logEvents) : null,
        reponses,
        epreuve: {
          ...session.epreuve,
          questions: session.epreuve.questions.map((eq) => ({
            ...eq,
            question: {
              ...eq.question,
              propositions: eq.question.propositions ? JSON.parse(eq.question.propositions) : null,
              reponseCorrecte: eq.question.reponseCorrecte ? JSON.parse(eq.question.reponseCorrecte) : null,
            },
          })),
        },
        resultat: session.resultat ? {
          ...session.resultat,
          detailParQuestion: session.resultat.detailParQuestion ? JSON.parse(session.resultat.detailParQuestion) : null,
          commentaires: session.resultat.commentaires ? JSON.parse(session.resultat.commentaires) : null,
        } : null,
        needsCorrectionCount: needsCorrection.length,
        allCorrected,
      }
    })

    return NextResponse.json({ sessions: parsedSessions })
  } catch (error) {
    console.error('List corrections error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des corrections' },
      { status: 500 }
    )
  }
}
