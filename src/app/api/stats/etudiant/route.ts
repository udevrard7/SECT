import { NextRequest, NextResponse } from 'next/server'
import { db, withRetry } from '@/lib/db'
import { withAuth, type AuthenticatedUser } from '@/lib/auth-session'

async function _GET(request: NextRequest, context: { params: any; user: AuthenticatedUser }) {
  try {
    // Use authenticated user ID from session to prevent IDOR
    const userId = context.user.id

    const now = new Date()

    // ─── Phase 1: Fetch student info (needed for filiere/niveau filter) ───
    const student = await withRetry(() =>
      db.user.findUnique({
        where: { id: userId },
        select: { filiereId: true, niveau: true },
      })
    )

    if (!student) {
      return NextResponse.json({ error: 'Étudiant non trouvé' }, { status: 404 })
    }

    const studentFiliereId = student.filiereId || null
    const studentNiveau = student.niveau || null

    // Build filiere filter
    const filiereFilter = studentFiliereId
      ? {
          OR: [
            { filiereId: null },
            { filiereId: studentFiliereId },
          ],
        }
      : {}

    // ─── Phase 2: Run all queries in parallel (with retry for pgbouncer resilience) ───
    const [epreuvesAVenir, sessionsCompletees, , sessionEnCours] = await Promise.all([
      // Upcoming exams (filtered by filiere/niveau)
      withRetry(() =>
        db.epreuve.findMany({
          where: {
            deletedAt: null,
            statut: { in: ['PLANIFIEE', 'EN_COURS'] },
            dateFin: { gte: now },
            sessions: { none: { etudiantId: userId, statut: { in: ['SOUMISE', 'CORRIGEE', 'RETOURNEE'] } } },
            ...filiereFilter,
          },
          orderBy: { dateDebut: 'asc' },
          include: {
            enseignant: { select: { name: true } },
            questions: { select: { id: true, bareme: true } },
          },
        })
      ),

      // Completed sessions with scores
      withRetry(() =>
        db.sessionPassation.findMany({
          where: {
            etudiantId: userId,
            statut: { in: ['SOUMISE', 'CORRIGEE', 'RETOURNEE'] },
            score: { not: null },
          },
          include: {
            epreuve: {
              select: {
                id: true,
                titre: true,
                duree: true,
                enseignant: { select: { name: true } },
              },
            },
            resultat: true,
          },
          orderBy: { dateFin: 'desc' },
        })
      ),

      // Responses for performance by type - compute from detailParQuestion in resultats
      // (Reponse model doesn't have a question relation, so we use resultat detail instead)
      Promise.resolve(null),

      // In-progress session
      withRetry(() =>
        db.sessionPassation.findFirst({
          where: {
            etudiantId: userId,
            statut: 'EN_COURS',
          },
          include: {
            epreuve: { select: { id: true, titre: true, duree: true } },
          },
        })
      ),
    ])

    // ─── Process upcoming epreuves ───
    const epreuvesAVenirData = epreuvesAVenir
      .filter((ep) => {
        if (!studentNiveau) return true
        if (!ep.groupesCibles) return true
        try {
          const parsed = JSON.parse(ep.groupesCibles as string)
          if (Array.isArray(parsed)) return true
          if (parsed && typeof parsed === 'object' && 'niveau' in parsed) {
            return !parsed.niveau || parsed.niveau === studentNiveau
          }
          return true
        } catch {
          return true
        }
      })
      .map((ep) => {
        const contenuData = ep.contenu as Record<string, unknown> | null
        const contenuQuestions = contenuData && typeof contenuData === 'object' && Array.isArray(contenuData.questions)
          ? contenuData.questions as Array<Record<string, unknown>>
          : []
        const relationCount = ep.questions.length
        const contenuCount = contenuQuestions.length
        const questionCount = relationCount > 0 ? relationCount : contenuCount
        const totalPoints = relationCount > 0
          ? ep.questions.reduce((sum, q) => sum + q.bareme, 0)
          : contenuQuestions.reduce((sum, q) => sum + (typeof q.bareme === 'number' ? q.bareme : 1), 0)

        return {
          id: ep.id,
          titre: ep.titre,
          date: ep.dateDebut.toISOString(),
          dateFin: ep.dateFin.toISOString(),
          duree: ep.duree,
          enseignant: ep.enseignant.name,
          nbQuestions: questionCount,
          totalPoints,
        }
      })

    // ─── Process completed sessions ───
    // Normalize scores to /20 scale for meaningful averages across exams with different totals
    const normalizedScores = sessionsCompletees.map((s) => {
      const rawScore = s.score || 0
      const totalPossible = s.resultat?.totalPossible || 20
      return totalPossible > 0 ? (rawScore / totalPossible) * 20 : 0
    })
    const moyenne =
      normalizedScores.length > 0
        ? Math.round((normalizedScores.reduce((a, b) => a + b, 0) / normalizedScores.length) * 10) / 10
        : 0
    const meilleureNote =
      normalizedScores.length > 0 ? Math.round(Math.max(...normalizedScores) * 10) / 10 : 0

    const resultatsRecents = sessionsCompletees.slice(0, 5).map((s) => ({
      id: s.id,
      epreuveId: s.epreuveId,
      titre: s.epreuve.titre,
      enseignant: s.epreuve.enseignant.name,
      date: s.dateFin ? s.dateFin.toISOString() : s.createdAt.toISOString(),
      score: s.score,
      statut: s.statut,
      resultat: s.resultat
        ? {
            scoreFinal: s.resultat.scoreFinal,
            totalPossible: s.resultat.totalPossible,
            detailParQuestion: s.resultat.detailParQuestion
              ? JSON.parse(s.resultat.detailParQuestion)
              : null,
          }
        : null,
    }))

    const evolutionScores = sessionsCompletees
      .filter((s) => s.dateFin)
      .reverse()
      .map((s) => {
        const rawScore = s.score || 0
        const totalPossible = s.resultat?.totalPossible || 20
        const normalizedScore = totalPossible > 0 ? Math.round(((rawScore / totalPossible) * 20) * 10) / 10 : 0
        return {
          titre: s.epreuve.titre.length > 15 ? s.epreuve.titre.substring(0, 15) + '...' : s.epreuve.titre,
          score: normalizedScore,
          date: (s.dateFin as Date).toISOString().substring(0, 10),
        }
      })

    // ─── Performance by question type (computed from detailParQuestion in resultats) ───
    // Normalize each question score to /20 scale for meaningful cross-type comparison
    const perfByType: Record<string, { totalNormalized: number; count: number }> = {}
    sessionsCompletees.forEach((s) => {
      if (s.resultat?.detailParQuestion) {
        try {
          const details = JSON.parse(s.resultat.detailParQuestion) as Array<{ type?: string; score?: number; bareme?: number }>
          details.forEach((q) => {
            if (q.type) {
              if (!perfByType[q.type]) perfByType[q.type] = { totalNormalized: 0, count: 0 }
              const bareme = q.bareme || 1
              const normalizedScore = ((q.score || 0) / bareme) * 20
              perfByType[q.type].totalNormalized += normalizedScore
              perfByType[q.type].count += 1
            }
          })
        } catch {
          // ignore parse errors
        }
      }
    })

    const performanceParType = Object.entries(perfByType).map(([type, data]) => ({
      type,
      moyenne: data.count > 0 ? Math.round((data.totalNormalized / data.count) * 10) / 10 : 0,
      nbReponses: data.count,
    }))

    // ─── Gamification / Badges ───
    const badges: { id: string; dateObtention: string }[] = []
    const oldestCompletedSession = sessionsCompletees.length > 0 ? sessionsCompletees[sessionsCompletees.length - 1] : null

    if (oldestCompletedSession?.dateFin) {
      badges.push({
        id: 'first_test',
        dateObtention: oldestCompletedSession.dateFin.toISOString(),
      })
    }

    const goodScoreSession = sessionsCompletees.find(s => {
      const rawScore = s.score || 0
      const totalPossible = s.resultat?.totalPossible || 20
      const normalizedScore = totalPossible > 0 ? (rawScore / totalPossible) * 20 : 0
      return normalizedScore >= 12
    })
    if (goodScoreSession?.dateFin) {
      badges.push({
        id: 'good_score',
        dateObtention: goodScoreSession.dateFin.toISOString(),
      })
    }

    const highScoreSession = sessionsCompletees.find(s => {
      const rawScore = s.score || 0
      const totalPossible = s.resultat?.totalPossible || 20
      const normalizedScore = totalPossible > 0 ? (rawScore / totalPossible) * 20 : 0
      return normalizedScore >= 18
    })
    if (highScoreSession?.dateFin) {
      badges.push({
        id: 'high_score',
        dateObtention: highScoreSession.dateFin.toISOString(),
      })
    }

    const fastSession = sessionsCompletees.find(s => {
      if (s.dateDebut && s.dateFin && s.epreuve.duree) {
        const timeTakenMinutes = (s.dateFin.getTime() - s.dateDebut.getTime()) / (1000 * 60)
        return timeTakenMinutes < (s.epreuve.duree / 2)
      }
      return false
    })
    if (fastSession?.dateFin) {
      badges.push({
        id: 'fast_answer',
        dateObtention: fastSession.dateFin.toISOString(),
      })
    }

    return NextResponse.json({
      nbEpreuvesAVenir: epreuvesAVenir.length,
      nbEpreuvesTerminees: sessionsCompletees.length,
      moyenne,
      meilleureNote,
      epreuvesAVenir: epreuvesAVenirData,
      resultatsRecents,
      evolutionScores,
      performanceParType,
      sessionEnCours: sessionEnCours
        ? {
            id: sessionEnCours.id,
            epreuveId: sessionEnCours.epreuveId,
            epreuveTitre: sessionEnCours.epreuve.titre,
            dateDebut: sessionEnCours.dateDebut?.toISOString(),
          }
        : null,
      badges,
    })
  } catch (error) {
    console.error('Stats etudiant error:', error instanceof Error ? `${error.name}: ${error.message}` : String(error))
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des statistiques' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(_GET, ['ETUDIANT', 'RESPONSABLE', 'ADMIN'])
