import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const filiereId = searchParams.get('filiereId') || ''
    const filiereNom = searchParams.get('filiere') || ''
    const responsableId = searchParams.get('responsableId') || ''
    const dateDebutParam = searchParams.get('dateDebut') || ''
    const dateFinParam = searchParams.get('dateFin') || ''

    // Parse date filters
    const dateDebut = dateDebutParam ? new Date(dateDebutParam) : null
    const dateFin = dateFinParam ? new Date(dateFinParam) : null
    if (dateFin) {
      // Set to end of day
      dateFin.setHours(23, 59, 59, 999)
    }

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
        where: {
          ...(hasFiliereFilter
            ? { sessions: { some: { etudiant: { filiereId: { in: resolvedFiliereIds } } } } }
            : {}),
          ...(dateDebut ? { dateDebut: { gte: dateDebut } } : {}),
          ...(dateFin ? { dateFin: { lte: dateFin } } : {}),
        },
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
    if (dateDebut || dateFin) {
      const epreuveFilter: Record<string, unknown> = {}
      if (dateDebut) epreuveFilter.dateDebut = { gte: dateDebut }
      if (dateFin) epreuveFilter.dateFin = { lte: dateFin }
      sessionsWhere.epreuve = epreuveFilter
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
        ...(dateDebut ? { dateDebut: { gte: dateDebut } } : {}),
        ...(dateFin ? { dateFin: { lte: dateFin } } : {}),
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
        dateFin: { not: null, gte: dateDebut || sixMonthsAgo, ...(dateFin ? { lte: dateFin } : {}) },
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

    // Pending corrections — filter by filiere and date
    const correctionsEnAttente = await db.sessionPassation.count({
      where: {
        statut: 'SOUMISE',
        ...(hasFiliereFilter ? { etudiant: { filiereId: { in: resolvedFiliereIds } } } : {}),
        ...(dateDebut || dateFin ? { epreuve: { ...(dateDebut ? { dateDebut: { gte: dateDebut } } : {}), ...(dateFin ? { dateFin: { lte: dateFin } } : {}) } } : {}),
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

    // ─── UE & Affectation metrics ───
    const ueWhere: Record<string, unknown> = { actif: true }
    if (hasFiliereFilter) ueWhere.filiereId = { in: resolvedFiliereIds }

    const [nbUnitesEnseignement, allUEs] = await Promise.all([
      db.uniteEnseignement.count({ where: ueWhere }),
      db.uniteEnseignement.findMany({
        where: ueWhere,
        select: {
          id: true,
          niveau: true,
          filiereId: true,
          filiere: { select: { id: true, nom: true } },
          _count: { select: { affectations: true } },
        },
      }),
    ])

    const affectationWhere: Record<string, unknown> = {}
    if (hasFiliereFilter) {
      affectationWhere.uniteEnseignement = { filiereId: { in: resolvedFiliereIds } }
    }

    const [nbAffectations, nbAffectationsValidees, allAffectations] = await Promise.all([
      db.affectation.count({ where: affectationWhere }),
      db.affectation.count({
        where: {
          ...affectationWhere,
          statut: { in: ['VALIDEE', 'PUBLIEE'] },
        },
      }),
      db.affectation.findMany({
        where: affectationWhere,
        select: {
          enseignantId: true,
          uniteEnseignementId: true,
          volumeHeures: true,
          statut: true,
          enseignant: { select: { id: true, name: true } },
          uniteEnseignement: {
            select: {
              id: true,
              niveau: true,
              filiereId: true,
              filiere: { select: { id: true, nom: true } },
            },
          },
        },
      }),
    ])

    // tauxCouvertureAffectations: % of UEs with at least one affectation
    const uesWithAffectation = allUEs.filter((ue) => ue._count.affectations > 0).length
    const tauxCouvertureAffectations = allUEs.length > 0
      ? Math.round((uesWithAffectation / allUEs.length) * 100)
      : 0

    // chargeEnseignants: teacher workload
    const enseignantChargeMap = new Map<string, { enseignantNom: string; totalHeures: number; ueIds: Set<string>; statuts: Set<string> }>()
    allAffectations.forEach((aff) => {
      const existing = enseignantChargeMap.get(aff.enseignantId)
      if (existing) {
        existing.totalHeures += aff.volumeHeures
        existing.ueIds.add(aff.uniteEnseignementId)
        existing.statuts.add(aff.statut)
      } else {
        enseignantChargeMap.set(aff.enseignantId, {
          enseignantNom: aff.enseignant.name,
          totalHeures: aff.volumeHeures,
          ueIds: new Set([aff.uniteEnseignementId]),
          statuts: new Set([aff.statut]),
        })
      }
    })

    const chargeEnseignants = Array.from(enseignantChargeMap.entries()).map(
      ([enseignantId, data]) => ({
        enseignantId,
        enseignantNom: data.enseignantNom,
        totalHeures: Math.round(data.totalHeures * 10) / 10,
        nbUEs: data.ueIds.size,
        statut: data.statuts.has('PUBLIEE')
          ? 'PUBLIEE'
          : data.statuts.has('VALIDEE')
            ? 'VALIDEE'
            : 'PROVISOIRE',
      })
    ).sort((a, b) => b.totalHeures - a.totalHeures)

    // affectationsParNiveau: coverage by level
    const niveauData = new Map<string, { nbUEs: number; ueWithAffectation: number; nbAffectations: number }>()
    allUEs.forEach((ue) => {
      const niv = ue.niveau || 'NON_DEFINI'
      const existing = niveauData.get(niv)
      if (existing) {
        existing.nbUEs += 1
        if (ue._count.affectations > 0) existing.ueWithAffectation += 1
      } else {
        niveauData.set(niv, {
          nbUEs: 1,
          ueWithAffectation: ue._count.affectations > 0 ? 1 : 0,
          nbAffectations: 0,
        })
      }
    })
    allAffectations.forEach((aff) => {
      const niv = aff.uniteEnseignement.niveau || 'NON_DEFINI'
      const existing = niveauData.get(niv)
      if (existing) existing.nbAffectations += 1
    })

    const affectationsParNiveau = Array.from(niveauData.entries()).map(
      ([niveau, data]) => ({
        niveau,
        nbUEs: data.nbUEs,
        nbAffectations: data.nbAffectations,
        tauxCouverture: data.nbUEs > 0
          ? Math.round((data.ueWithAffectation / data.nbUEs) * 100)
          : 0,
      })
    )

    // affectationsParFiliere: coverage by filiere
    const filiereData = new Map<string, { filiereNom: string; nbUEs: number; ueWithAffectation: number; nbAffectations: number }>()
    allUEs.forEach((ue) => {
      const fId = ue.filiereId
      const existing = filiereData.get(fId)
      if (existing) {
        existing.nbUEs += 1
        if (ue._count.affectations > 0) existing.ueWithAffectation += 1
      } else {
        filiereData.set(fId, {
          filiereNom: ue.filiere.nom,
          nbUEs: 1,
          ueWithAffectation: ue._count.affectations > 0 ? 1 : 0,
          nbAffectations: 0,
        })
      }
    })
    allAffectations.forEach((aff) => {
      const fId = aff.uniteEnseignement.filiereId
      const existing = filiereData.get(fId)
      if (existing) existing.nbAffectations += 1
    })

    const affectationsParFiliere = Array.from(filiereData.entries()).map(
      ([filiereId, data]) => ({
        filiereId,
        filiereNom: data.filiereNom,
        nbUEs: data.nbUEs,
        nbAffectations: data.nbAffectations,
        tauxCouverture: data.nbUEs > 0
          ? Math.round((data.ueWithAffectation / data.nbUEs) * 100)
          : 0,
      })
    )

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
      nbUnitesEnseignement,
      nbAffectations,
      nbAffectationsValidees,
      tauxCouvertureAffectations,
      chargeEnseignants,
      affectationsParNiveau,
      affectationsParFiliere,
    })
  } catch (error) {
    console.error('Stats responsable error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des statistiques' },
      { status: 500 }
    )
  }
}
