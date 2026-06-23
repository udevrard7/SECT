import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createId } from '@paralleldrive/cuid2'
import { withAuth, AuthenticatedUser } from '@/lib/auth-session'
import { resolveTenantFilter, requireAdminEtablissementAccess } from '@/lib/tenant-access'

// Valid status transitions for Devoir
const VALID_TRANSITIONS: Record<string, string[]> = {
  BROUILLON: ['PUBLIE'],
  PUBLIE: ['FERME'],
  FERME: ['ARCHIVE'],
  ARCHIVE: [],
}

/** Safe JSON.parse that returns fallback instead of throwing */
function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

/**
 * Vérifie que l'utilisateur a le droit d'accéder à ce devoir.
 * - ADMIN : doit avoir EtablissementAccess pour l'établissement de l'UE du devoir.
 * - RESPONSABLE : le devoir doit être dans son établissement.
 * - ENSEIGNANT : doit être le créateur du devoir.
 */
async function canUserAccessDevoir(
  user: AuthenticatedUser,
  devoir: { enseignantId: string; UniteEnseignement?: { filiere?: { etablissementId: string | null } | null } | null }
): Promise<boolean> {
  if (user.role === 'ADMIN') {
    const etablissementId = devoir.UniteEnseignement?.filiere?.etablissementId
    if (!etablissementId) return false
    const err = await requireAdminEtablissementAccess(user, etablissementId)
    return !err
  }
  if (user.role === 'ENSEIGNANT') {
    return devoir.enseignantId === user.id
  }
  if (user.role === 'RESPONSABLE') {
    const etablissementId = devoir.UniteEnseignement?.filiere?.etablissementId
    return !!etablissementId && etablissementId === user.etablissementId
  }
  return false
}

// GET /api/devoirs/[id] — Détail d'un devoir (+ soumissions si enseignant)
async function _GET(
  request: NextRequest,
  context: { params: { id: string }; user: AuthenticatedUser }
) {
  try {
    const { id } = context.params
    const { user } = context

    // Pour un étudiant, on ne renvoie PAS les soumissions des autres étudiants.
    const isStudent = user.role === 'ETUDIANT'

    const devoir = await db.devoir.findUnique({
      where: { id },
      include: {
        User: { select: { id: true, name: true, email: true } },
        UniteEnseignement: {
          select: {
            id: true,
            code: true,
            nom: true,
            niveau: true,
            semestre: true,
            filiere: { select: { id: true, nom: true, etablissementId: true } },
          },
        },
        GrilleEvaluation: true,
        ...(isStudent
          ? // Pour l'étudiant, on ne joint que SA soumission
            {
              Soumission: {
                where: { etudiantId: user.id },
                take: 1,
              },
            }
          : {
              Soumission: {
                include: {
                  User: { select: { id: true, name: true, email: true, matricule: true } },
                },
                orderBy: { renduAt: 'desc' },
              },
            }),
      },
    })

    if (!devoir || devoir.deletedAt) {
      return NextResponse.json({ error: 'Devoir non trouvé' }, { status: 404 })
    }

    // ─── RBAC ───
    const hasAccess = await canUserAccessDevoir(user, {
      enseignantId: devoir.enseignantId,
      UniteEnseignement: devoir.UniteEnseignement as never,
    })
    if (!hasAccess) {
      // Pour un étudiant : on vérifie qu'il est bien inscrit dans la filière de l'UE
      if (isStudent) {
        const student = await db.user.findUnique({
          where: { id: user.id },
          select: { filiereId: true },
        })
        const devoirFiliereId = devoir.UniteEnseignement?.filiere?.id
        if (!student?.filiereId || student.filiereId !== devoirFiliereId) {
          return NextResponse.json(
            { error: 'Accès refusé.' },
            { status: 403 }
          )
        }
        // Et le devoir doit être PUBLIE ou FERME
        if (!['PUBLIE', 'FERME'].includes(devoir.statut)) {
          return NextResponse.json(
            { error: 'Devoir non accessible.' },
            { status: 403 }
          )
        }
      } else {
        return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 })
      }
    }

    // Parse JSON fields safely
    const parsed = {
      ...devoir,
      renduFichiers: safeJsonParse(devoir.renduFichiers, null),
      GrilleEvaluation: devoir.GrilleEvaluation
        ? {
            ...devoir.GrilleEvaluation,
            criteres: safeJsonParse(devoir.GrilleEvaluation.criteres, null),
          }
        : null,
      Soumission: devoir.Soumission.map((s) => ({
        ...s,
        fichiersSoumis: safeJsonParse(s.fichiersSoumis, null),
        rapportPlagiat: safeJsonParse(s.rapportPlagiat, null),
        historiqueVersions: safeJsonParse(s.historiqueVersions, null),
      })),
    }

    return NextResponse.json({ devoir: parsed })
  } catch (error) {
    console.error('Get devoir error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération du devoir' },
      { status: 500 }
    )
  }
}

// PATCH /api/devoirs/[id] — Mise à jour / action (publier/fermer/archiver)
async function _PATCH(
  request: NextRequest,
  context: { params: { id: string }; user: AuthenticatedUser }
) {
  try {
    const { id } = context.params
    const { user } = context
    const body = await request.json()
    const { action, ...data } = body

    const existing = await db.devoir.findUnique({
      where: { id },
      include: {
        UniteEnseignement: {
          select: { filiere: { select: { etablissementId: true } } },
        },
      },
    })
    if (!existing || existing.deletedAt) {
      return NextResponse.json({ error: 'Devoir non trouvé' }, { status: 404 })
    }

    // ─── RBAC : seul l'enseignant créateur (ou admin/responsable du tenant) peut modifier ───
    const hasAccess = await canUserAccessDevoir(user, {
      enseignantId: existing.enseignantId,
      UniteEnseignement: existing.UniteEnseignement as never,
    })
    if (!hasAccess) {
      return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 })
    }

    // ─── Actions de transition de statut ───
    if (action === 'publier') {
      if (!VALID_TRANSITIONS[existing.statut]?.includes('PUBLIE')) {
        return NextResponse.json(
          { error: `Transition impossible de ${existing.statut} vers PUBLIE` },
          { status: 400 }
        )
      }
      const devoir = await db.devoir.update({
        where: { id },
        data: { statut: 'PUBLIE', datePublication: new Date(), updatedAt: new Date() },
      })
      await logAudit(user, 'PUBLIER_DEVOIR', id, existing.titre)
      return NextResponse.json({
        devoir: { ...devoir, renduFichiers: safeJsonParse(devoir.renduFichiers, null) },
        message: 'Devoir publié',
      })
    }

    if (action === 'fermer') {
      if (!VALID_TRANSITIONS[existing.statut]?.includes('FERME')) {
        return NextResponse.json(
          { error: `Transition impossible de ${existing.statut} vers FERME` },
          { status: 400 }
        )
      }
      const devoir = await db.devoir.update({
        where: { id },
        data: { statut: 'FERME', updatedAt: new Date() },
      })
      await logAudit(user, 'FERMER_DEVOIR', id, existing.titre)
      return NextResponse.json({
        devoir: { ...devoir, renduFichiers: safeJsonParse(devoir.renduFichiers, null) },
        message: 'Devoir fermé',
      })
    }

    if (action === 'archiver') {
      if (!VALID_TRANSITIONS[existing.statut]?.includes('ARCHIVE')) {
        return NextResponse.json(
          { error: `Transition impossible de ${existing.statut} vers ARCHIVE` },
          { status: 400 }
        )
      }
      const devoir = await db.devoir.update({
        where: { id },
        data: { statut: 'ARCHIVE', updatedAt: new Date() },
      })
      await logAudit(user, 'ARCHIVER_DEVOIR', id, existing.titre)
      return NextResponse.json({
        devoir: { ...devoir, renduFichiers: safeJsonParse(devoir.renduFichiers, null) },
        message: 'Devoir archivé',
      })
    }

    // ─── Mise à jour générale ───
    const updateData: Record<string, unknown> = {}
    if (data.titre !== undefined) updateData.titre = data.titre
    if (data.description !== undefined) updateData.description = data.description
    if (data.consignes !== undefined) updateData.consignes = data.consignes
    if (data.typeSeance !== undefined) updateData.typeSeance = data.typeSeance
    if (data.datePublication !== undefined)
      updateData.datePublication = data.datePublication ? new Date(data.datePublication) : null
    if (data.dateLimite !== undefined) updateData.dateLimite = new Date(data.dateLimite)
    if (data.noteMax !== undefined) updateData.noteMax = data.noteMax
    if (data.renduFichiers !== undefined)
      updateData.renduFichiers = data.renduFichiers != null ? JSON.stringify(data.renduFichiers) : null
    if (data.soumissionGroupe !== undefined) updateData.soumissionGroupe = data.soumissionGroupe
    if (data.nbMaxFichiers !== undefined) updateData.nbMaxFichiers = data.nbMaxFichiers
    if (data.tailleMaxFichier !== undefined) updateData.tailleMaxFichier = data.tailleMaxFichier
    if (data.anneeUniversitaire !== undefined) updateData.anneeUniversitaire = data.anneeUniversitaire
    // Corrige le bug : updatedAt désormais toujours mis à jour
    updateData.updatedAt = new Date()

    if (data.statut !== undefined) {
      if (!VALID_TRANSITIONS[existing.statut]?.includes(data.statut)) {
        return NextResponse.json(
          { error: `Transition impossible de ${existing.statut} vers ${data.statut}` },
          { status: 400 }
        )
      }
      updateData.statut = data.statut
    }

    const devoir = await db.devoir.update({
      where: { id },
      data: updateData,
      include: {
        User: { select: { id: true, name: true, email: true } },
        UniteEnseignement: { select: { id: true, code: true, nom: true } },
      },
    })

    await logAudit(user, 'UPDATE_DEVOIR', id, existing.titre)

    return NextResponse.json({
      devoir: { ...devoir, renduFichiers: safeJsonParse(devoir.renduFichiers, null) },
      message: 'Devoir mis à jour',
    })
  } catch (error) {
    console.error('Update devoir error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour du devoir' },
      { status: 500 }
    )
  }
}

// DELETE /api/devoirs/[id] — Soft delete (corbeille)
async function _DELETE(
  request: NextRequest,
  context: { params: { id: string }; user: AuthenticatedUser }
) {
  try {
    const { id } = context.params
    const { user } = context

    const existing = await db.devoir.findUnique({
      where: { id },
      include: {
        UniteEnseignement: {
          select: { filiere: { select: { etablissementId: true } } },
        },
      },
    })
    if (!existing || existing.deletedAt) {
      return NextResponse.json({ error: 'Devoir non trouvé' }, { status: 404 })
    }

    const hasAccess = await canUserAccessDevoir(user, {
      enseignantId: existing.enseignantId,
      UniteEnseignement: existing.UniteEnseignement as never,
    })
    if (!hasAccess) {
      return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 })
    }

    if (existing.statut === 'PUBLIE') {
      return NextResponse.json(
        { error: 'Impossible de supprimer un devoir publié' },
        { status: 400 }
      )
    }

    await db.devoir.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    // Corrige le bug : audit log avec l'utilisateur connecté (pas 'system')
    await logAudit(user, 'SOFT_DELETE_DEVOIR', id, existing.titre)

    return NextResponse.json({ message: 'Devoir déplacé vers la corbeille' })
  } catch (error) {
    console.error('Delete devoir error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la suppression du devoir' },
      { status: 500 }
    )
  }
}

/** Helper : écrit un AuditLog avec l'utilisateur connecté */
async function logAudit(
  user: AuthenticatedUser,
  action: string,
  entiteId: string,
  titre: string
) {
  try {
    await db.auditLog.create({
      data: {
        userId: user.id,
        userEmail: user.email,
        action,
        entite: 'Devoir',
        entiteId,
        details: `${action} — ${titre}`,
      },
    })
  } catch (e) {
    console.error('Audit log error:', e)
  }
}

// withAuth : tous les rôles peuvent GET (étudiant volet limité), mais PATCH/DELETE restreints
export const GET = withAuth(_GET, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT', 'ETUDIANT'])
export const PATCH = withAuth(_PATCH, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT'])
export const DELETE = withAuth(_DELETE, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT'])

// Utilisé pour éviter les warnings unused
void createId
void resolveTenantFilter
