import { NextRequest, NextResponse } from '''next/server'''
import { db } from '''@/lib/db'''

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('''userId''')

    if (!userId) {
      return NextResponse.json({ error: '''userId requis''' }, { status: 400 })
    }

    // ─── Upcoming exams ───
    const now = new Date()
    const epreuvesAVenir = await db.epreuve.findMany({
      where: {
        statut: { in: ['''PLANIFIEE''', '''EN_COURS'''] },
        dateFin: { gte: now },
        sessions: { none: { etudiantId: userId, statut: { in: ['''SOUMISE''', '''CORRIGEE'''] } } },
      },
      orderBy: { dateDebut: '''asc''' },
      include: {
        enseignant: { select: { name: true } },
        questions: { select: { id: true, bareme: true } },
      },
    })

    const epreuvesAVenirData = epreuvesAVenir.map((ep) => ({
      id: ep.id,
      titre: ep.titre,
      date: ep.dateDebut.toISOString(),
      duree: ep.duree,
      enseignant: ep.enseignant.name,
      nbQuestions: ep.questions.length,
      totalPoints: ep.questions.reduce((sum, q) => sum + q.bareme, 0),
    }))

    // ─── Completed sessions with scores ───
    const sessionsCompletees = await db.sessionPassation.findMany({
      where: {
        etudiantId: userId,
        statut: { in: ['''SOUMISE''', '''CORRIGEE'''] },
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
      orderBy: { dateFin: '''desc''' },
    })

    const allScores = sessionsCompletees.map((s) => s.score as number)
    const moyenne =
      allScores.length > 0
        ? Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 10) / 10
        : 0
    const meilleureNote =
      allScores.length > 0 ? Math.max(...allScores) : 0

    // ─── Recent results ───
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
            detailParQuestion: s.resultat.detailParQuestion
              ? JSON.parse(s.resultat.detailParQuestion)
              : null,
          }
        : null,
    }))

    // ─── Score evolution ───
    const evolutionScores = sessionsCompletees
      .filter((s) => s.dateFin)
      .reverse()
      .map((s) => ({
        titre: s.epreuve.titre.length > 15 ? s.epreuve.titre.substring(0, 15) + '''...''' : s.epreuve.titre,
        score: s.score,
        date: (s.dateFin as Date).toISOString().substring(0, 10),
      }))

    // ─── Performance by question type ───
    const reponses = await db.reponse.findMany({
      where: {
        session: { etudiantId: userId },
        score: { not: null },
      },
      include: {
        question: {
          select: { type: true, enonce: true },
        },
      },
    })

    const perfByType: Record<string, { total: number; count: number; maxPossible: number }> = {}
    reponses.forEach((r) => {
      const type = r.question.type
      if (!perfByType[type]) perfByType[type] = { total: 0, count: 0, maxPossible: 0 }
      perfByType[type].total += r.score || 0
      perfByType[type].count += 1
    })

    const performanceParType = Object.entries(perfByType).map(([type, data]) => ({
      type,
      moyenne: data.count > 0 ? Math.round((data.total / data.count) * 10) / 10 : 0,
      nbReponses: data.count,
    }))

    // ─── In-progress session ───
    const sessionEnCours = await db.sessionPassation.findFirst({
      where: {
        etudiantId: userId,
        statut: '''EN_COURS''',
      },
      include: {
        epreuve: { select: { id: true, titre: true, duree: true } },
      },
    })

    // --- NEW: Gamification / Badges Logic ---
    const badges: { id: string, dateObtention: string }[] = [];
    const oldestCompletedSession = sessionsCompletees.length > 0 ? sessionsCompletees[sessionsCompletees.length - 1] : null;

    if (oldestCompletedSession) {
        badges.push({
            id: '''first_test''',
            dateObtention: oldestCompletedSession.dateFin!.toISOString(),
        });
    }

    const goodScoreSession = sessionsCompletees.find(s => s.score && s.score >= 12);
    if (goodScoreSession) {
         badges.push({
            id: '''good_score''',
            dateObtention: goodScoreSession.dateFin!.toISOString(),
        });
    }

    const highScoreSession = sessionsCompletees.find(s => s.score && s.score >= 18);
    if (highScoreSession) {
         badges.push({
            id: '''high_score''',
            dateObtention: highScoreSession.dateFin!.toISOString(),
        });
    }

    const fastSession = sessionsCompletees.find(s => {
        if (s.dateDebut && s.dateFin && s.epreuve.duree) {
            const timeTakenMinutes = (s.dateFin.getTime() - s.dateDebut.getTime()) / (1000 * 60);
            return timeTakenMinutes < (s.epreuve.duree / 2);
        }
        return false;
    });
    if (fastSession) {
        badges.push({
            id: '''fast_answer''',
            dateObtention: fastSession.dateFin!.toISOString(),
        });
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
      badges, // <-- Added badges to the response
    })
  } catch (error) {
    console.error('''Stats etudiant error:''', error)
    return NextResponse.json(
      { error: '''Erreur lors de la récupération des statistiques''' },
      { status: 500 }
    )
  }
}
