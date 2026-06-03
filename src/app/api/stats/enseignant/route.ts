
import { NextRequest, NextResponse } from '''next/server'''
import { db } from '''@/lib/db'''

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('''userId''')

    if (!userId) {
      return NextResponse.json({ error: '''userId requis''' }, { status: 400 })
    }

    // ─── Basic counts ───
    const [nbDocuments, nbQuestionsTotal, nbEpreuves] =
      await Promise.all([
        db.document.count({ where: { ownerId: userId } }),
        db.question.count({ where: { OR: [{ auteurId: userId }, { document: { ownerId: userId } }] } }),
        db.epreuve.count({ where: { enseignantId: userId } }),
      ])

    // ─── Pending corrections with submission date ───
    const sessionsSoumises = await db.sessionPassation.findMany({
      where: {
        epreuve: { enseignantId: userId },
        statut: '''SOUMISE''',
      },
      include: {
        etudiant: { select: { id: true, name: true, email: true } },
        epreuve: { select: { id: true, titre: true } },
      },
      orderBy: { dateFin: '''desc''' },
    })

    const pendingCorrections = sessionsSoumises.map((session) => ({
      sessionId: session.id,
      etudiantNom: session.etudiant.name,
      etudiantEmail: session.etudiant.email,
      epreuveTitre: session.epreuve.titre,
      questionType: '''QRC''', // Placeholder, as we don't have this direct info without a deeper query
      questionPreview: '''Réponse ouverte en attente''',
      submittedAt: session.dateFin!.toISOString(), // Added submission date
    }))

    // ─── Recent epreuves with average score ───
    const recentEpreuvesRaw = await db.epreuve.findMany({
      where: { enseignantId: userId },
      orderBy: { createdAt: '''desc''' },
      take: 5,
      include: {
        sessions: {
          select: { score: true },
        },
      },
    })

    const recentEpreuves = recentEpreuvesRaw.map((ep) => {
      const scores = ep.sessions.filter(s => s.score !== null).map(s => s.score as number);
      const moyenne =
        scores.length > 0
          ? scores.reduce((a, b) => a + b, 0) / scores.length
          : 0;
      return {
        id: ep.id,
        titre: ep.titre,
        date: ep.dateDebut.toISOString(),
        statut: ep.statut,
        nbParticipants: ep.sessions.length,
        moyenne: parseFloat(moyenne.toFixed(1)), // Added average score
      }
    })

    // ─── Performance par épreuve (for charts) ───
    const epreuvesTerminees = await db.epreuve.findMany({
      where: {
        enseignantId: userId,
        statut: { in: ['''TERMINEE''', '''CLOTUREE'''] },
        sessions: { some: {} },
      },
      orderBy: { dateDebut: '''desc''' },
      take: 7,
      include: {
        sessions: {
          where: { score: { not: null } },
          select: { score: true },
        },
      },
    })

    const performanceParEpreuve = epreuvesTerminees.map((ep) => {
      const scores = ep.sessions.map((s) => s.score as number)
      const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
      const taux = scores.length > 0 ? (scores.filter((s) => s >= 10).length / scores.length) * 100 : 0;
      return {
        titre: ep.titre.length > 15 ? ep.titre.substring(0, 15) + '''...''' : ep.titre,
        moyenne: parseFloat(avg.toFixed(1)),
        tauxReussite: parseFloat(taux.toFixed(1)),
      }
    })

    return NextResponse.json({
      nbDocuments,
      nbQuestionsTotal,
      nbEpreuves,
      nbCorrectionsEnAttente: pendingCorrections.length,
      pendingCorrections,
      recentEpreuves,
      performanceParEpreuve,
    })
  } catch (error) {
    console.error('''Stats enseignant error:''', error)
    return NextResponse.json(
      { error: '''Erreur lors de la récupération des statistiques''' },
      { status: 500 }
    )
  }
}
