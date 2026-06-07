import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth, AuthenticatedUser } from '@/lib/auth-session'

const accessInclude = {
  admin: {
    select: { id: true, name: true, email: true },
  },
  etablissement: {
    select: { id: true, nom: true, ville: true, actif: true },
  },
}

// PATCH /api/etablissement-access/[id] — Update access record (approve, refuse, revoke)
async function _PATCH(
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) {
  try {
    const { id } = await context.params
    const { user } = context
    const body = await request.json()
    const { statut, approuvePar, commentaire, dateDebut, dateFin } = body

    // Validate statut
    const validStatuts = ['APPROUVE', 'REFUSE', 'EXPIRE']
    if (!statut || !validStatuts.includes(statut)) {
      return NextResponse.json(
        { error: `Statut invalide. Valeurs acceptées: ${validStatuts.join(', ')}` },
        { status: 400 }
      )
    }

    const existing = await db.etablissementAccess.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'Autorisation d\'accès non trouvée' },
        { status: 404 }
      )
    }

    // RESPONSABLE: must belong to the etablissement of the access record
    if (user.role === 'RESPONSABLE') {
      if (user.etablissementId !== existing.etablissementId) {
        return NextResponse.json(
          { error: 'Accès refusé. Vous ne pouvez approuver/refuser que les accès de votre établissement.' },
          { status: 403 }
        )
      }
    }
    // ADMIN: can approve/refuse any access record (no additional check needed)

    const updated = await db.etablissementAccess.update({
      where: { id },
      data: {
        statut,
        approuvePar: approuvePar || user.id,
        commentaire: commentaire || existing.commentaire,
        dateDebut: dateDebut ? new Date(dateDebut) : existing.dateDebut,
        dateFin: dateFin ? new Date(dateFin) : existing.dateFin,
      },
      include: accessInclude,
    })

    // Log audit
    await db.auditLog.create({
      data: {
        action: 'UPDATE',
        entite: 'EtablissementAccess',
        entiteId: id,
        userId: user.id,
        userEmail: user.email,
        details: JSON.stringify({ statut, approuvePar: approuvePar || user.id }),
      },
    })

    return NextResponse.json({ accessRecord: updated })
  } catch (error) {
    console.error('Error updating etablissement access:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour de l\'autorisation d\'accès' },
      { status: 500 }
    )
  }
}

export const PATCH = withAuth(_PATCH, ['ADMIN', 'RESPONSABLE'])
