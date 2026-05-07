import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const filiereId = searchParams.get('filiereId') || ''
    const filiereNom = searchParams.get('filiere') || ''
    const responsableId = searchParams.get('responsableId') || ''

    // ─── Resolve filiere IDs ───
    // A responsable can manage multiple filieres via Filiere.responsableId
    let resolvedFiliereIds: string[] = []

    if (filiereId) {
      // Specific filiereId provided — verify it exists
      const filiere = await db.filiere.findUnique({
        where: { id: filiereId },
        select: { id: true },
      })
      if (filiere) {
        resolvedFiliereIds = [filiereId]
      }
      // If filiere doesn't exist, treat as no data (empty)
    } else if (filiereNom) {
      // Resolve from filiere name
      const found = await db.filiere.findFirst({
        where: { nom: filiereNom },
        select: { id: true },
      })
      if (found) {
        resolvedFiliereIds = [found.id]
      }
    }

    // If responsableId is provided, find all filieres managed by this responsable
    if (responsableId) {
      const filieresDuResponsable = await db.filiere.findMany({
        where: { responsableId },
        select: { id: true },
      })
      const responsableFiliereIds = filieresDuResponsable.map((f) => f.id)

      if (resolvedFiliereIds.length > 0) {
        // Intersection: only keep filiereIds that belong to this responsable
        resolvedFiliereIds = resolvedFiliereIds.filter((id) =>
          responsableFiliereIds.includes(id)
        )
      } else {
        // No specific filiereId — use all of the responsable's filieres
        resolvedFiliereIds = responsableFiliereIds
      }
    }

    const hasFiliereFilter = resolvedFiliereIds.length > 0

    // ─── Basic counts ───
    const whereEtudiant: Record<string, unknown> = { role: 'ETUDIANT' }
    if (hasFiliereFilter) whereEtudiant.filiereId = { in: resolvedFiliereIds }

    const whereEnseignant: Record<string, unknown> = { role: 'ENSEIGNANT' }
    // Get enseignants assigned to these filieres
    if (hasFiliereFilter) {
      const assignedEnseignantIds = await db.enseignantFiliere.findMany({
        where: { filiereId: { in: resolvedFiliereIds } },
        select: { enseignantId: true },
      })
      const enseignantIdList = [...new Set(assignedEnseignantIds.map((a) => a.enseignantId))]
      whereEnseignant.id = { in: enseignantIdList }
    }

    const [nbEtudiants, nbEnseignants, nbEvaluations] = await Promise.all([
      db.user.count({ where: whereEtudiant }),
      db.user.count({ where: whereEnseignant }),
      db.epreuve.count({
        where: hasFiliereFilter
          ? { sessions: { some: { etudiant: { filiereId: { in: resolvedFiliereIds } } } } }
          : {},
      }),
    ])

    // ─── Global scores ───
    const sessionsWhere: Record<string, unknown> = {
      statut: { in: ['SOUMISE', 'CORRIGEE'] },
      score: { not: null },
    }
    if (hasFiliereFilter) {
      sessionsWhere.etudiant = { filiereId: { in: resolvedFiliereIds } }
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
        ...(hasFiliereFilter
          ? { sessions: { some: { etudiant: { filiereId: { in: resolvedFiliereIds } } } } }
          : {}),
      },
      orderBy: { dateDebut: 'desc' },
      take: 10,
      include: {
        enseignant: { select: { name: true } },
        sessions: {
          where: {
            score: { not: null },
            ...(hasFiliereFilter ? { etudiant: { filiereId: { in: resolvedFiliereIds } } } : {}),
          },
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
    // Filter by resolved filiere IDs when available
    const etudiantsParFiliereRaw = await db.user.groupBy({
      by: ['filiereId'],
      where: {
        role: 'ETUDIANT',
        filiereId: { not: null },
        ...(hasFiliereFilter ? { filiereId: { in: resolvedFiliereIds } } : {}),
      },
      _count: { filiereId: true },
    })

    // Resolve filiere names
    const filiereIds = etudiantsParFiliereRaw
      .map((r) => r.filiereId)
      .filter((id): id is string => id !== null)

    const filiereNames = await db.filiere.findMany({
      where: { id: { in: filiereIds } },
      select: { id: true, nom: true },
    })

    const filiereNameMap = Object.fromEntries(
      filiereNames.map((f) => [f.id, f.nom])
    )

    const etudiantsParFiliere = etudiantsParFiliereRaw
      .filter((r) => r.filiereId !== null)
      .map((r) => ({
        filiere: filiereNameMap[r.filiereId!] || 'Non défini',
        count: r._count.filiereId,
      }))

    // ─── Monthly score trend ───
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const sessionsRecentes = await db.sessionPassation.findMany({
      where: {
        statut: { in: ['SOUMISE', 'CORRIGEE'] },
        score: { not: null },
        dateFin: { not: null, gte: sixMonthsAgo },
        ...(hasFiliereFilter ? { etudiant: { filiereId: { in: resolvedFiliereIds } } } : {}),
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
    // Filter by enseignants assigned to the responsable's filieres
    const topEnseignantsWhere: Record<string, unknown> = { role: 'ENSEIGNANT' }
    if (hasFiliereFilter) {
      const assignedIds = await db.enseignantFiliere.findMany({
        where: { filiereId: { in: resolvedFiliereIds } },
        select: { enseignantId: true },
      })
      const uniqueIds = [...new Set(assignedIds.map((a) => a.enseignantId))]
      topEnseignantsWhere.id = { in: uniqueIds }
    }

    const enseignants = await db.user.findMany({
      where: topEnseignantsWhere,
      select: {
        id: true,
        name: true,
        epreuves: {
          where: hasFiliereFilter
            ? {
                sessions: {
                  some: { etudiant: { filiereId: { in: resolvedFiliereIds } } },
                },
              }
            : {},
          include: {
            sessions: {
              where: {
                score: { not: null },
                ...(hasFiliereFilter
                  ? { etudiant: { filiereId: { in: resolvedFiliereIds } } }
                  : {}),
              },
              select: { score: true },
            },
          },
        },
      },
    })

    const topEnseignants = enseignants
      .map((ens) => {
        const ensScores = ens.epreuves.flatMap((ep) =>
          ep.sessions.map((s) => s.score as number)
        )
        const avg = ensScores.length > 0 ? ensScores.reduce((a, b) => a + b, 0) / ensScores.length : 0
        const taux = ensScores.length > 0
          ? Math.round((ensScores.filter((s) => s >= 10).length / ensScores.length) * 100)
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

    // Pending corrections — filter by filiere
    const correctionsEnAttente = await db.sessionPassation.count({
      where: {
        statut: 'SOUMISE',
        ...(hasFiliereFilter ? { etudiant: { filiereId: { in: resolvedFiliereIds } } } : {}),
      },
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
