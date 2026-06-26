import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import crypto from 'crypto'

// PATCH /api/invitations/[id]/renvoyer — Resend/refresh an invitation
export async function PATCH(
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

    if (invitation.used) {
      return NextResponse.json(
        { error: 'Impossible de renvoyer une invitation déjà utilisée' },
        { status: 400 }
      )
    }

    // Regenerate token and reset expiry to 48 hours
    const newToken = crypto.randomUUID()
    const newExpiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) // 48 hours from now

    const updatedInvitation = await db.invitation.update({
      where: { id },
      data: {
        token: newToken,
        expiresAt: newExpiresAt,
      },
      include: {
        User: { select: { id: true, name: true, email: true } },
        Etablissement: { select: { id: true, nom: true } },
        Filiere: { select: { id: true, nom: true } },
      },
    })

    // Log audit
    await db.auditLog.create({
      data: {
        userId: invitation.createdById,
        action: 'RESEND_INVITATION',
        entite: 'Invitation',
        entiteId: invitation.id,
        details: JSON.stringify({
          email: invitation.email,
          role: invitation.role,
          previousToken: invitation.token,
          newToken,
        }),
      },
    })

    // In a real app, send invitation email with the new token link.
    // For testing, include the token in the response.
    return NextResponse.json({
      invitation: updatedInvitation,
      token: newToken,
      message: 'Invitation renvoyée avec succès',
    })
  } catch (error) {
    console.error('Error resending invitation:', error)
    return NextResponse.json(
      { error: 'Erreur lors du renvoi de l\'invitation' },
      { status: 500 }
    )
  }
}
