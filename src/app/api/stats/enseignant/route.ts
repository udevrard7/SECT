import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'userId requis' }, { status: 400 })
    }

    // ─── Basic counts ───
    const [nbDocuments, nbQuestionsTotal, nbQuestionsValidees, nbEpreuves, nbEpreuvesActives] =
      await Promise.all([
        db.document.count({ where: { ownerId: userId } }),
        db.question.count({ where: { OR: [{ auteurId: userId }, { document: { ownerId: userId } }] } }),
        db.question.count({ where: { OR: [{ auteurId: userId }, { document: { ownerId: userId } }], validee: true } }),
        db.epreuve.count({ where: { enseignantId: userId } }),
        db.epreuve.count({ where: { enseignantId: userId, statut: 'EN_COURS' } }),
      ])

    // ─── Pending corrections: sessions SOUMISE that have QRC/TRS answers without score ───
    const sessionsSoumises = await db.sessionPassation.findMany({
      where: {
        epreuve: { enseignantId: userId },
        statut: 'SOUMISE',
      },
      include: {
        etudiant: { select: { id: true, name: true, email: true } },
        epreuve: { select: { id: true, titre: true } },
        reponses: {
          where: {
            question: { type: { in: ['QRC', 'TRS'] } },
            score: null,
          },
          include: {
            question: { select: { id: true, type: true, enonce: true } },
          },
        },
      },
    })

    const pendingCorrections = sessionsSoumises.flatMap((session) =>
      session.reponses.map((rep) => ({
        sessionId: session.id,
        etudiantNom: session.etudiant.name,
        etudiantEmail: session.etudiant.email,
        epreuveTitre: session.epreuve.titre,
        questionType: rep.question.type,
        questionPreview: rep.question.enonce.substring(0, 80) + (rep.question.enonce.length > 80 ? '...' : ''),
      }))
    )

    // ─── Recent epreuves ───
    const recentEpreuves = await db.epreuve.findMany({
      where: { enseignantId: userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        questions: { select: { id: true } },
        sessions: {
          select: { id: true, statut: true, score: true },
        },
      },
    })

    const recentEpreuvesData = recentEpreuves.map((ep) => {
      const scores = ep.sessions
        .filter((s) => s.score !== null)
        .map((s) => s.score as number)
      const tauxReussite =
        scores.length > 0
          ? Math.round((scores.filter((s) => s >= 10).length / scores.length) * 100)
          : 0

      return {
        id: ep.id,
        titre: ep.titre,
        date: ep.dateDebut.toISOString(),
        statut: ep.statut,
        nbParticipants: ep.sessions.length,
        tauxReussite,
      }
    })

    // ─── Questions by type ───
    const questionsByTypeRaw = await db.question.groupBy({
      by: ['type'],
      where: { OR: [{ auteurId: userId }, { document: { ownerId: userId } }] },
      _count: { type: true },
    })
    const questionsParType = questionsByTypeRaw.map((r) => ({
      type: r.type,
      count: r._count.type,
    }))

    // ─── Questions by difficulty ───
    const questionsByDiffRaw = await db.question.groupBy({
      by: ['difficulte'],
      where: { OR: [{ auteurId: userId }, { document: { ownerId: userId } }] },
      _count: { difficulte: true },
    })
    const questionsParDifficulte = questionsByDiffRaw.map((r) => ({
      difficulte: r.difficulte,
      count: r._count.difficulte,
    }))

    // ─── Epreuves par mois (last 6 months) ───
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    const epreuvesRecentes = await db.epreuve.findMany({
      where: {
        enseignantId: userId,
        createdAt: { gte: sixMonthsAgo },
      },
      select: { createdAt: true },
    })

    const epreuvesParMois: Record<string, number> = {}
    epreuvesRecentes.forEach((ep) => {
      const key = ep.createdAt.toISOString().substring(0, 7) // YYYY-MM
      epreuvesParMois[key] = (epreuvesParMois[key] || 0) + 1
    })

    // ─── Taux de réussite moyen ───
    const allSessions = await db.sessionPassation.findMany({
      where: {
        epreuve: { enseignantId: userId },
        statut: { in: ['SOUMISE', 'CORRIGEE'] },
        score: { not: null },
      },
      select: { score: true },
    })

    const allScores = allSessions.map((s) => s.score as number)
    const tauxReussiteMoyen =
      allScores.length > 0
        ? Math.round((allScores.filter((s) => s >= 10).length / allScores.length) * 100)
        : 0
    const moyenneGenerale =
      allScores.length > 0
        ? Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 10) / 10
        : 0

    // ─── Performance par épreuve (for charts) ───
    const epreuvesAvecScores = await db.epreuve.findMany({
      where: {
        enseignantId: userId,
        statut: { in: ['TERMINEE', 'CLOTUREE'] },
      },
      orderBy: { dateDebut: 'desc' },
      take: 10,
      include: {
        sessions: {
          where: { score: { not: null } },
          select: { score: true },
        },
      },
    })

    const performanceParEpreuve = epreuvesAvecScores.map((ep) => {
      const scores = ep.sessions.map((s) => s.score as number)
      const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
      const taux = scores.length > 0 ? Math.round((scores.filter((s) => s >= 10).length / scores.length) * 100) : 0
      return {
        titre: ep.titre.length > 20 ? ep.titre.substring(0, 20) + '...' : ep.titre,
        moyenne: Math.round(avg * 10) / 10,
        tauxReussite: taux,
        nbParticipants: scores.length,
      }
    })

    return NextResponse.json({
      nbDocuments,
      nbQuestionsTotal,
      nbQuestionsValidees,
      nbEpreuves,
      nbEpreuvesActives,
      nbCorrectionsEnAttente: pendingCorrections.length,
      pendingCorrections,
      recentEpreuves: recentEpreuvesData,
      questionsParType,
      questionsParDifficulte,
      epreuvesParMois,
      tauxReussiteMoyen,
      moyenneGenerale,
      performanceParEpreuve,
    })
  } catch (error) {
    console.error('Stats enseignant error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des statistiques' },
      { status: 500 }
    )
  }
}
