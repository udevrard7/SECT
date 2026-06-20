import { NextRequest, NextResponse } from 'next/server'
import { db, withRetry } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { getAuthenticatedUser } from '@/lib/auth-session'

// POST /api/auth/change-password — Change user password
export async function POST(request: NextRequest) {
  try {
    // Get userId from the session, NOT from the request body
    const authUser = await getAuthenticatedUser()
    if (!authUser) {
      return NextResponse.json(
        { error: 'Non authentifié. Session invalide ou expirée.' },
        { status: 401 }
      )
    }

    const userId = authUser.id

    const { currentPassword, newPassword } = await request.json()

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'currentPassword et newPassword sont requis' },
        { status: 400 }
      )
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'Le nouveau mot de passe doit contenir au moins 8 caractères' },
        { status: 400 }
      )
    }

    // Validate password complexity
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      return NextResponse.json(
        { error: 'Le mot de passe doit contenir au moins une majuscule, une minuscule, un chiffre et un caractère spécial' },
        { status: 400 }
      )
    }

    // Find the user
    const user = await withRetry(() =>
      db.user.findUnique({
        where: { id: userId },
      })
    )

    if (!user) {
      return NextResponse.json(
        { error: 'Utilisateur introuvable' },
        { status: 404 }
      )
    }

    // Validate current password
    const passwordMatch = await bcrypt.compare(currentPassword, user.password)
    if (!passwordMatch) {
      return NextResponse.json(
        { error: 'Mot de passe actuel incorrect' },
        { status: 401 }
      )
    }

    // Hash the new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10)

    // Update user password and set mustChangePwd to false
    await withRetry(() =>
      db.user.update({
        where: { id: userId },
        data: {
          password: hashedNewPassword,
          mustChangePwd: false,
        },
      })
    )

    // Log audit
    const adresseIp = request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      'unknown'

    await db.auditLog.create({
      data: {
        userId: user.id,
        userEmail: user.email,
        action: 'CHANGE_PASSWORD',
        entite: 'User',
        entiteId: user.id,
        details: JSON.stringify({
          email: user.email,
          name: user.name,
          role: user.role,
          forcedChange: user.mustChangePwd,
        }),
        adresseIp,
      },
    })

    return NextResponse.json({
      message: 'Mot de passe modifié avec succès',
    })
  } catch (error) {
    console.error('Error changing password:', error)
    return NextResponse.json(
      { error: 'Erreur lors du changement de mot de passe' },
      { status: 500 }
    )
  }
}
