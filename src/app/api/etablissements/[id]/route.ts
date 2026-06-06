import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserFromRequest } from '@/lib/auth-helpers'

// GET /api/etablissements/[id] — Get single etablissement with details
// ADMIN: Only sees basic info unless they have an APPROUVE EtablissementAccess
// RESPONSABLE: Sees full details for their own establishment
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authUser = getUserFromRequest(request)

    if (!authUser) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // Fetch establishment basic info first
    const etablissement = await db.etablissement.findUnique({
      where: { id },
      include: {
        _count: { select: { filieres: true, users: true } },
        abonnements: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: { plan: { select: { nom: true } } },
        },
      },
    })

    if (!etablissement) {
      return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 404 })
    }

    // RESPONSABLE: Can see full details for their own establishment
    if (authUser.role === 'RESPONSABLE' && authUser.etablissementId === id) {
      const fullEtab = await db.etablissement.findUnique({
        where: { id },
        include: {
          filieres: {
            include: {
              _count: { select: { etudiants: true } },
              responsable: { select: { id: true, name: true, email: true } },
            },
          },
          users: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              actif: true,
            },
            take: 50,
          },
          _count: { select: { filieres: true, users: true } },
        },
      })
      return NextResponse.json({ etablissement: fullEtab })
    }

    // ADMIN: Check if they have authorized access
    if (authUser.role === 'ADMIN') {
      const accessRecord = await db.etablissementAccess.findFirst({
        where: {
          adminId: authUser.userId,
          etablissementId: id,
          statut: 'APPROUVE',
        },
      })

      if (accessRecord) {
        // Admin has authorized access — return full details
        const fullEtab = await db.etablissement.findUnique({
          where: { id },
          include: {
            filieres: {
              include: {
                _count: { select: { etudiants: true } },
                responsable: { select: { id: true, name: true, email: true } },
              },
            },
            users: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                actif: true,
              },
              take: 50,
            },
            _count: { select: { filieres: true, users: true } },
          },
        })
        return NextResponse.json({ etablissement: fullEtab, adminAccess: true })
      }

      // Admin has NO authorized access — return only metadata (no users, no filieres details)
      return NextResponse.json({
        etablissement: {
          id: etablissement.id,
          nom: etablissement.nom,
          type: etablissement.type,
          ville: etablissement.ville,
          pays: etablissement.pays,
          actif: etablissement.actif,
          createdAt: etablissement.createdAt,
          _count: etablissement._count,
          abonnements: etablissement.abonnements,
          adminAccess: false,
        },
        adminAccess: false,
      })
    }

    // Other roles: return basic info only
    return NextResponse.json({
      etablissement: {
        id: etablissement.id,
        nom: etablissement.nom,
        type: etablissement.type,
        ville: etablissement.ville,
        pays: etablissement.pays,
        actif: etablissement.actif,
        _count: etablissement._count,
      },
    })
  } catch (error) {
    console.error('Error fetching etablissement:', error)
    return NextResponse.json({ error: 'Erreur lors de la récupération' }, { status: 500 })
  }
}

// PATCH /api/etablissements/[id] — Update an etablissement
// ADMIN: Can update any etablissement (full access)
// RESPONSABLE: Can only update their own etablissement (restricted fields: no actif toggle)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authUser = getUserFromRequest(request)

    if (!authUser) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // RESPONSABLE: can only update their own establishment
    if (authUser.role === 'RESPONSABLE' && authUser.etablissementId !== id) {
      return NextResponse.json({ error: 'Vous ne pouvez modifier que votre propre établissement' }, { status: 403 })
    }

    // ENSEIGNANT / ETUDIANT: cannot update establishments
    if (authUser.role !== 'ADMIN' && authUser.role !== 'RESPONSABLE') {
      return NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 })
    }

    const body = await request.json()

    const data: Record<string, unknown> = {}
    if (body.nom !== undefined) data.nom = body.nom
    if (body.type !== undefined) data.type = body.type || null
    if (body.ville !== undefined) data.ville = body.ville || null
    if (body.adresse !== undefined) data.adresse = body.adresse || null
    if (body.telephone !== undefined) data.telephone = body.telephone || null
    if (body.email !== undefined) data.email = body.email || null
    if (body.siteWeb !== undefined) data.siteWeb = body.siteWeb || null
    if (body.formatMatricule !== undefined) data.formatMatricule = body.formatMatricule || null
    if (body.exempleMatricule !== undefined) data.exempleMatricule = body.exempleMatricule || null
    if (body.regexMatricule !== undefined) data.regexMatricule = body.regexMatricule || null

    // ADMIN-only fields
    if (authUser.role === 'ADMIN') {
      if (body.pays !== undefined) data.pays = body.pays
      if (body.actif !== undefined) data.actif = body.actif
    }

    const etablissement = await db.etablissement.update({
      where: { id },
      data,
      include: {
        _count: { select: { filieres: true, users: true } },
      },
    })

    // Log audit
    await db.auditLog.create({
      data: {
        userId: authUser.userId,
        action: 'UPDATE',
        entite: 'Etablissement',
        entiteId: id,
        details: JSON.stringify({ updatedFields: Object.keys(data), updatedBy: authUser.role }),
      },
    })

    return NextResponse.json({ etablissement })
  } catch (error) {
    console.error('Error updating etablissement:', error)
    return NextResponse.json({ error: 'Erreur lors de la mise à jour' }, { status: 500 })
  }
}

// DELETE /api/etablissements/[id] — Delete an etablissement (ADMIN only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = getUserFromRequest(request)

    if (!authUser || authUser.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Seul un administrateur peut supprimer un établissement' }, { status: 403 })
    }

    const { id } = await params

    const etablissement = await db.etablissement.delete({
      where: { id },
      select: { id: true, nom: true },
    })

    // Log audit
    await db.auditLog.create({
      data: {
        action: 'DELETE',
        entite: 'Etablissement',
        entiteId: id,
        details: JSON.stringify({ nom: etablissement.nom }),
      },
    })

    return NextResponse.json({ message: 'Établissement supprimé', etablissement })
  } catch (error) {
    console.error('Error deleting etablissement:', error)
    return NextResponse.json({ error: 'Erreur lors de la suppression' }, { status: 500 })
  }
}
