import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/abonnements/[id] — Get abonnement by ID with plan and etablissement
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const abonnement = await db.abonnement.findUnique({
      where: { id },
      include: {
        plan: true,
        etablissement: {
          select: {
            id: true,
            nom: true,
            type: true,
            ville: true,
            pays: true,
            email: true,
            telephone: true,
            actif: true,
          },
        },
      },
    })

    if (!abonnement) {
      return NextResponse.json(
        { error: 'Abonnement non trouvé' },
        { status: 404 }
      )
    }

    return NextResponse.json({ abonnement })
  } catch (error) {
    console.error('Error fetching abonnement:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération de l\'abonnement' },
      { status: 500 }
    )
  }
}

// PATCH /api/abonnements/[id] — Update an abonnement
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Verify abonnement exists
    const existing = await db.abonnement.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'Abonnement non trouvé' },
        { status: 404 }
      )
    }

    // Validate statut if provided
    if (body.statut !== undefined) {
      const validStatuts = ['ESSAI', 'ACTIF', 'SUSPENDU', 'EXPIRE', 'RESILIE']
      if (!validStatuts.includes(body.statut)) {
        return NextResponse.json(
          { error: `Statut invalide. Valeurs acceptées: ${validStatuts.join(', ')}` },
          { status: 400 }
        )
      }
    }

    // If planId is changing, verify the new plan exists and recalculate dateFin
    let dateFinUpdate: Date | null | undefined = undefined
    if (body.planId !== undefined && body.planId !== existing.planId) {
      const newPlan = await db.plan.findUnique({ where: { id: body.planId } })
      if (!newPlan) {
        return NextResponse.json(
          { error: 'Plan non trouvé' },
          { status: 404 }
        )
      }
      // Recalculate dateFin based on the new plan
      const startDate = new Date(existing.dateDebut)
      if (newPlan.prixAnnuel) {
        dateFinUpdate = new Date(startDate)
        dateFinUpdate.setFullYear(dateFinUpdate.getFullYear() + 1)
      } else if (newPlan.prixMensuel > 0) {
        dateFinUpdate = new Date(startDate)
        dateFinUpdate.setMonth(dateFinUpdate.getMonth() + 1)
      } else {
        dateFinUpdate = null
      }
    }

    const data: Record<string, unknown> = {}
    if (body.planId !== undefined) data.planId = body.planId
    if (body.statut !== undefined) data.statut = body.statut
    if (body.dateDebut !== undefined) data.dateDebut = new Date(body.dateDebut)
    if (body.dateFin !== undefined) data.dateFin = body.dateFin ? new Date(body.dateFin) : null
    if (dateFinUpdate !== undefined) data.dateFin = dateFinUpdate
    if (body.periodeEssaiJours !== undefined) data.periodeEssaiJours = body.periodeEssaiJours
    if (body.modePaiement !== undefined) data.modePaiement = body.modePaiement || null
    if (body.referencePaiement !== undefined) data.referencePaiement = body.referencePaiement || null
    if (body.montantPaye !== undefined) data.montantPaye = parseFloat(body.montantPaye)
    if (body.renouvellementAuto !== undefined) data.renouvellementAuto = body.renouvellementAuto
    if (body.notes !== undefined) data.notes = body.notes || null

    const abonnement = await db.abonnement.update({
      where: { id },
      data,
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

    // Log audit
    await db.auditLog.create({
      data: {
        action: 'UPDATE',
        entite: 'Abonnement',
        entiteId: id,
        details: JSON.stringify(data),
      },
    })

    return NextResponse.json({ abonnement })
  } catch (error) {
    console.error('Error updating abonnement:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour de l\'abonnement' },
      { status: 500 }
    )
  }
}

// DELETE /api/abonnements/[id] — Cancel abonnement (set status to RESILIE)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Verify abonnement exists
    const existing = await db.abonnement.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'Abonnement non trouvé' },
        { status: 404 }
      )
    }

    if (existing.statut === 'RESILIE') {
      return NextResponse.json(
        { error: 'Cet abonnement est déjà résilié' },
        { status: 400 }
      )
    }

    const abonnement = await db.abonnement.update({
      where: { id },
      data: {
        statut: 'RESILIE',
        renouvellementAuto: false,
      },
      include: {
        plan: {
          select: {
            id: true,
            nom: true,
            type: true,
          },
        },
        etablissement: {
          select: {
            id: true,
            nom: true,
          },
        },
      },
    })

    // Log audit
    await db.auditLog.create({
      data: {
        action: 'DELETE',
        entite: 'Abonnement',
        entiteId: id,
        details: JSON.stringify({
          action: 'RÉSILIATION',
          etablissementId: existing.etablissementId,
          planId: existing.planId,
          ancienStatut: existing.statut,
        }),
      },
    })

    return NextResponse.json({
      message: 'Abonnement résilié',
      abonnement,
    })
  } catch (error) {
    console.error('Error cancelling abonnement:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la résiliation de l\'abonnement' },
      { status: 500 }
    )
  }
}
