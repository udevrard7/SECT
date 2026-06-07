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
        matricule: true,
        niveau: true,
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

    // Handle matricule update with uniqueness check
    if (body.matricule !== undefined) {
      const newMatricule = body.matricule || null
      // Check uniqueness if a non-null matricule is being set or changed
      if (newMatricule) {
        const existingMatricule = await db.user.findUnique({ where: { matricule: newMatricule } })
        if (existingMatricule && existingMatricule.id !== id) {
          return NextResponse.json(
            { error: 'Ce matricule est déjà utilisé par un autre étudiant.' },
            { status: 409 }
          )
        }
      }
      data.matricule = newMatricule
    }

    // Handle niveau update
    if (body.niveau !== undefined) {
      data.niveau = body.niveau || null
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
        matricule: true,
        niveau: true,
        etablissement: { select: { id: true, nom: true } },
        filiere: { select: { id: true, nom: true, code: true } },
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

// DELETE /api/users/[id] — Delete a user
// Strategy:
//   • If the user has NO blocking dependencies → hard delete (permanent removal from DB)
//   • If the user HAS blocking dependencies (sessions, soumissions, etc.) →
//     remove from establishment (clear etablissementId, filiereId, matricule, set actif: false)
//     This preserves historical data while removing the student from the responsable's view.
//   • This is distinct from the "deactivate" action (PATCH { actif: false }) which only
//     disables the account but keeps the student linked to the establishment.
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

    // Count blocking dependencies before deletion
    const [sessionsCount, reponsesCount, epreuvesCount, soumissionsCount, devoirsCount, alertesCount, invitationsCount, notificationsCount] = await Promise.all([
      db.sessionPassation.count({ where: { etudiantId: id } }),
      db.reponse.count({ where: { session: { etudiantId: id } } }),
      db.epreuve.count({ where: { enseignantId: id, deletedAt: null } }),
      db.soumission.count({ where: { etudiantId: id } }),
      db.devoir.count({ where: { enseignantId: id } }),
      db.alerte.count({ where: { userId: id } }),
      db.invitation.count({ where: { createdById: id } }),
      db.notificationAdmin.count({ where: { destinataireId: id } }),
    ])

    const hasBlockingDeps =
      sessionsCount > 0 || soumissionsCount > 0 || epreuvesCount > 0 ||
      devoirsCount > 0 || alertesCount > 0 || invitationsCount > 0 || notificationsCount > 0

    if (!hasBlockingDeps) {
      // ─── Hard delete: no dependencies, safe to permanently remove ───
      // Cascade-deleted automatically: EnseignantFiliere, Affectation, Document (+ EpreuveDocument), EtablissementAccess, PasswordReset
      await db.user.delete({ where: { id } })

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
            permanent: true,
            reason: 'Aucune dépendance bloquante — suppression définitive',
          }),
        },
      })

      return NextResponse.json({
        mode: 'permanent',
        message: 'Utilisateur supprimé définitivement',
        dependencies: {
          sessions: sessionsCount,
          reponses: reponsesCount,
          epreuves: epreuvesCount,
          soumissions: soumissionsCount,
        },
      })
    }

    // ─── Soft removal from establishment: has dependencies, preserve historical data ───
    // Clear etablissementId + filiereId so the student disappears from the responsable's view,
    // but keep the user record so existing sessions/reponses/soumissions remain intact.
    const user = await db.user.update({
      where: { id },
      data: {
        actif: false,
        etablissementId: null,
        filiereId: null,
        matricule: null,
      },
      select: { id: true, name: true, email: true, actif: true },
    })

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
          mode: 'remove_from_establishment',
          reason: 'Dépendances existantes — retrait de l\'établissement avec conservation des données',
          dependencies: { sessionsCount, reponsesCount, epreuvesCount, soumissionsCount, devoirsCount, alertesCount, invitationsCount, notificationsCount },
        }),
      },
    })

    return NextResponse.json({
      mode: 'removed_from_establishment',
      message: 'Étudiant retiré de l\'établissement (données historiques conservées)',
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
