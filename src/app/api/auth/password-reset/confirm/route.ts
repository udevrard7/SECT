import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'

// POST /api/auth/password-reset/confirm — Confirm password reset
export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json()

    if (!token || !password) {
      return NextResponse.json(
        { error: 'Token et nouveau mot de passe requis' },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Le mot de passe doit contenir au moins 6 caractères' },
        { status: 400 }
      )
    }

    // Find the reset token
    const resetEntry = await db.passwordReset.findUnique({
      where: { token },
    })

    if (!resetEntry) {
      return NextResponse.json(
        { error: 'Token invalide' },
        { status: 404 }
      )
    }

    // Check if token has already been used
    if (resetEntry.used) {
      return NextResponse.json(
        { error: 'Ce token a déjà été utilisé' },
        { status: 400 }
      )
    }

    // Check if token has expired
    if (resetEntry.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'Le token a expiré' },
        { status: 400 }
      )
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Update user password and mark token as used in a transaction
    await db.$transaction([
      db.user.update({
        where: { id: resetEntry.userId },
        data: {
          password: hashedPassword,
          lockedUntil: null,
          loginAttempts: 0,
        },
      }),
      db.passwordReset.update({
        where: { id: resetEntry.id },
        data: {
          used: true,
          usedAt: new Date(),
        },
      }),
    ])

    // Log audit
    await db.auditLog.create({
      data: {
        userId: resetEntry.userId,
        action: 'PASSWORD_RESET',
        entite: 'User',
        entiteId: resetEntry.userId,
        details: 'Mot de passe réinitialisé avec succès',
      },
    })

    return NextResponse.json(
      { message: 'Mot de passe réinitialisé avec succès' },
      { status: 200 }
    )
  } catch (error) {
    console.error('Password reset confirm error:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
