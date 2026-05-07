import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email et mot de passe requis' },
        { status: 400 }
      )
    }

    const user = await db.user.findUnique({
      where: { email },
      include: {
        etablissement: { select: { id: true, nom: true } },
        filiere: { select: { id: true, nom: true } },
      },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'Identifiants incorrects' },
        { status: 401 }
      )
    }

    const passwordMatch = await bcrypt.compare(password, user.password)

    if (!passwordMatch) {
      return NextResponse.json(
        { error: 'Identifiants incorrects' },
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
    await db.user.update({
      where: { id: user.id },
      data: { derniereConnexion: new Date() },
    })

    // Create audit log for login
    const adresseIp = request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      'unknown'

    await db.auditLog.create({
      data: {
        userId: user.id,
        userEmail: user.email,
        action: 'LOGIN',
        entite: 'User',
        entiteId: user.id,
        details: JSON.stringify({ name: user.name, role: user.role }),
        adresseIp,
      },
    })

    // Return user data (without password)
    const { password: _, ...userWithoutPassword } = user

    return NextResponse.json({
      user: {
        ...userWithoutPassword,
        derniereConnexion: new Date(),
      },
      message: 'Connexion réussie',
    })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
