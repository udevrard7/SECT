import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth, type AuthenticatedUser } from '@/lib/auth-session'

async function _GET(request: NextRequest, context: { params: any; user: AuthenticatedUser }) {
  try {
    // Use authenticated user ID from session to prevent IDOR
    const adminId = context.user.id

    // ─── Basic platform counts ───
    const nbEtablissements = await db.etablissement.count()

    // ─── SaaS Metrics ───
    const [nbAbonnementsActifs, nbAbonnementsEssai, nbAbonnementsExpires, revenuMensuelAgg, nbEtablissementsProteges, nbVerificationIdentite, nbAutorisationsActives, nbAutorisationsEnAttente] = await Promise.all([
      db.abonnement.count({ where: { statut: 'ACTIF' } }),
      db.abonnement.count({ where: { statut: 'ESSAI' } }),
      db.abonnement.count({ where: { statut: { in: ['EXPIRE', 'SUSPENDU'] } } }),
      db.abonnement.aggregate({ where: { statut: 'ACTIF' }, _sum: { montantPaye: true } }),
      db.securitySettings.count({ where: { proctoringActif: true } }),
      db.securitySettings.count({ where: { verificationIdentite: true } }),
      db.etablissementAccess.count({ where: { statut: 'APPROUVE' } }),
      db.etablissementAccess.count({ where: { statut: 'EN_ATTENTE' } }),
    ])

    // ─── Revenue ───
    const revenuMensuelTotal = revenuMensuelAgg._sum.montantPaye || 0

    // Annual revenue: sum of plan.prixAnnuel for ACTIF annual abonnements
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

    // ─── Établissements Overview ───
    const etablissements = await db.etablissement.findMany({
      select: {
        id: true,
        nom: true,
        ville: true,
        type: true,
        actif: true,
        users: { select: { id: true } },
        filieres: { select: { id: true } },
        abonnements: {
          where: { statut: { in: ['ACTIF', 'ESSAI'] } },
          select: {
            statut: true,
            plan: { select: { nom: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        securitySettings: {
          select: { proctoringActif: true },
        },
      },
    })

    // Get admin's approved access for all establishments
    const adminAccessMap = new Set<string>()
    if (adminId) {
      const approvedAccess = await db.etablissementAccess.findMany({
        where: {
          adminId,
          statut: 'APPROUVE',
          dateDebut: { lte: new Date() },
          OR: [
            { dateFin: null },
            { dateFin: { gte: new Date() } },
          ],
        },
        select: { etablissementId: true },
      })
      approvedAccess.forEach(a => adminAccessMap.add(a.etablissementId))
    }

    const etablissementsOverview = etablissements.map(e => {
      const latestAbonnement = e.abonnements[0]
      return {
        id: e.id,
        nom: e.nom,
        ville: e.ville,
        type: e.type,
        actif: e.actif,
        abonnementStatut: latestAbonnement?.statut || null,
        planNom: latestAbonnement?.plan.nom || null,
        nbUsers: e.users.length,
        nbFilieres: e.filieres.length,
        proctoringActif: e.securitySettings?.proctoringActif || false,
        adminHasAccess: adminAccessMap.has(e.id),
      }
    })

    return NextResponse.json({
      nbEtablissements,
      nbAbonnementsActifs,
      nbAbonnementsEssai,
      nbAbonnementsExpires,
      revenuMensuel: revenuMensuelTotal,
      revenuAnnuel,
      repartitionPlans,
      etablissementsParStatut,
      nbEtablissementsProteges,
      nbVerificationIdentite,
      nbAutorisationsActives,
      nbAutorisationsEnAttente,
      etablissementsOverview,
    })
  } catch (error) {
    console.error('Stats admin error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des statistiques' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(_GET, ['ADMIN'])
