import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Shared include for relations
const accessInclude = {
  admin: {
    select: { id: true, name: true, email: true },
  },
  etablissement: {
    select: { id: true, nom: true, ville: true, actif: true },
  },
}

// GET /api/etablissement-access — List all access records (for admin dashboard)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const adminId = searchParams.get('adminId') || ''
    const statut = searchParams.get('statut') || ''
    const etablissementId = searchParams.get('etablissementId') || ''

    const where: Record<string, unknown> = {}

    if (adminId) {
      where.adminId = adminId
    }

    if (statut) {
      const validStatuts = ['EN_ATTENTE', 'APPROUVE', 'REFUSE', 'EXPIRE']
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

    const accessRecords = await db.etablissementAccess.findMany({
      where,
      include: accessInclude,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ accessRecords })
  } catch (error) {
    console.error('Error fetching etablissement access records:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des autorisations d\'accès' },
      { status: 500 }
    )
  }
}

// POST /api/etablissement-access — Create a new access request
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      adminId,
      etablissementId,
      motif,
      dateDebut,
      dateFin,
      commentaire,
    } = body

    // Validate required fields
    if (!adminId || !etablissementId || !motif) {
      return NextResponse.json(
        { error: 'Les champs adminId, etablissementId et motif sont obligatoires' },
        { status: 400 }
      )
    }

    // Verify that the admin user exists and has ADMIN role
    const admin = await db.user.findUnique({
      where: { id: adminId },
    })
    if (!admin) {
      return NextResponse.json(
        { error: 'Utilisateur non trouvé' },
        { status: 404 }
      )
    }
    if (admin.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Seuls les utilisateurs avec le rôle ADMIN peuvent demander un accès' },
        { status: 403 }
      )
    }

    // Verify that the etablissement exists
    const etablissement = await db.etablissement.findUnique({
      where: { id: etablissementId },
    })
    if (!etablissement) {
      return NextResponse.json(
        { error: 'Établissement non trouvé' },
        { status: 404 }
      )
    }

    // Check that the combination adminId + etablissementId doesn't already exist
    const existingAccess = await db.etablissementAccess.findUnique({
      where: {
        adminId_etablissementId: { adminId, etablissementId },
      },
    })
    if (existingAccess) {
      return NextResponse.json(
        { error: 'Une autorisation d\'accès existe déjà pour cet admin et cet établissement' },
        { status: 409 }
      )
    }

    // Create the access record with statut EN_ATTENTE by default
    const accessRecord = await db.etablissementAccess.create({
      data: {
        adminId,
        etablissementId,
        motif,
        statut: 'EN_ATTENTE',
        dateDebut: dateDebut ? new Date(dateDebut) : null,
        dateFin: dateFin ? new Date(dateFin) : null,
        commentaire: commentaire || null,
      },
      include: accessInclude,
    })

    // Log audit
    await db.auditLog.create({
      data: {
        action: 'CREATE',
        entite: 'EtablissementAccess',
        entiteId: accessRecord.id,
        details: JSON.stringify({
          adminId,
          etablissementId,
          motif,
          statut: 'EN_ATTENTE',
        }),
      },
    })

    return NextResponse.json({ accessRecord }, { status: 201 })
  } catch (error) {
    console.error('Error creating etablissement access record:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la création de l\'autorisation d\'accès' },
      { status: 500 }
    )
  }
}
