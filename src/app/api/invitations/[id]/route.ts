import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/invitations/[id] — Get invitation details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const invitation = await db.invitation.findUnique({
      where: { id },
      include: {
        User: { select: { id: true, name: true, email: true } },
        Etablissement: { select: { id: true, nom: true } },
        Filiere: { select: { id: true, nom: true } },
      },
    })

    if (!invitation) {
      return NextResponse.json(
        { error: 'Invitation introuvable' },
        { status: 404 }
      )
    }

    return NextResponse.json({ invitation })
  } catch (error) {
    console.error('Error fetching invitation:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération de l\'invitation' },
      { status: 500 }
    )
  }
}

// DELETE /api/invitations/[id] — Cancel/delete an invitation (only if not used)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const invitation = await db.invitation.findUnique({ where: { id } })

    if (!invitation) {
      return NextResponse.json(
        { error: 'Invitation introuvable' },
        { status: 404 }
      )
    }

    if (invitation.used) {
      return NextResponse.json(
        { error: 'Impossible de supprimer une invitation déjà utilisée' },
        { status: 400 }
      )
    }

    await db.invitation.delete({ where: { id } })

    // Log audit
    await db.auditLog.create({
      data: {
        userId: invitation.createdById,
        action: 'DELETE',
        entite: 'Invitation',
        entiteId: invitation.id,
        details: JSON.stringify({ email: invitation.email, role: invitation.role }),
      },
    })

    return NextResponse.json(
      { message: 'Invitation supprimée avec succès' },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error deleting invitation:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la suppression de l\'invitation' },
      { status: 500 }
    )
  }
}
