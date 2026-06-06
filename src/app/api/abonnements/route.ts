import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/auth-middleware'

// GET /api/abonnements — List abonnements (ADMIN only)
export async function GET(request: NextRequest) {
  try {
    // Only ADMIN can list all abonnements (platform owner)
    const auth = await requireRole(request, ['ADMIN'])
    if (isAuthError(auth)) return auth

    const { searchParams } = new URL(request.url)
    const statut = searchParams.get('statut') || ''
    const etablissementId = searchParams.get('etablissementId') || ''

    const where: Record<string, unknown> = {}

    if (statut) {
      const validStatuts = ['ESSAI', 'ACTIF', 'SUSPENDU', 'EXPIRE', 'RESILIE']
      if (!validStatuts.includes(statut)) {
        return NextResponse.json(
          { error: `Statut invalide. Valeurs acceptées: ${validStatuts.join(', ')}` },
          { status: 400 }
        )
      }
      where.statut = statut
    }

    if (etablissementId) {
      where.etablissementId = etablissementId
    }

    const abonnements = await db.abonnement.findMany({
      where,
      include: {
        plan: {
          select: {
            id: true,
            nom: true,
            type: true,
            prixMensuel: true,
            prixAnnuel: true,
          },
        },
        etablissement: {
          select: {
            id: true,
            nom: true,
            ville: true,
            actif: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ abonnements })
  } catch (error) {
    console.error('Error fetching abonnements:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des abonnements' },
      { status: 500 }
    )
  }
}

// POST /api/abonnements — Create a new abonnement (ADMIN ONLY)
export async function POST(request: NextRequest) {
  try {
    // Only ADMIN (platform owner) can create abonnements
    const auth = await requireRole(request, ['ADMIN'])
    if (isAuthError(auth)) return auth

    const body = await request.json()
    const {
      etablissementId,
      planId,
      dateDebut,
      statut,
      periodeEssaiJours,
      modePaiement,
      referencePaiement,
      montantPaye,
      renouvellementAuto,
      notes,
    } = body

    // Validate required fields
    if (!etablissementId || !planId || !dateDebut) {
      return NextResponse.json(
        { error: 'Les champs etablissementId, planId et dateDebut sont obligatoires' },
        { status: 400 }
      )
    }

    // Verify etablissement exists
    const etablissement = await db.etablissement.findUnique({
      where: { id: etablissementId },
    })
    if (!etablissement) {
      return NextResponse.json(
        { error: 'Établissement non trouvé' },
        { status: 404 }
      )
    }

    // Verify plan exists
    const plan = await db.plan.findUnique({
      where: { id: planId },
    })
    if (!plan) {
      return NextResponse.json(
        { error: 'Plan non trouvé' },
        { status: 404 }
      )
    }

    // Calculate dateFin based on plan pricing period
    const startDate = new Date(dateDebut)
    let dateFin: Date | null = null

    if (plan.prixAnnuel && montantPaye !== undefined && parseFloat(montantPaye) >= (plan.prixAnnuel ?? 0)) {
      dateFin = new Date(startDate)
      dateFin.setFullYear(dateFin.getFullYear() + 1)
    } else if (plan.prixMensuel > 0) {
      dateFin = new Date(startDate)
      dateFin.setMonth(dateFin.getMonth() + 1)
    }

    // Validate statut enum if provided
    const validStatuts = ['ESSAI', 'ACTIF', 'SUSPENDU', 'EXPIRE', 'RESILIE']
    const abonnementStatut = statut || 'ESSAI'
    if (!validStatuts.includes(abonnementStatut)) {
      return NextResponse.json(
        { error: `Statut invalide. Valeurs acceptées: ${validStatuts.join(', ')}` },
        { status: 400 }
      )
    }

    const abonnement = await db.abonnement.create({
      data: {
        etablissementId,
        planId,
        statut: abonnementStatut,
        dateDebut: startDate,
        dateFin,
        periodeEssaiJours: periodeEssaiJours ?? 14,
        modePaiement: modePaiement || null,
        referencePaiement: referencePaiement || null,
        montantPaye: montantPaye !== undefined ? parseFloat(montantPaye) : 0,
        renouvellementAuto: renouvellementAuto !== undefined ? renouvellementAuto : true,
        notes: notes || null,
      },
      include: {
        plan: {
          select: {
            id: true,
            nom: true,
            type: true,
            prixMensuel: true,
            prixAnnuel: true,
          },
        },
        etablissement: {
          select: {
            id: true,
            nom: true,
            ville: true,
            actif: true,
          },
        },
      },
    })

    // Audit log with admin identity
    await db.auditLog.create({
      data: {
        userId: auth.id,
        userEmail: auth.email,
        action: 'CREATE',
        entite: 'Abonnement',
        entiteId: abonnement.id,
        details: JSON.stringify({
          etablissementId,
          planId,
          statut: abonnementStatut,
          dateDebut: startDate,
          dateFin,
        }),
      },
    })

    return NextResponse.json({ abonnement }, { status: 201 })
  } catch (error) {
    console.error('Error creating abonnement:', error)
    return NextResponse.json(
      { error: "Erreur lors de la création de l'abonnement" },
      { status: 500 }
    )
  }
}
