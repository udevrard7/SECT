import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth, AuthenticatedUser } from '@/lib/auth-session'

// GET /api/etablissement-access/authorized-etablissements — Get all establishments the admin is authorized to access
async function _GET(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { user } = context
    const { searchParams } = new URL(request.url)
    const adminId = searchParams.get('adminId') || ''

    if (!adminId) {
      return NextResponse.json(
        { error: 'Le paramètre adminId est obligatoire' },
        { status: 400 }
      )
    }

    // Verify that the requested adminId matches the authenticated user's ID
    if (adminId !== user.id) {
      return NextResponse.json(
        { error: 'Accès refusé. Vous ne pouvez consulter que vos propres établissements autorisés.' },
        { status: 403 }
      )
    }

    const now = new Date()

    // Find all APPROUVE access records for this admin
    // where dateDebut is null or <= now, and dateFin is null or >= now
    const accessRecords = await db.etablissementAccess.findMany({
      where: {
        adminId,
        statut: 'APPROUVE',
        OR: [
          { dateDebut: null },
          { dateDebut: { lte: now } },
        ],
      },
      include: {
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
      orderBy: { createdAt: 'desc' },
    })

    // Filter out records where dateFin has passed
    const activeRecords = accessRecords.filter(
      (record) => !record.dateFin || record.dateFin >= now
    )

    // Build the response with establishment + access details
    const etablissements = activeRecords.map((record) => ({
      ...record.etablissement,
      access: {
        id: record.id,
        motif: record.motif,
        dateDebut: record.dateDebut,
        dateFin: record.dateFin,
        commentaire: record.commentaire,
        createdAt: record.createdAt,
      },
    }))

    return NextResponse.json({ etablissements })
  } catch (error) {
    console.error('Error fetching authorized etablissements:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des établissements autorisés' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(_GET, ['ADMIN'])
