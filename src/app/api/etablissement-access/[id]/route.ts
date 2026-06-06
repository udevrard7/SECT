import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const accessInclude = {
  admin: {
    select: { id: true, name: true, email: true },
  },
  etablissement: {
    select: { id: true, nom: true, ville: true, actif: true },
  },
}

// PATCH /api/etablissement-access/[id] — Update access record (approve, refuse, revoke)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    const updated = await db.etablissementAccess.update({
      where: { id },
      data: {
        statut,
        approuvePar: approuvePar || null,
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
        details: JSON.stringify({ statut, approuvePar }),
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
