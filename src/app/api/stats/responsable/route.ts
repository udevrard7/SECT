import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const filiere = searchParams.get('filiere')

    // ─── Basic counts ───
    const whereEtudiant: Record<string, unknown> = { role: 'ETUDIANT' }
    if (filiere) whereEtudiant.filiere = filiere

    const [nbEtudiants, nbEnseignants, nbEvaluations] = await Promise.all([
      db.user.count({ where: whereEtudiant }),
      db.user.count({ where: { role: 'ENSEIGNANT' } }),
      db.epreuve.count({
        where: filiere
          ? { sessions: { some: { etudiant: { filiere } } } }
          : {},
      }),
    ])

    // ─── Global scores ───
    const sessionsWhere: Record<string, unknown> = {
      statut: { in: ['SOUMISE', 'CORRIGEE'] },
      score: { not: null },
    }
    if (filiere) {
      sessionsWhere.etudiant = { filiere }
    }

    const allSessions = await db.sessionPassation.findMany({
      where: sessionsWhere,
      select: { score: true, epreuveId: true },
    })

    const allScores = allSessions.map((s) => s.score as number)
    const moyenneGenerale =
      allScores.length > 0
        ? Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 10) / 10
        : 0
    const tauxReussiteGlobal =
      allScores.length > 0
        ? Math.round((allScores.filter((s) => s >= 10).length / allScores.length) * 100)
        : 0

    // ─── Score distribution ───
    const repartitionNotes = [
      { label: '0-4', count: allScores.filter((s) => s < 4).length },
      { label: '4-8', count: allScores.filter((s) => s >= 4 && s < 8).length },
      { label: '8-10', count: allScores.filter((s) => s >= 8 && s < 10).length },
      { label: '10-12', count: allScores.filter((s) => s >= 10 && s < 12).length },
      { label: '12-14', count: allScores.filter((s) => s >= 12 && s < 14).length },
      { label: '14-16', count: allScores.filter((s) => s >= 14 && s < 16).length },
      { label: '16-20', count: allScores.filter((s) => s >= 16).length },
    ]

    // ─── Results per subject (epreuve) ───
    const epreuvesAvecResultats = await db.epreuve.findMany({
      where: {
        statut: { in: ['TERMINEE', 'CLOTUREE'] },
        ...(filiere ? { sessions: { some: { etudiant: { filiere } } } } : {}),
      },
      orderBy: { dateDebut: 'desc' },
      take: 10,
      include: {
        enseignant: { select: { name: true } },
        sessions: {
          where: { score: { not: null }, ...(filiere ? { etudiant: { filiere } } : {}) },
          select: { score: true },
        },
      },
    })

    const resultatsParMatiere = epreuvesAvecResultats.map((ep) => {
      const scores = ep.sessions.map((s) => s.score as number)
      const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
      const taux = scores.length > 0 ? Math.round((scores.filter((s) => s >= 10).length / scores.length) * 100) : 0
      return {
        titre: ep.titre.length > 25 ? ep.titre.substring(0, 25) + '...' : ep.titre,
        enseignant: ep.enseignant.name,
        moyenne: Math.round(avg * 10) / 10,
        tauxReussite: taux,
        nbParticipants: scores.length,
      }
    })

    // ─── Students per filiere ───
    const etudiantsParFiliereRaw = await db.user.groupBy({
      by: ['filiere'],
      where: { role: 'ETUDIANT' },
      _count: { filiere: true },
    })
    const etudiantsParFiliere = etudiantsParFiliereRaw
      .filter((r) => r.filiere !== null)
      .map((r) => ({
        filiere: r.filiere || 'Non défini',
        count: r._count.filiere,
      }))

    // ─── Monthly score trend ───
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const sessionsRecentes = await db.sessionPassation.findMany({
      where: {
        statut: { in: ['SOUMISE', 'CORRIGEE'] },
        score: { not: null },
        dateFin: { not: null, gte: sixMonthsAgo },
        ...(filiere ? { etudiant: { filiere } } : {}),
      },
      select: { score: true, dateFin: true },
    })

    const monthlyScores: Record<string, number[]> = {}
    sessionsRecentes.forEach((s) => {
      if (s.dateFin) {
        const key = s.dateFin.toISOString().substring(0, 7)
        if (!monthlyScores[key]) monthlyScores[key] = []
        monthlyScores[key].push(s.score as number)
      }
    })

    const evolutionMoyennes = Object.entries(monthlyScores)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mois, scores]) => ({
        mois,
        moyenne: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
        nbEvaluations: scores.length,
      }))

    // ─── Top teachers ───
    const enseignants = await db.user.findMany({
      where: { role: 'ENSEIGNANT' },
      select: {
        id: true,
        name: true,
        epreuves: {
          include: {
            sessions: {
              where: { score: { not: null } },
              select: { score: true },
            },
          },
        },
      },
    })

    const topEnseignants = enseignants
      .map((ens) => {
        const allScores = ens.epreuves.flatMap((ep) =>
          ep.sessions.map((s) => s.score as number)
        )
        const avg = allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 0
        const taux = allScores.length > 0
          ? Math.round((allScores.filter((s) => s >= 10).length / allScores.length) * 100)
          : 0
        return {
          nom: ens.name,
          nbEpreuves: ens.epreuves.length,
          moyenne: Math.round(avg * 10) / 10,
          tauxReussite: taux,
        }
      })
      .filter((e) => e.nbEpreuves > 0)
      .sort((a, b) => b.tauxReussite - a.tauxReussite)
      .slice(0, 5)

    // ─── Alerts ───
    const alertes: Array<{ type: string; titre: string; description: string; severity: string }> = []

    // High failure rate subjects
    epreuvesAvecResultats.forEach((ep) => {
      const scores = ep.sessions.map((s) => s.score as number)
      if (scores.length >= 3) {
        const tauxEchec = 100 - Math.round((scores.filter((s) => s >= 10).length / scores.length) * 100)
        if (tauxEchec >= 50) {
          alertes.push({
            type: 'taux_echec',
            titre: `Taux d'échec élevé — ${ep.titre}`,
            description: `${tauxEchec}% d'échec sur ${scores.length} copies. Enseignant : ${ep.enseignant.name}`,
            severity: 'critical',
          })
        } else if (tauxEchec >= 35) {
          alertes.push({
            type: 'taux_echec',
            titre: `Échec significatif — ${ep.titre}`,
            description: `${tauxEchec}% d'échec sur ${scores.length} copies`,
            severity: 'warning',
          })
        }
      }
    })

    // Pending corrections
    const correctionsEnAttente = await db.sessionPassation.count({
      where: { statut: 'SOUMISE' },
    })
    if (correctionsEnAttente > 0) {
      alertes.push({
        type: 'corrections',
        titre: `${correctionsEnAttente} copie(s) en attente de correction`,
        description: 'Des épreuves ont été soumises mais ne sont pas encore corrigées',
        severity: 'info',
      })
    }

    return NextResponse.json({
      nbEtudiants,
      nbEnseignants,
      nbEvaluations,
      tauxReussiteGlobal,
      moyenneGenerale,
      repartitionNotes,
      resultatsParMatiere,
      etudiantsParFiliere,
      evolutionMoyennes,
      topEnseignants,
      alertes,
    })
  } catch (error) {
    console.error('Stats responsable error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des statistiques' },
      { status: 500 }
    )
  }
}
