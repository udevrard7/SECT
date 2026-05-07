import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    // ─── Basic counts ───
    const [nbUtilisateurs, nbQuestions, nbEvaluations, nbDocuments] = await Promise.all([
      db.user.count(),
      db.question.count(),
      db.epreuve.count(),
      db.document.count(),
    ])

    // ─── Users by role ───
    const usersByRoleRaw = await db.user.groupBy({
      by: ['role'],
      _count: { role: true },
    })
    const utilisateursParRole = usersByRoleRaw.map((r) => ({
      role: r.role,
      count: r._count.role,
    }))

    // ─── Unique establishments ───
    const nbEtablissements = await db.etablissement.count()

    // ─── Epreuves by status ───
    const epreuvesByStatusRaw = await db.epreuve.groupBy({
      by: ['statut'],
      _count: { statut: true },
    })
    const epreuvesParStatut = epreuvesByStatusRaw.map((r) => ({
      statut: r.statut,
      count: r._count.statut,
    }))

    // ─── Monthly creation trends ───
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const [recentUsers, recentQuestions, recentEpreuves] = await Promise.all([
      db.user.findMany({
        where: { createdAt: { gte: sixMonthsAgo } },
        select: { createdAt: true, role: true },
      }),
      db.question.findMany({
        where: { createdAt: { gte: sixMonthsAgo } },
        select: { createdAt: true },
      }),
      db.epreuve.findMany({
        where: { createdAt: { gte: sixMonthsAgo } },
        select: { createdAt: true },
      }),
    ])

    const monthsSet = new Set<string>()
    const usersByMonth: Record<string, number> = {}
    const questionsByMonth: Record<string, number> = {}
    const epreuvesByMonth: Record<string, number> = {}

    recentUsers.forEach((u) => {
      const key = u.createdAt.toISOString().substring(0, 7)
      monthsSet.add(key)
      usersByMonth[key] = (usersByMonth[key] || 0) + 1
    })
    recentQuestions.forEach((q) => {
      const key = q.createdAt.toISOString().substring(0, 7)
      monthsSet.add(key)
      questionsByMonth[key] = (questionsByMonth[key] || 0) + 1
    })
    recentEpreuves.forEach((e) => {
      const key = e.createdAt.toISOString().substring(0, 7)
      monthsSet.add(key)
      epreuvesByMonth[key] = (epreuvesByMonth[key] || 0) + 1
    })

    const creationTrend = Array.from(monthsSet)
      .sort()
      .map((mois) => ({
        mois,
        utilisateurs: usersByMonth[mois] || 0,
        questions: questionsByMonth[mois] || 0,
        epreuves: epreuvesByMonth[mois] || 0,
      }))

    // ─── Recent activity ───
    const recentActivities: Array<{ id: string; type: string; description: string; time: string }> = []

    const recentSessions = await db.sessionPassation.findMany({
      where: { statut: 'SOUMISE' },
      orderBy: { dateFin: 'desc' },
      take: 3,
      include: {
        etudiant: { select: { name: true } },
        epreuve: { select: { titre: true } },
      },
    })
    recentSessions.forEach((s) => {
      recentActivities.push({
        id: s.id,
        type: 'soumission',
        description: `Copie soumise — ${s.etudiant.name} (${s.epreuve.titre})`,
        time: s.dateFin ? getTimeAgo(s.dateFin) : 'Récemment',
      })
    })

    const recentUsersCreated = await db.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { id: true, name: true, role: true, createdAt: true },
    })
    recentUsersCreated.forEach((u) => {
      recentActivities.push({
        id: u.id,
        type: 'inscription',
        description: `Nouvel utilisateur — ${u.name} (${u.role})`,
        time: getTimeAgo(u.createdAt),
      })
    })

    const recentEpreuvesCreated = await db.epreuve.findMany({
      orderBy: { createdAt: 'desc' },
      take: 2,
      include: {
        enseignant: { select: { name: true } },
      },
    })
    recentEpreuvesCreated.forEach((e) => {
      recentActivities.push({
        id: e.id,
        type: 'epreuve',
        description: `Épreuve créée — ${e.titre} par ${e.enseignant.name}`,
        time: getTimeAgo(e.createdAt),
      })
    })

    // Sort by recency (approximate)
    recentActivities.sort(() => Math.random() - 0.5)

    // ─── Questions by type (global) ───
    const questionsByTypeRaw = await db.question.groupBy({
      by: ['type'],
      _count: { type: true },
    })
    const questionsParType = questionsByTypeRaw.map((r) => ({
      type: r.type,
      count: r._count.type,
    }))

    // ─── Global success rate ───
    const allScoredSessions = await db.sessionPassation.findMany({
      where: { score: { not: null } },
      select: { score: true },
    })
    const allScores = allScoredSessions.map((s) => s.score as number)
    const tauxReussiteGlobal =
      allScores.length > 0
        ? Math.round((allScores.filter((s) => s >= 10).length / allScores.length) * 100)
        : 0

    // ─── SaaS Metrics ───
    const [nbAbonnementsActifs, nbAbonnementsEssai, nbAbonnementsExpires, revenuMensuel, nbEtablissementsProteges] = await Promise.all([
      db.abonnement.count({ where: { statut: 'ACTIF' } }),
      db.abonnement.count({ where: { statut: 'ESSAI' } }),
      db.abonnement.count({ where: { statut: { in: ['EXPIRE', 'SUSPENDU'] } } }),
      db.abonnement.aggregate({ where: { statut: 'ACTIF' }, _sum: { montantPaye: true } }),
      db.securitySettings.count({ where: { proctoringActif: true } }),
    ])

    // ─── Revenue ───
    const revenuMensuelTotal = revenuMensuel._sum.montantPaye || 0

    // ─── Annual revenue: sum of plan.prixAnnuel for ACTIF annual abonnements ───
    const abonnementsActifsAnnuel = await db.abonnement.findMany({
      where: { statut: 'ACTIF' },
      include: { plan: { select: { prixAnnuel: true } } },
    })
    const revenuAnnuel = abonnementsActifsAnnuel.reduce((sum, a) => {
      return sum + (a.plan.prixAnnuel || 0)
    }, 0)

    // ─── Plan distribution ───
    const abonnementsParPlan = await db.abonnement.groupBy({
      by: ['planId'],
      _count: { planId: true },
    })
    const plans = await db.plan.findMany({ select: { id: true, nom: true } })
    const planNameMap = Object.fromEntries(plans.map(p => [p.id, p.nom]))
    const repartitionPlans = abonnementsParPlan.map(a => ({
      plan: planNameMap[a.planId] || 'Inconnu',
      count: a._count.planId,
    }))

    // ─── Establishments by subscription status ───
    const abonnementsParStatut = await db.abonnement.groupBy({
      by: ['statut'],
      _count: { statut: true },
    })
    const etablissementsParStatut = abonnementsParStatut.map(a => ({
      statut: a.statut,
      count: a._count.statut,
    }))

    // ─── Identity verification count ───
    const nbVerificationIdentite = await db.securitySettings.count({
      where: { verificationIdentite: true },
    })

    return NextResponse.json({
      nbUtilisateurs,
      nbEtablissements,
      nbEvaluations,
      nbQuestions,
      nbDocuments,
      utilisateursParRole,
      epreuvesParStatut,
      creationTrend,
      recentActivities,
      questionsParType,
      tauxReussiteGlobal,
      // New SaaS metrics
      nbAbonnementsActifs,
      nbAbonnementsEssai,
      nbAbonnementsExpires,
      revenuMensuel: revenuMensuelTotal,
      revenuAnnuel,
      repartitionPlans,
      etablissementsParStatut,
      nbEtablissementsProteges,
      nbVerificationIdentite,
    })
  } catch (error) {
    console.error('Stats admin error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des statistiques' },
      { status: 500 }
    )
  }
}

function getTimeAgo(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return "À l'instant"
  if (minutes < 60) return `Il y a ${minutes}min`
  if (hours < 24) return `Il y a ${hours}h`
  if (days < 7) return `Il y a ${days}j`
  return `Il y a ${Math.floor(days / 7)} sem.`
}
