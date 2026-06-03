import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/factures — List factures with filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const statut = searchParams.get('statut') || ''
    const etablissementId = searchParams.get('etablissementId') || ''
    const dateDebut = searchParams.get('dateDebut') || ''
    const dateFin = searchParams.get('dateFin') || ''
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const where: Record<string, unknown> = {}

    if (statut) {
      const validStatuts = ['EN_ATTENTE', 'PAYEE', 'EN_RETARD', 'ANNULEE']
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

    if (dateDebut || dateFin) {
      const dateFilter: Record<string, Date> = {}
      if (dateDebut) dateFilter.gte = new Date(dateDebut)
      if (dateFin) dateFilter.lte = new Date(dateFin)
      where.dateEmission = dateFilter
    }

    const [factures, total] = await Promise.all([
      db.facture.findMany({
        where,
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
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.facture.count({ where }),
    ])

    // Parse lignes JSON for each facture
    const parsedFactures = factures.map((f) => ({
      ...f,
      lignes: f.lignes ? JSON.parse(f.lignes) : [],
    }))

    return NextResponse.json({ factures: parsedFactures, total })
  } catch (error) {
    console.error('Error fetching factures:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des factures' },
      { status: 500 }
    )
  }
}

// POST /api/factures — Create a new facture
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      abonnementId,
      etablissementId,
      montantHt,
      tva,
      montantTtc,
      statut,
      dateEcheance,
      modePaiement,
      referencePaiement,
      lignes,
      notes,
    } = body

    // Validate required fields
    if (!abonnementId || !etablissementId || montantHt === undefined || montantTtc === undefined || !dateEcheance) {
      return NextResponse.json(
        { error: 'Les champs abonnementId, etablissementId, montantHt, montantTtc et dateEcheance sont obligatoires' },
        { status: 400 }
      )
    }

    // Verify abonnement exists
    const abonnement = await db.abonnement.findUnique({
      where: { id: abonnementId },
    })
    if (!abonnement) {
      return NextResponse.json(
        { error: 'Abonnement non trouvé' },
        { status: 404 }
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

    // Validate statut if provided
    const validStatuts = ['EN_ATTENTE', 'PAYEE', 'EN_RETARD', 'ANNULEE']
    const factureStatut = statut || 'EN_ATTENTE'
    if (!validStatuts.includes(factureStatut)) {
      return NextResponse.json(
        { error: `Statut invalide. Valeurs acceptées: ${validStatuts.join(', ')}` },
        { status: 400 }
      )
    }

    // Auto-generate numero: FAC-YYYY-NNN
    const currentYear = new Date().getFullYear()
    const lastFacture = await db.facture.findFirst({
      where: { numero: { startsWith: `FAC-${currentYear}-` } },
      orderBy: { numero: 'desc' },
    })
    let nextNumber = 1
    if (lastFacture) {
      const parts = lastFacture.numero.split('-')
      nextNumber = parseInt(parts[2]) + 1
    }
    const numero = `FAC-${currentYear}-${String(nextNumber).padStart(3, '0')}`

    // Serialize lignes as JSON string
    const lignesJson = lignes ? JSON.stringify(lignes) : '[]'

    const facture = await db.facture.create({
      data: {
        numero,
        abonnementId,
        etablissementId,
        montantHt: parseFloat(String(montantHt)),
        tva: tva !== undefined ? parseFloat(String(tva)) : 20.0,
        montantTtc: parseFloat(String(montantTtc)),
        statut: factureStatut,
        dateEcheance: new Date(dateEcheance),
        modePaiement: modePaiement || null,
        referencePaiement: referencePaiement || null,
        lignes: lignesJson,
        notes: notes || null,
      },
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
        action: 'CREATE_FACTURE',
        entite: 'Facture',
        entiteId: facture.id,
        details: JSON.stringify({
          numero,
          abonnementId,
          etablissementId,
          montantHt: parseFloat(String(montantHt)),
          montantTtc: parseFloat(String(montantTtc)),
          statut: factureStatut,
        }),
      },
    })

    return NextResponse.json({
      facture: {
        ...facture,
        lignes: JSON.parse(lignesJson),
      },
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating facture:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la création de la facture' },
      { status: 500 }
    )
  }
}
