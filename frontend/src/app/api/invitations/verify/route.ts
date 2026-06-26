import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/invitations/verify — Verify an invitation token
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json(
        { error: 'Token requis' },
        { status: 400 }
      )
    }

    const invitation = await db.invitation.findUnique({
      where: { token },
      include: {
        Etablissement: { select: { id: true, nom: true } },
        Filiere: { select: { id: true, nom: true, code: true } },
      },
    })

    if (!invitation) {
      return NextResponse.json(
        { error: 'Token d\'invitation invalide', code: 'INVALID_TOKEN' },
        { status: 404 }
      )
    }

    // Check if invitation has already been used
    if (invitation.used) {
      return NextResponse.json(
        { error: 'Cette invitation a déjà été utilisée', code: 'ALREADY_USED', used: true },
        { status: 400 }
      )
    }

    // Check if invitation has expired
    if (invitation.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'Cette invitation a expiré', code: 'EXPIRED', expired: true },
        { status: 400 }
      )
    }

    // Get creator info
    const creator = await db.user.findUnique({
      where: { id: invitation.createdById },
      select: { name: true },
    })

    // Return invitation details without creating user (nested shape for frontend)
    return NextResponse.json({
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        name: invitation.name,
        etablissement: invitation.Etablissement
          ? { nom: invitation.Etablissement.nom, ville: null }
          : null,
        filiere: invitation.Filiere
          ? { nom: invitation.Filiere.nom, code: invitation.Filiere.code }
          : null,
        createdBy: creator ? { name: creator.name } : null,
        expiresAt: invitation.expiresAt.toISOString(),
        createdAt: invitation.createdAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('Error verifying invitation:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la vérification de l\'invitation' },
      { status: 500 }
    )
  }
}
