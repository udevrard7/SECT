import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth, type AuthenticatedUser } from '@/lib/auth-session'

// ─── Types ───

interface RepartitionNote {
  label: string
  count: number
}

interface ResultatParMatiere {
  titre: string
  enseignant: string
  moyenne: number
  tauxReussite: number
  nbParticipants: number
}

interface EtudiantParFiliere {
  filiere: string
  count: number
}

interface EvolutionMoyenne {
  mois: string
  moyenne: number
  nbEvaluations: number
}

interface TopEnseignant {
  nom: string
  nbEpreuves: number
  moyenne: number
  tauxReussite: number
}

interface AlerteStat {
  type: string
  titre: string
  description: string
  severity: string
}

interface TopEtudiant {
  id: string
  nom: string
  email: string
  moyenne: number
  filiere: string
}

interface StatsResponse {
  nbEtudiants: number
  nbEnseignants: number
  nbEvaluations: number
  tauxReussiteGlobal: number
  moyenneGenerale: number
  repartitionNotes: RepartitionNote[]
  resultatsParMatiere: ResultatParMatiere[]
  etudiantsParFiliere: EtudiantParFiliere[]
  evolutionMoyennes: EvolutionMoyenne[]
  topEnseignants: TopEnseignant[]
  alertes: AlerteStat[]
  topEtudiants: TopEtudiant[]
  etudiantsEnDifficulte: TopEtudiant[]
}

// ─── Helper: Build date filter ───

function buildDateFilter(dateDebut?: string | null, dateFin?: string | null) {
  const filter: { gte?: Date; lte?: Date } = {}
  if (dateDebut) filter.gte = new Date(dateDebut)
  if (dateFin) {
    // Include the full end day
    const end = new Date(dateFin)
    end.setHours(23, 59, 59, 999)
    filter.lte = end
  }
  return Object.keys(filter).length > 0 ? filter : undefined
}

// ─── Helper: Classify score into bucket ───

function getNoteBucket(score: number): string {
  if (score < 4) return '0-4'
  if (score < 8) return '4-8'
  if (score < 10) return '8-10'
  if (score < 12) return '10-12'
  if (score < 14) return '12-14'
  if (score < 16) return '14-16'
  return '16-20'
}

const NOTE_BUCKETS = ['0-4', '4-8', '8-10', '10-12', '12-14', '14-16', '16-20']

// ─── Main handler ───

async function _GET(request: NextRequest, context: { params: any; user: AuthenticatedUser }) {
  try {
    const { searchParams } = new URL(request.url)
    const filiereId = searchParams.get('filiereId')
    const dateDebut = searchParams.get('dateDebut')
    const dateFin = searchParams.get('dateFin')

    const userEtabId = context.user.etablissementId
    if (!userEtabId) {
      return NextResponse.json({ error: 'Aucun établissement associé à votre compte.' }, { status: 400 })
    }

    const dateFilter = buildDateFilter(dateDebut || null, dateFin || null)

    // ─── 1. Resolve filière IDs ───
    let filiereIds: string[] = []
    if (filiereId && filiereId !== 'all') {
      // Verify the filiere belongs to the user's establishment
      const f = await db.filiere.findFirst({
        where: { id: filiereId, etablissementId: userEtabId },
        select: { id: true }
      })
      if (f) filiereIds = [f.id]
    } else {
      const filieres = await db.filiere.findMany({
        where: { etablissementId: userEtabId },
        select: { id: true }
      })
      filiereIds = filieres.map(f => f.id)
    }

    if (filiereIds.length === 0) {
      // No filières → return empty but valid structure
      return NextResponse.json(emptyStats())
    }

    // ─── 2. Get enseignant IDs in those filières ───
    // Enseignants are linked via filiereId OR via EnseignantFiliere
    const enseignantParFiliere = await db.user.findMany({
      where: {
        role: 'ENSEIGNANT',
        actif: true,
        OR: [
          { filiereId: { in: filiereIds } },
          { enseignantFilieres: { some: { filiereId: { in: filiereIds } } } }
        ]
      },
      select: { id: true, name: true }
    })
    const enseignantIds = enseignantParFiliere.map(e => e.id)
    const enseignantNames = new Map(enseignantParFiliere.map(e => [e.id, e.name || '']))

    // ─── 3. Get epreuves by those enseignants ───
    const epreuveFilter: any = {
      enseignantId: { in: enseignantIds },
      deletedAt: null,
    }
    if (filiereIds.length > 0) {
      epreuveFilter.filiereId = { in: filiereIds }
    }
    if (dateFilter) {
      epreuveFilter.dateDebut = dateFilter
    }

    const epreuves = await db.epreuve.findMany({
      where: epreuveFilter,
      select: {
        id: true,
        titre: true,
        enseignantId: true,
        noteTotal: true,
        statut: true,
        sessions: {
          where: {
            score: { not: null },
            ...(dateFilter ? { createdAt: dateFilter } : {}),
          },
          select: {
            id: true,
            etudiantId: true,
            score: true,
            epreuve: {
              select: { noteTotal: true }
            }
          }
        }
      }
    })

    // ─── 4. Compute global stats ───
    const allSessions = epreuves.flatMap(e => e.sessions)
    const nbEvaluations = epreuves.filter(e => e.statut === 'TERMINEE' || e.statut === 'CLOTUREE').length

    // Compute moyenne générale: average of all session scores normalized to /20
    let totalScoreNormalized = 0
    let sessionCount = 0
    const studentScores = new Map<string, { total: number; count: number; filiere: string; name: string; email: string }>()

    // We need student info for top/bottom lists
    const studentIds = [...new Set(allSessions.map(s => s.etudiantId))]
    const studentsInfo = await db.user.findMany({
      where: { id: { in: studentIds } },
      select: {
        id: true,
        name: true,
        email: true,
        filiere: { select: { nom: true } }
      }
    })
    const studentsMap = new Map(studentsInfo.map(s => [s.id, s]))

    for (const session of allSessions) {
      if (session.score === null) continue
      const noteTotal = session.epreuve?.noteTotal || 20
      const normalized = (session.score / noteTotal) * 20
      totalScoreNormalized += normalized
      sessionCount++

      // Accumulate per-student scores
      const existing = studentScores.get(session.etudiantId)
      if (existing) {
        existing.total += normalized
        existing.count += 1
      } else {
        const student = studentsMap.get(session.etudiantId)
        studentScores.set(session.etudiantId, {
          total: normalized,
          count: 1,
          filiere: student?.filiere?.nom || 'N/A',
          name: student?.name || 'Inconnu',
          email: student?.email || ''
        })
      }
    }

    const moyenneGenerale = sessionCount > 0
      ? Math.round((totalScoreNormalized / sessionCount) * 10) / 10
      : 0

    // Taux de réussite: % of sessions with score >= 10/20 normalized
    const sessionsReussies = allSessions.filter(s => {
      if (s.score === null) return false
      const noteTotal = s.epreuve?.noteTotal || 20
      return (s.score / noteTotal) * 20 >= 10
    })
    const tauxReussiteGlobal = sessionCount > 0
      ? Math.round((sessionsReussies.length / sessionCount) * 100)
      : 0

    // ─── 5. Répartition des notes ───
    const repartitionMap = new Map<string, number>()
    NOTE_BUCKETS.forEach(b => repartitionMap.set(b, 0))

    for (const session of allSessions) {
      if (session.score === null) continue
      const noteTotal = session.epreuve?.noteTotal || 20
      const normalized = (session.score / noteTotal) * 20
      const bucket = getNoteBucket(normalized)
      repartitionMap.set(bucket, (repartitionMap.get(bucket) || 0) + 1)
    }

    const repartitionNotes: RepartitionNote[] = NOTE_BUCKETS.map(label => ({
      label,
      count: repartitionMap.get(label) || 0
    }))

    // ─── 6. Résultats par matière (par épreuve) ───
    const resultatsParMatiere: ResultatParMatiere[] = epreuves
      .filter(e => e.sessions.length > 0)
      .map(epreuve => {
        const scores = epreuve.sessions
          .filter(s => s.score !== null)
          .map(s => {
            const noteTotal = s.epreuve?.noteTotal || 20
            return (s.score! / noteTotal) * 20
          })
        const moy = scores.length > 0
          ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
          : 0
        const reussis = scores.filter(s => s >= 10).length
        const taux = scores.length > 0 ? Math.round((reussis / scores.length) * 100) : 0

        return {
          titre: epreuve.titre,
          enseignant: enseignantNames.get(epreuve.enseignantId) || 'Inconnu',
          moyenne: moy,
          tauxReussite: taux,
          nbParticipants: scores.length,
        }
      })
      .sort((a, b) => b.moyenne - a.moyenne)
      .slice(0, 10)

    // ─── 7. Étudiants par filière ───
    const filiereData = await db.filiere.findMany({
      where: { id: { in: filiereIds } },
      include: { _count: { select: { etudiants: true } } }
    })
    const etudiantsParFiliere: EtudiantParFiliere[] = filiereData.map(f => ({
      filiere: f.nom,
      count: f._count.etudiants
    }))

    // ─── 8. Évolution des moyennes (par mois) ───
    const epreuvesWithDates = await db.epreuve.findMany({
      where: {
        enseignantId: { in: enseignantIds },
        deletedAt: null,
        ...(filiereIds.length > 0 ? { filiereId: { in: filiereIds } } : {}),
        ...(dateFilter ? { dateDebut: dateFilter } : {}),
        sessions: { some: { score: { not: null } } }
      },
      select: {
        id: true,
        dateDebut: true,
        sessions: {
          where: { score: { not: null } },
          select: { score: true, epreuve: { select: { noteTotal: true } } }
        }
      }
    })

    // Group by month
    const monthlyData = new Map<string, { totalScore: number; count: number; nbEvals: Set<string> }>()
    for (const epreuve of epreuvesWithDates) {
      const monthKey = epreuve.dateDebut.toISOString().slice(0, 7) // "2025-06"
      const existing = monthlyData.get(monthKey) || { totalScore: 0, count: 0, nbEvals: new Set<string>() }
      existing.nbEvals.add(epreuve.id)

      for (const session of epreuve.sessions) {
        const noteTotal = session.epreuve?.noteTotal || 20
        const normalized = (session.score! / noteTotal) * 20
        existing.totalScore += normalized
        existing.count += 1
      }
      monthlyData.set(monthKey, existing)
    }

    const evolutionMoyennes: EvolutionMoyenne[] = [...monthlyData.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mois, data]) => ({
        mois,
        moyenne: data.count > 0 ? Math.round((data.totalScore / data.count) * 10) / 10 : 0,
        nbEvaluations: data.nbEvals.size,
      }))

    // ─── 9. Top enseignants ───
    const enseignantStats = new Map<string, { nbEpreuves: number; totalScore: number; sessionCount: number; reussis: number }>()

    for (const epreuve of epreuves) {
      const eid = epreuve.enseignantId
      const existing = enseignantStats.get(eid) || { nbEpreuves: 0, totalScore: 0, sessionCount: 0, reussis: 0 }
      existing.nbEpreuves += 1
      for (const session of epreuve.sessions) {
        if (session.score === null) continue
        const noteTotal = session.epreuve?.noteTotal || 20
        const normalized = (session.score / noteTotal) * 20
        existing.totalScore += normalized
        existing.sessionCount += 1
        if (normalized >= 10) existing.reussis += 1
      }
      enseignantStats.set(eid, existing)
    }

    const topEnseignants: TopEnseignant[] = [...enseignantStats.entries()]
      .map(([id, stats]) => ({
        nom: enseignantNames.get(id) || 'Inconnu',
        nbEpreuves: stats.nbEpreuves,
        moyenne: stats.sessionCount > 0
          ? Math.round((stats.totalScore / stats.sessionCount) * 10) / 10
          : 0,
        tauxReussite: stats.sessionCount > 0
          ? Math.round((stats.reussis / stats.sessionCount) * 100)
          : 0,
      }))
      .sort((a, b) => b.tauxReussite - a.tauxReussite)
      .slice(0, 5)

    // ─── 10. Alertes réelles ───
    const alertesDB = await db.alerte.findMany({
      where: {
        resolu: false,
        filiereId: { in: filiereIds },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        type: true,
        titre: true,
        description: true,
        severity: true,
      }
    })

    const alertes: AlerteStat[] = alertesDB.map(a => ({
      type: a.type,
      titre: a.titre,
      description: a.description,
      severity: a.severity.toLowerCase(),
    }))

    // ─── 11. Top étudiants & étudiants en difficulté (réels) ───
    const topEtudiants: TopEtudiant[] = [...studentScores.entries()]
      .map(([id, data]) => ({
        id,
        nom: data.name,
        email: data.email,
        moyenne: Math.round((data.total / data.count) * 10) / 10,
        filiere: data.filiere,
      }))
      .sort((a, b) => b.moyenne - a.moyenne)
      .slice(0, 5)

    const etudiantsEnDifficulte: TopEtudiant[] = [...studentScores.entries()]
      .map(([id, data]) => ({
        id,
        nom: data.name,
        email: data.email,
        moyenne: Math.round((data.total / data.count) * 10) / 10,
        filiere: data.filiere,
      }))
      .filter(s => s.moyenne < 10)
      .sort((a, b) => a.moyenne - b.moyenne)
      .slice(0, 10)

    // ─── 12. Count students and teachers ───
    const nbEtudiants = await db.user.count({
      where: {
        role: 'ETUDIANT',
        actif: true,
        filiereId: { in: filiereIds },
      }
    })

    const nbEnseignants = enseignantIds.length

    // ─── Build response ───
    const response: StatsResponse = {
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
      topEtudiants,
      etudiantsEnDifficulte,
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('Responsable stats error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des statistiques du responsable' },
      { status: 500 }
    )
  }
}

function emptyStats(): StatsResponse {
  return {
    nbEtudiants: 0,
    nbEnseignants: 0,
    nbEvaluations: 0,
    tauxReussiteGlobal: 0,
    moyenneGenerale: 0,
    repartitionNotes: NOTE_BUCKETS.map(label => ({ label, count: 0 })),
    resultatsParMatiere: [],
    etudiantsParFiliere: [],
    evolutionMoyennes: [],
    topEnseignants: [],
    alertes: [],
    topEtudiants: [],
    etudiantsEnDifficulte: [],
  }
}

export const GET = withAuth(_GET, ['RESPONSABLE', 'ADMIN'])
