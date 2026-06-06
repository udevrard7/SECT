import { NextRequest, NextResponse } from 'next/server'
import { db, withRetry } from '@/lib/db'
import bcrypt from 'bcryptjs'

/**
 * POST /api/auth/login-student
 * Authentification pour les étudiants via matricule + mot de passe
 */
export async function POST(request: NextRequest) {
  try {
    const { matricule, password } = await request.json()

    if (!matricule || !password) {
      return NextResponse.json(
        { error: 'Matricule et mot de passe requis' },
        { status: 400 }
      )
    }

    // Find student by matricule
    const user = await withRetry(() =>
      db.user.findUnique({
        where: { matricule },
        include: {
          etablissement: { select: { id: true, nom: true } },
          filiere: { select: { id: true, nom: true } },
        },
      })
    )

    if (!user) {
      return NextResponse.json(
        { error: 'Matricule ou mot de passe incorrect' },
        { status: 401 }
      )
    }

    // Verify user is a student
    if (user.role !== 'ETUDIANT') {
      return NextResponse.json(
        { error: 'Ce matricule n\'est pas associé à un compte étudiant' },
        { status: 403 }
      )
    }

    // Check password
    const passwordMatch = await bcrypt.compare(password, user.password)

    if (!passwordMatch) {
      return NextResponse.json(
        { error: 'Matricule ou mot de passe incorrect' },
        { status: 401 }
      )
    }

    // Check if user is active
    if (!user.actif) {
      return NextResponse.json(
        { error: 'Votre compte a été désactivé. Contactez un administrateur.' },
        { status: 403 }
      )
    }

    // Update derniereConnexion
    await withRetry(() =>
      db.user.update({
        where: { id: user.id },
        data: { derniereConnexion: new Date() },
      })
    )

    // Create audit log
    const adresseIp = request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      'unknown'

    await db.auditLog.create({
      data: {
        userId: user.id,
        userEmail: user.email,
        action: 'LOGIN_MATRICULE',
        entite: 'User',
        entiteId: user.id,
        details: JSON.stringify({ name: user.name, role: user.role, matricule }),
        adresseIp,
      },
    })

    // Return user data (without password)
    const { password: _, ...userWithoutPassword } = user

    const response: Record<string, unknown> = {
      user: {
        ...userWithoutPassword,
        derniereConnexion: new Date(),
      },
      message: 'Connexion réussie',
    }

    // Check if user must change password
    if (user.mustChangePwd) {
      response.mustChangePassword = true
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Login student error:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
