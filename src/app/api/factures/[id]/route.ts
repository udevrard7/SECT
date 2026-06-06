import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/factures/[id] — Get single facture with relations
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const facture = await db.facture.findUnique({
      where: { id },
      include: {
        abonnement: {
          select: {
            id: true,
            statut: true,
            dateDebut: true,
            dateFin: true,
            plan: {
              select: {
                id: true,
                nom: true,
                type: true,
                prixMensuel: true,
                prixAnnuel: true,
              },
            },
          },
        },
        etablissement: {
          select: {
            id: true,
            nom: true,
            type: true,
            ville: true,
            pays: true,
            email: true,
            telephone: true,
            adresse: true,
          },
        },
      },
    })

    if (!facture) {
      return NextResponse.json(
        { error: 'Facture non trouvée' },
        { status: 404 }
      )
    }

    // Parse lignes JSON
    const parsedFacture = {
      ...facture,
      lignes: facture.lignes ? JSON.parse(facture.lignes) : [],
    }

    return NextResponse.json({ facture: parsedFacture })
  } catch (error) {
    console.error('Error fetching facture:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération de la facture' },
      { status: 500 }
    )
  }
}

// PATCH /api/factures/[id] — Update facture (statut, datePaiement, modePaiement)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Verify facture exists
    const existing = await db.facture.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'Facture non trouvée' },
        { status: 404 }
      )
    }

    // Validate statut if provided
    if (body.statut !== undefined) {
      const validStatuts = ['EN_ATTENTE', 'PAYEE', 'EN_RETARD', 'ANNULEE']
      if (!validStatuts.includes(body.statut)) {
        return NextResponse.json(
          { error: `Statut invalide. Valeurs acceptées: ${validStatuts.join(', ')}` },
          { status: 400 }
        )
      }
    }

    const data: Record<string, unknown> = {}

    if (body.statut !== undefined) data.statut = body.statut
    if (body.datePaiement !== undefined) {
      data.datePaiement = body.datePaiement ? new Date(body.datePaiement) : null
    }
    if (body.modePaiement !== undefined) data.modePaiement = body.modePaiement || null
    if (body.referencePaiement !== undefined) data.referencePaiement = body.referencePaiement || null
    if (body.notes !== undefined) data.notes = body.notes || null
    if (body.montantHt !== undefined) data.montantHt = parseFloat(String(body.montantHt))
    if (body.tva !== undefined) data.tva = parseFloat(String(body.tva))
    if (body.montantTtc !== undefined) data.montantTtc = parseFloat(String(body.montantTtc))
    if (body.dateEcheance !== undefined) data.dateEcheance = new Date(body.dateEcheance)
    if (body.lignes !== undefined) data.lignes = JSON.stringify(body.lignes)

    // If statut is PAYEE and no datePaiement provided, set to now
    if (body.statut === 'PAYEE' && !body.datePaiement) {
      data.datePaiement = new Date()
    }

    const facture = await db.facture.update({
      where: { id },
      data,
      include: {
        abonnement: {
          select: {
            id: true,
            statut: true,
            plan: {
              select: {
                id: true,
                nom: true,
                type: true,
                prixMensuel: true,
              },
            },
          },
        },
        etablissement: {
          select: {
            id: true,
            nom: true,
            ville: true,
            email: true,
          },
        },
      },
    })

    // Log audit
    await db.auditLog.create({
      data: {
        action: 'UPDATE_FACTURE',
        entite: 'Facture',
        entiteId: id,
        details: JSON.stringify({
          numero: existing.numero,
          champsModifies: Object.keys(data),
          ancienStatut: existing.statut,
          nouveauStatut: body.statut || existing.statut,
        }),
      },
    })

    // Parse lignes for response
    const parsedFacture = {
      ...facture,
      lignes: facture.lignes ? JSON.parse(facture.lignes) : [],
    }

    return NextResponse.json({ facture: parsedFacture })
  } catch (error) {
    console.error('Error updating facture:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour de la facture' },
      { status: 500 }
    )
  }
}

// DELETE /api/factures/[id] — Cancel a facture (set statut to ANNULEE)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Verify facture exists
    const existing = await db.facture.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'Facture non trouvée' },
        { status: 404 }
      )
    }

    if (existing.statut === 'ANNULEE') {
      return NextResponse.json(
        { error: 'Cette facture est déjà annulée' },
        { status: 400 }
      )
    }

    if (existing.statut === 'PAYEE') {
      return NextResponse.json(
        { error: 'Impossible d\'annuler une facture déjà payée' },
        { status: 400 }
      )
    }

    const facture = await db.facture.update({
      where: { id },
      data: { statut: 'ANNULEE' },
      include: {
        abonnement: {
          select: {
            id: true,
            statut: true,
            plan: {
              select: {
                id: true,
                nom: true,
                type: true,
              },
            },
          },
        },
        etablissement: {
          select: {
            id: true,
            nom: true,
            ville: true,
          },
        },
      },
    })

    // Log audit
    await db.auditLog.create({
      data: {
        action: 'CANCEL_FACTURE',
        entite: 'Facture',
        entiteId: id,
        details: JSON.stringify({
          numero: existing.numero,
          ancienStatut: existing.statut,
          action: 'ANNULEE',
        }),
      },
    })

    return NextResponse.json({
      message: 'Facture annulée',
      facture: {
        ...facture,
        lignes: facture.lignes ? JSON.parse(facture.lignes) : [],
      },
    })
  } catch (error) {
    console.error('Error cancelling facture:', error)
    return NextResponse.json(
      { error: 'Erreur lors de l\'annulation de la facture' },
      { status: 500 }
    )
  }
}
