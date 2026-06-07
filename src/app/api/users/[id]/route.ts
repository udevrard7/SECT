import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { withAuth, AuthenticatedUser } from '@/lib/auth-session'

/**
 * Check if a RESPONSABLE user is authorized to manage a given target user.
 * A RESPONSABLE can only manage users who belong to the same establishment.
 *
 * Returns an error response (403) if unauthorized, or null if authorized.
 */
function checkUserOwnership(
  user: AuthenticatedUser,
  target: { etablissementId: string | null }
): NextResponse | null {
  if (user.role === 'ADMIN') {
    return null // ADMIN always has access
  }

  if (user.role === 'RESPONSABLE') {
    if (user.etablissementId !== target.etablissementId) {
      return NextResponse.json(
        { error: 'Accès refusé. Vous ne pouvez gérer que les étudiants de votre établissement.' },
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

// GET /api/users/[id] — Get a single user
async function _GET(
  _request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { id } = await context.params
    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        etablissementId: true,
        filiereId: true,
        image: true,
        actif: true,
        derniereConnexion: true,
        createdAt: true,
        updatedAt: true,
        etablissement: { select: { id: true, nom: true } },
        filiere: { select: { id: true, nom: true } },
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 })
    }

    return NextResponse.json({ user })
  } catch (error) {
    console.error('Error fetching user:', error)
    return NextResponse.json({ error: 'Erreur lors de la récupération' }, { status: 500 })
  }
}

// PATCH /api/users/[id] — Update a user
async function _PATCH(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { id } = await context.params
    const body = await request.json()

    // Get existing user first for ownership check
    const existing = await db.user.findUnique({
      where: { id },
      select: { id: true, etablissementId: true, role: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 })
    }

    // Ownership check: RESPONSABLE can only modify users in their establishment
    const ownershipError = checkUserOwnership(context.user, existing)
    if (ownershipError) return ownershipError

    // A RESPONSABLE cannot change a user's role to ADMIN
    if (context.user.role === 'RESPONSABLE' && body.role === 'ADMIN') {
      return NextResponse.json(
        { error: 'Accès refusé. Vous ne pouvez pas attribuer le rôle ADMIN.' },
        { status: 403 }
      )
    }

    const data: Record<string, unknown> = {}
    if (body.name !== undefined) data.name = body.name
    if (body.email !== undefined) data.email = body.email
    if (body.role !== undefined) data.role = body.role
    if (body.etablissementId !== undefined) data.etablissementId = body.etablissementId || null
    if (body.filiereId !== undefined) data.filiereId = body.filiereId || null
    if (body.actif !== undefined) data.actif = body.actif
    if (body.password) {
      data.password = await bcrypt.hash(body.password, 10)
    }

    const user = await db.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        etablissementId: true,
        filiereId: true,
        actif: true,
        etablissement: { select: { id: true, nom: true } },
        filiere: { select: { id: true, nom: true } },
      },
    })

    // Create audit log
    await db.auditLog.create({
      data: {
        action: 'UPDATE',
        entite: 'User',
        entiteId: id,
        userId: context.user.id,
        userEmail: context.user.email,
        details: JSON.stringify({ updatedFields: Object.keys(data) }),
      },
    })

    return NextResponse.json({ user })
  } catch (error) {
    console.error('Error updating user:', error)
    return NextResponse.json({ error: 'Erreur lors de la mise à jour' }, { status: 500 })
  }
}

// DELETE /api/users/[id] — Soft delete a user
async function _DELETE(
  _request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { id } = await context.params

    // Get existing user first for ownership check
    const existing = await db.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, etablissementId: true, role: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 })
    }

    // Ownership check: RESPONSABLE can only delete users in their establishment
    const ownershipError = checkUserOwnership(context.user, existing)
    if (ownershipError) return ownershipError

    // Count dependencies before deletion so the frontend can warn the user
    const [sessionsCount, reponsesCount, epreuvesCount, soumissionsCount] = await Promise.all([
      db.sessionPassation.count({ where: { etudiantId: id } }),
      db.reponse.count({ where: { session: { etudiantId: id } } }),
      db.epreuve.count({ where: { enseignantId: id, deletedAt: null } }),
      db.soumission.count({ where: { etudiantId: id } }),
    ])

    // Soft delete — set actif to false instead of permanently removing
    const user = await db.user.update({
      where: { id },
      data: { actif: false },
      select: { id: true, name: true, email: true, actif: true },
    })

    // Create audit log with dependency information
    await db.auditLog.create({
      data: {
        action: 'DELETE',
        entite: 'User',
        entiteId: id,
        userId: context.user.id,
        userEmail: context.user.email,
        details: JSON.stringify({
          name: existing.name,
          email: existing.email,
          permanent: false,
          dependencies: { sessionsCount, reponsesCount, epreuvesCount, soumissionsCount },
        }),
      },
    })

    return NextResponse.json({
      message: 'Utilisateur désactivé (suppression logique)',
      user,
      dependencies: {
        sessions: sessionsCount,
        reponses: reponsesCount,
        epreuves: epreuvesCount,
        soumissions: soumissionsCount,
      },
    })
  } catch (error) {
    console.error('Error deleting user:', error)
    return NextResponse.json({ error: 'Erreur lors de la suppression' }, { status: 500 })
  }
}

export const GET = withAuth(_GET, ['ADMIN', 'RESPONSABLE'])
export const PATCH = withAuth(_PATCH, ['ADMIN', 'RESPONSABLE'])
export const DELETE = withAuth(_DELETE, ['ADMIN', 'RESPONSABLE'])
