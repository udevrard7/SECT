import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth, type AuthenticatedUser } from '@/lib/auth-session'

// ─── Types ───

interface EvolutionMoyenne {
  mois: string
  moyenne: number
  nbEvaluations: number
}

interface EpreuveAVenir {
  id: string
  titre: string
  date: string
  dateFin: string
  duree: number
  statut: string
  nbParticipants: number
}

interface BadgeData {
  id: string
  titre: string
  description: string
  unlocked: boolean
  dateObtention?: string
}

// ─── Main handler ───

async function _GET(request: NextRequest, context: { params: any; user: AuthenticatedUser }) {
  try {
    const userId = context.user.id

    // ─── 1. Basic counts ───
    const [nbDocuments, nbQuestionsTotal, nbEpreuves] =
      await Promise.all([
        db.document.count({ where: { ownerId: userId } }),
        db.question.count({ where: { OR: [{ auteurId: userId }, { document: { ownerId: userId } }], deletedAt: null } }),
        db.epreuve.count({ where: { enseignantId: userId, deletedAt: null } }),
      ])

    // ─── 2. Pending corrections ───
    const sessionsSoumises = await db.sessionPassation.findMany({
      where: {
        epreuve: { enseignantId: userId },
        statut: 'SOUMISE',
      },
      include: {
        etudiant: { select: { id: true, name: true, email: true } },
        epreuve: { select: { id: true, titre: true } },
      },
      orderBy: { dateFin: 'desc' },
    })

    const pendingCorrections = sessionsSoumises.map((session) => ({
      sessionId: session.id,
      etudiantNom: session.etudiant.name,
      etudiantEmail: session.etudiant.email,
      epreuveTitre: session.epreuve.titre,
      questionType: 'QRC' as const,
      questionPreview: 'Réponse ouverte en attente',
      submittedAt: session.dateFin!.toISOString(),
    }))

    // ─── 3. Recent epreuves with average score ───
    const recentEpreuvesRaw = await db.epreuve.findMany({
      where: { enseignantId: userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        sessions: {
          select: { score: true, epreuve: { select: { noteTotal: true } } },
        },
      },
    })

    const recentEpreuves = recentEpreuvesRaw.map((ep) => {
      const scores = ep.sessions
        .filter(s => s.score !== null)
        .map(s => {
          const noteTotal = s.epreuve?.noteTotal || 20
          return (s.score! / noteTotal) * 20
        })
      const moyenne = scores.length > 0
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : 0
      return {
        id: ep.id,
        titre: ep.titre,
        date: ep.dateDebut.toISOString(),
        statut: ep.statut,
        nbParticipants: ep.sessions.length,
        moyenne: parseFloat(moyenne.toFixed(1)),
      }
    })

    // ─── 4. Performance par épreuve (for charts) ───
    const epreuvesTerminees = await db.epreuve.findMany({
      where: {
        enseignantId: userId,
        deletedAt: null,
        statut: { in: ['TERMINEE', 'CLOTUREE'] },
        sessions: { some: {} },
      },
      orderBy: { dateDebut: 'desc' },
      take: 7,
      include: {
        sessions: {
          where: { score: { not: null } },
          select: { score: true, epreuve: { select: { noteTotal: true } } },
        },
      },
    })

    const performanceParEpreuve = epreuvesTerminees.map((ep) => {
      const scores = ep.sessions.map((s) => {
        const noteTotal = s.epreuve?.noteTotal || 20
        return (s.score! / noteTotal) * 20
      })
      const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
      const taux = scores.length > 0 ? (scores.filter((s) => s >= 10).length / scores.length) * 100 : 0
      return {
        titre: ep.titre.length > 15 ? ep.titre.substring(0, 15) + '...' : ep.titre,
        moyenne: parseFloat(avg.toFixed(1)),
        tauxReussite: parseFloat(taux.toFixed(1)),
      }
    })

    // ─── 5. Evolution des moyennes (par mois) ───
    const epreuvesWithDates = await db.epreuve.findMany({
      where: {
        enseignantId: userId,
        deletedAt: null,
        sessions: { some: { score: { not: null } } },
      },
      select: {
        id: true,
        dateDebut: true,
        sessions: {
          where: { score: { not: null } },
          select: { score: true, epreuve: { select: { noteTotal: true } } },
        },
      },
    })

    const monthlyData = new Map<string, { totalScore: number; count: number; nbEvals: Set<string> }>()
    for (const epreuve of epreuvesWithDates) {
      const monthKey = epreuve.dateDebut.toISOString().slice(0, 7)
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

    // ─── 6. Épreuves à venir ───
    const epreuvesAVenirRaw = await db.epreuve.findMany({
      where: {
        enseignantId: userId,
        deletedAt: null,
        statut: { in: ['PLANIFIEE', 'EN_COURS', 'BROUILLON'] },
        dateDebut: { gte: new Date() },
      },
      orderBy: { dateDebut: 'asc' },
      take: 5,
      include: {
        sessions: { select: { id: true } },
      },
    })

    const epreuvesAVenir: EpreuveAVenir[] = epreuvesAVenirRaw.map(ep => ({
      id: ep.id,
      titre: ep.titre,
      date: ep.dateDebut.toISOString(),
      dateFin: ep.dateFin.toISOString(),
      duree: ep.duree,
      statut: ep.statut,
      nbParticipants: ep.sessions.length,
    }))

    // ─── 7. Active exam count ───
    const nbEpreuvesActives = await db.epreuve.count({
      where: {
        enseignantId: userId,
        deletedAt: null,
        statut: { in: ['PLANIFIEE', 'EN_COURS', 'PUBLIEE'] },
      },
    })

    // ─── 8. Compute badges ───
    // Badge 1: Première Épreuve
    const hasFirstEpreuve = nbEpreuves >= 1
    const firstEpreuveDate = hasFirstEpreuve
      ? (await db.epreuve.findFirst({
          where: { enseignantId: userId, deletedAt: null },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        }))?.createdAt.toISOString()
      : undefined

    // Badge 2: Maître Corrigeur (10+ sessions corrigées)
    const nbCorrigees = await db.sessionPassation.count({
      where: {
        epreuve: { enseignantId: userId },
        statut: { in: ['CORRIGEE', 'RETOURNEE'] },
      },
    })
    const hasMasterCorrector = nbCorrigees >= 10
    const masterCorrectorDate = hasMasterCorrector
      ? (await db.sessionPassation.findFirst({
          where: {
            epreuve: { enseignantId: userId },
            statut: { in: ['CORRIGEE', 'RETOURNEE'] },
          },
          orderBy: { updatedAt: 'asc' },
          skip: 9,
          select: { updatedAt: true },
        }))?.updatedAt.toISOString()
      : undefined

    // Badge 3: Créateur IA
    const hasIAGenerated = await db.epreuve.findFirst({
      where: { enseignantId: userId, generationMode: 'IA_ASSISTEE', deletedAt: null },
      select: { createdAt: true },
    })

    // Badge 4: Excellence Pédagogique (moyenne étudiants >= 14)
    const allScoredSessions = await db.sessionPassation.findMany({
      where: {
        epreuve: { enseignantId: userId, deletedAt: null },
        score: { not: null },
      },
      select: { score: true, epreuve: { select: { noteTotal: true } } },
    })
    const globalAvg = allScoredSessions.length > 0
      ? allScoredSessions.reduce((sum, s) => {
          const noteTotal = s.epreuve?.noteTotal || 20
          return sum + (s.score! / noteTotal) * 20
        }, 0) / allScoredSessions.length
      : 0
    const hasExcellence = globalAvg >= 14 && allScoredSessions.length >= 5

    const badges: BadgeData[] = [
      {
        id: 'first_epreuve',
        titre: 'Première Épreuve',
        description: 'Créer votre première épreuve.',
        unlocked: hasFirstEpreuve,
        dateObtention: firstEpreuveDate,
      },
      {
        id: 'master_corrector',
        titre: 'Maître Corrigeur',
        description: 'Corriger 10 copies ou plus.',
        unlocked: hasMasterCorrector,
        dateObtention: masterCorrectorDate,
      },
      {
        id: 'ai_creator',
        titre: 'Créateur IA',
        description: 'Générer une épreuve avec l\'IA.',
        unlocked: !!hasIAGenerated,
        dateObtention: hasIAGenerated?.createdAt.toISOString(),
      },
      {
        id: 'excellence',
        titre: 'Excellence Pédagogique',
        description: 'Obtenir une moyenne étudiante ≥ 14/20.',
        unlocked: hasExcellence,
        dateObtention: hasExcellence
          ? (await db.epreuve.findFirst({
              where: {
                enseignantId: userId,
                deletedAt: null,
                statut: { in: ['TERMINEE', 'CLOTUREE'] },
                sessions: { some: { score: { not: null } } },
              },
              orderBy: { dateDebut: 'desc' },
              select: { dateDebut: true },
            }))?.dateDebut.toISOString()
          : undefined,
      },
    ]

    return NextResponse.json({
      nbDocuments,
      nbQuestionsTotal,
      nbEpreuves,
      nbEpreuvesActives,
      nbCorrectionsEnAttente: pendingCorrections.length,
      pendingCorrections,
      recentEpreuves,
      performanceParEpreuve,
      evolutionMoyennes,
      epreuvesAVenir,
      badges,
    })
  } catch (error) {
    console.error('Stats enseignant error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des statistiques' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(_GET, ['ENSEIGNANT', 'ADMIN'])
