import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth, AuthenticatedUser } from '@/lib/auth-session'

/**
 * Check if a RESPONSABLE user is authorized to manage a given filière.
 * A RESPONSABLE can only manage filières where they are the designated responsable
 * OR where they belong to the same establishment.
 *
 * Returns an error response (403) if unauthorized, or null if authorized.
 */
function checkFiliereOwnership(
  user: AuthenticatedUser,
  filiere: { responsableId: string | null; etablissementId: string }
): NextResponse | null {
  if (user.role === 'ADMIN') {
    return null // ADMIN always has access
  }

  if (user.role === 'RESPONSABLE') {
    const isResponsable = user.id === filiere.responsableId
    const sameEtablissement = user.etablissementId === filiere.etablissementId

    if (!isResponsable && !sameEtablissement) {
      return NextResponse.json(
        {
          error:
            'Accès refusé. Vous n\'êtes pas le responsable de cette filière et n\'appartenez pas au même établissement.',
        },
        { status: 403 }
      )
    }

    return null
  }

  // Other roles should not reach here due to withAuth role filtering,
  // but defensively deny access.
  return NextResponse.json(
    { error: 'Accès refusé. Rôle non autorisé pour cette action.' },
    { status: 403 }
  )
}

async function _GET(
  _request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { id } = await context.params

    const filiere = await db.filiere.findUnique({
      where: { id },
      include: {
        etablissement: {
          select: { id: true, nom: true, type: true, ville: true, pays: true },
        },
        responsable: {
          select: { id: true, name: true, email: true },
        },
        etudiants: {
          select: {
            id: true,
            name: true,
            email: true,
            actif: true,
            createdAt: true,
          },
          orderBy: { name: 'asc' },
        },
        _count: {
          select: { etudiants: true },
        },
      },
    })

    if (!filiere) {
      return NextResponse.json(
        { error: 'Filière non trouvée' },
        { status: 404 }
      )
    }

    return NextResponse.json(filiere)
  } catch (error) {
    console.error('Error getting filiere:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération de la filière' },
      { status: 500 }
    )
  }
}

async function _PATCH(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { id } = await context.params
    const body = await request.json()
    const { nom, code, etablissementId, responsableId, description, nbEtudiants, actif } = body

    const existing = await db.filiere.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'Filière non trouvée' },
        { status: 404 }
      )
    }

    // Ownership check: RESPONSABLE can only edit filières they own or belong to their establishment
    const ownershipError = checkFiliereOwnership(context.user, existing)
    if (ownershipError) return ownershipError

    // Check unique constraint if name or etablissementId changed
    if ((nom && nom !== existing.nom) || (etablissementId && etablissementId !== existing.etablissementId)) {
      const duplicate = await db.filiere.findFirst({
        where: {
          nom: nom || existing.nom,
          etablissementId: etablissementId || existing.etablissementId,
          id: { not: id },
        },
      })
      if (duplicate) {
        return NextResponse.json(
          { error: 'Une filière avec ce nom existe déjà dans cet établissement' },
          { status: 409 }
        )
      }
    }

    const data: Record<string, unknown> = {}
    if (nom !== undefined) data.nom = nom
    if (code !== undefined) data.code = code
    if (etablissementId !== undefined) data.etablissementId = etablissementId
    if (responsableId !== undefined) data.responsableId = responsableId
    if (description !== undefined) data.description = description
    if (nbEtudiants !== undefined) data.nbEtudiants = nbEtudiants
    if (actif !== undefined) data.actif = actif

    const filiere = await db.filiere.update({
      where: { id },
      data,
      include: {
        etablissement: { select: { id: true, nom: true } },
        responsable: { select: { id: true, name: true, email: true } },
      },
    })

    // Create audit log
    await db.auditLog.create({
      data: {
        action: 'UPDATE',
        entite: 'Filiere',
        entiteId: id,
        userId: context.user.id,
        userEmail: context.user.email,
        details: JSON.stringify({ updatedFields: Object.keys(data) }),
      },
    })

    return NextResponse.json(filiere)
  } catch (error) {
    console.error('Error updating filiere:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour de la filière' },
      { status: 500 }
    )
  }
}

async function _DELETE(
  _request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { id } = await context.params

    const existing = await db.filiere.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'Filière non trouvée' },
        { status: 404 }
      )
    }

    // Ownership check: RESPONSABLE can only delete filières they own or belong to their establishment
    const ownershipError = checkFiliereOwnership(context.user, existing)
    if (ownershipError) return ownershipError

    // Count dependencies before deletion so the frontend can warn the user
    const [epreuvesCount, etudiantsCount, ueCount] = await Promise.all([
      db.epreuve.count({ where: { filiereId: id, deletedAt: null } }),
      db.user.count({ where: { filiereId: id } }),
      db.uniteEnseignement.count({ where: { filiereId: id, actif: true } }),
    ])

    // Soft delete
    const filiere = await db.filiere.update({
      where: { id },
      data: { actif: false },
    })

    // Create audit log with dependency information
    await db.auditLog.create({
      data: {
        action: 'DELETE',
        entite: 'Filiere',
        entiteId: id,
        userId: context.user.id,
        userEmail: context.user.email,
        details: JSON.stringify({
          nom: existing.nom,
          permanent: false,
          dependencies: { epreuvesCount, etudiantsCount, ueCount },
        }),
      },
    })

    return NextResponse.json({
      message: 'Filière désactivée (suppression logique)',
      filiere,
      dependencies: {
        epreuves: epreuvesCount,
        etudiants: etudiantsCount,
        unitesEnseignement: ueCount,
      },
    })
  } catch (error) {
    console.error('Error deleting filiere:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la suppression de la filière' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(_GET, ['ADMIN', 'RESPONSABLE'])
export const PATCH = withAuth(_PATCH, ['ADMIN', 'RESPONSABLE'])
export const DELETE = withAuth(_DELETE, ['ADMIN', 'RESPONSABLE'])
