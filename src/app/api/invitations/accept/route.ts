import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'

// POST /api/invitations/accept — Accept an invitation
export async function POST(request: NextRequest) {
  try {
    const { token, password, name } = await request.json()

    if (!token || !password) {
      return NextResponse.json(
        { error: 'Token et mot de passe requis' },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Le mot de passe doit contenir au moins 8 caractères' },
        { status: 400 }
      )
    }

    // Validate password complexity
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      return NextResponse.json(
        { error: 'Le mot de passe doit contenir au moins une majuscule, une minuscule, un chiffre et un caractère spécial' },
        { status: 400 }
      )
    }

    // Find invitation by token
    const invitation = await db.invitation.findUnique({
      where: { token },
    })

    if (!invitation) {
      return NextResponse.json(
        { error: 'Token d\'invitation invalide' },
        { status: 404 }
      )
    }

    // Check if invitation has already been used
    if (invitation.used) {
      return NextResponse.json(
        { error: 'Cette invitation a déjà été utilisée' },
        { status: 400 }
      )
    }

    // Check if invitation has expired
    if (invitation.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'Cette invitation a expiré' },
        { status: 400 }
      )
    }

    // Check if a user with this email already exists
    const existingUser = await db.user.findUnique({
      where: { email: invitation.email },
    })
    if (existingUser) {
      return NextResponse.json(
        { error: 'Un utilisateur avec cet email existe déjà' },
        { status: 409 }
      )
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Create user and mark invitation as used in a transaction
    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: invitation.email,
          name: name || invitation.name || invitation.email.split('@')[0],
          password: hashedPassword,
          role: invitation.role,
          etablissementId: invitation.etablissementId,
          filiereId: invitation.filiereId,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          etablissementId: true,
          filiereId: true,
          actif: true,
          createdAt: true,
          etablissement: { select: { id: true, nom: true } },
          filiere: { select: { id: true, nom: true } },
        },
      })

      await tx.invitation.update({
        where: { id: invitation.id },
        data: {
          used: true,
          usedAt: new Date(),
        },
      })

      return user
    })

    // Log audit
    await db.auditLog.create({
      data: {
        userId: result.id,
        action: 'INVITATION_ACCEPTED',
        entite: 'User',
        entiteId: result.id,
        details: JSON.stringify({
          email: result.email,
          role: result.role,
          invitationId: invitation.id,
        }),
      },
    })

    return NextResponse.json(
      { user: result, message: 'Compte créé avec succès' },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error accepting invitation:', error)
    return NextResponse.json(
      { error: 'Erreur lors de l\'acceptation de l\'invitation' },
      { status: 500 }
    )
  }
}
