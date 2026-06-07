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

// DELETE /api/users/[id] — Hard delete a user permanently
//
// This is a TRUE permanent deletion from the database.
// All associated data is removed in the correct order to respect FK constraints.
//
// CRITICAL ORDERING (PostgreSQL RESTRICT is the default when no onDelete is set):
//
//   1. Resultat → SessionPassation (NO cascade) → must delete Resultats FIRST
//   2. SessionPassation → Epreuve (NO cascade) → must delete sessions BEFORE epreuves
//   3. Epreuve → User (NO cascade) → must delete epreuves BEFORE user
//   4. Soumission → User (NO cascade) → must delete soumissions BEFORE user
//   5. Devoir → User (NO cascade) → must delete devoirs BEFORE user
//   6. Invitation → User (NO cascade) → must delete invitations BEFORE user
//   7. Alerte.userId (nullable) → set NULL
//   8. NotificationAdmin.destinataireId (nullable) → set NULL
//   9. Filiere.responsableId (nullable) → set NULL
//  10. Cascade-auto-deleted: EnseignantFiliere, Affectation, Document, PasswordReset, EtablissementAccess
//
// This is distinct from the "deactivate" action (PATCH { actif: false }) which
// only archives the account — the student/teacher stays linked to the establishment,
// data is preserved, but hidden from the default view.
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

    // Count dependencies BEFORE deletion for the audit log and response
    const [sessionsCount, reponsesCount, epreuvesCount, soumissionsCount, devoirsCount, alertesCount, invitationsCount, notificationsCount, resultatsCount] = await Promise.all([
      db.sessionPassation.count({ where: { etudiantId: id } }),
      db.reponse.count({ where: { session: { etudiantId: id } } }),
      db.epreuve.count({ where: { enseignantId: id } }),
      db.soumission.count({ where: { etudiantId: id } }),
      db.devoir.count({ where: { enseignantId: id } }),
      db.alerte.count({ where: { userId: id } }),
      db.invitation.count({ where: { createdById: id } }),
      db.notificationAdmin.count({ where: { destinataireId: id } }),
      db.resultat.count({ where: { session: { etudiantId: id } } }),
    ])

    // ─── Step 1: Delete student's Resultats (must be before SessionPassation) ───
    // Resultat → SessionPassation has NO onDelete: Cascade
    if (sessionsCount > 0) {
      const studentSessionIds = (await db.sessionPassation.findMany({
        where: { etudiantId: id },
        select: { id: true },
      })).map((s) => s.id)

      if (studentSessionIds.length > 0) {
        await db.resultat.deleteMany({ where: { sessionId: { in: studentSessionIds } } })
      }
    }

    // ─── Step 2: Delete student's SessionPassations (→ cascades Reponses) ───
    if (sessionsCount > 0) {
      await db.sessionPassation.deleteMany({ where: { etudiantId: id } })
    }

    // ─── Step 3: Delete teacher's epreuves (with their dependent records) ───
    // Epreuve → User has NO onDelete. Must delete sessions of those epreuves first.
    if (epreuvesCount > 0) {
      const teacherEpreuveIds = (await db.epreuve.findMany({
        where: { enseignantId: id },
        select: { id: true },
      })).map((e) => e.id)

      if (teacherEpreuveIds.length > 0) {
        // Delete Resultats for sessions of these epreuves
        const epreuveSessionIds = (await db.sessionPassation.findMany({
          where: { epreuveId: { in: teacherEpreuveIds } },
          select: { id: true },
        })).map((s) => s.id)

        if (epreuveSessionIds.length > 0) {
          await db.resultat.deleteMany({ where: { sessionId: { in: epreuveSessionIds } } })
          // Delete those sessions (→ cascades Reponses)
          await db.sessionPassation.deleteMany({ where: { id: { in: epreuveSessionIds } } })
        }

        // Now safe to delete epreuves (EpreuveDocument, EpreuveQuestion, Alerte cascade)
        await db.epreuve.deleteMany({ where: { enseignantId: id } })
      }
    }

    // ─── Step 4: Delete student's Soumissions ───
    if (soumissionsCount > 0) {
      await db.soumission.deleteMany({ where: { etudiantId: id } })
    }

    // ─── Step 5: Delete teacher's Devoirs (→ cascades Soumissions + GrilleEvaluation) ───
    if (devoirsCount > 0) {
      await db.devoir.deleteMany({ where: { enseignantId: id } })
    }

    // ─── Step 6: Delete invitations created by this user ───
    if (invitationsCount > 0) {
      await db.invitation.deleteMany({ where: { createdById: id } })
    }

    // ─── Step 7: Set NULL on records with NULLABLE FKs pointing to this user ───
    if (alertesCount > 0) {
      await db.alerte.updateMany({ where: { userId: id }, data: { userId: null } })
    }
    if (notificationsCount > 0) {
      await db.notificationAdmin.updateMany({ where: { destinataireId: id }, data: { destinataireId: null } })
    }
    await db.filiere.updateMany({ where: { responsableId: id }, data: { responsableId: null } })

    // ─── Step 8: Hard delete the user ───
    // Cascade-deleted automatically: EnseignantFiliere, Affectation, Document (+ EpreuveDocument),
    // PasswordReset, EtablissementAccess
    await db.user.delete({ where: { id } })

    // ─── Audit log ───
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
          role: existing.role,
          permanent: true,
          reason: 'Suppression définitive avec toutes les données associées',
          deletedDependencies: {
            sessions: sessionsCount,
            reponses: reponsesCount,
            resultats: resultatsCount,
            epreuves: epreuvesCount,
            soumissions: soumissionsCount,
            devoirs: devoirsCount,
            alertes: alertesCount,
            invitations: invitationsCount,
            notifications: notificationsCount,
          },
        }),
      },
    })

    return NextResponse.json({
      mode: 'permanent',
      message: 'Utilisateur supprimé définitivement avec toutes ses données',
      deletedDependencies: {
        sessions: sessionsCount,
        reponses: reponsesCount,
        resultats: resultatsCount,
        epreuves: epreuvesCount,
        soumissions: soumissionsCount,
        devoirs: devoirsCount,
        alertes: alertesCount,
        invitations: invitationsCount,
        notifications: notificationsCount,
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
