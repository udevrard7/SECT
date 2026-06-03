import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Get results for a student
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const etudiantId = searchParams.get('etudiantId')
    const epreuveId = searchParams.get('epreuveId')

    if (etudiantId) {
      // Student: get own results
      const sessions = await db.sessionPassation.findMany({
        where: {
          etudiantId,
          statut: { in: ['SOUMISE', 'CORRIGEE'] },
        },
        include: {
          epreuve: {
            select: {
              id: true,
              titre: true,
              description: true,
              duree: true,
              enseignant: { select: { name: true } },
              questions: {
                include: {
                  question: {
                    select: { id: true, type: true, enonce: true, difficulte: true },
                  },
                },
                orderBy: { ordre: 'asc' },
              },
            },
          },
          reponses: {
            include: {
              question: { select: { id: true, type: true, enonce: true } },
            },
          },
          resultat: true,
        },
        orderBy: { dateFin: 'desc' },
      })

      const parsedSessions = sessions.map((session) => ({
        ...session,
        logEvents: null, // Don't expose logs to students
        epreuve: {
          ...session.epreuve,
          questions: session.epreuve.questions.map((eq) => ({
            ...eq,
            question: {
              ...eq.question,
              enonce: eq.question.enonce,
            },
          })),
        },
        resultat: session.resultat ? {
          ...session.resultat,
          detailParQuestion: session.resultat.detailParQuestion
            ? JSON.parse(session.resultat.detailParQuestion)
            : null,
        } : null,
      }))

      return NextResponse.json({ resultats: parsedSessions })
    }

    if (epreuveId) {
      // Teacher: get all results for an exam
      const sessions = await db.sessionPassation.findMany({
        where: { epreuveId },
        include: {
          etudiant: { select: { id: true, name: true, email: true, filiere: true } },
          reponses: true,
          resultat: true,
        },
        orderBy: { score: 'desc' },
      })

      // Calculate statistics
      const scores = sessions
        .filter((s) => s.score !== null)
        .map((s) => s.score as number)

      const stats = {
        totalSessions: sessions.length,
        soumis: sessions.filter((s) => s.statut === 'SOUMISE').length,
        corriges: sessions.filter((s) => s.statut === 'CORRIGEE').length,
        moyenne: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
        mediane: scores.length > 0 ? scores.sort((a, b) => a - b)[Math.floor(scores.length / 2)] : 0,
        min: scores.length > 0 ? Math.min(...scores) : 0,
        max: scores.length > 0 ? Math.max(...scores) : 0,
        tauxReussite: scores.length > 0
          ? Math.round((scores.filter((s) => s >= 10).length / scores.length) * 100)
          : 0,
      }

      return NextResponse.json({
        sessions: sessions.map((s) => ({
          ...s,
          resultat: s.resultat ? {
            ...s.resultat,
            detailParQuestion: s.resultat.detailParQuestion ? JSON.parse(s.resultat.detailParQuestion) : null,
          } : null,
        })),
        stats,
      })
    }

    return NextResponse.json({ error: 'etudiantId ou epreuveId requis' }, { status: 400 })
  } catch (error) {
    console.error('Get resultats error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des résultats' },
      { status: 500 }
    )
  }
}
