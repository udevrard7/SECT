import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import crypto from 'crypto'

// POST /api/auth/password-reset — Request a password reset
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json(
        { error: 'Email requis' },
        { status: 400 }
      )
    }

    const user = await db.user.findUnique({ where: { email } })

    if (!user) {
      // Don't reveal whether the email exists for security
      return NextResponse.json(
        { message: 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.' },
        { status: 200 }
      )
    }

    // Invalidate any existing unused reset tokens for this user
    await db.passwordReset.updateMany({
      where: {
        userId: user.id,
        used: false,
      },
      data: { used: true, usedAt: new Date() },
    })

    const token = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now

    const passwordReset = await db.passwordReset.create({
      data: {
        id: crypto.randomUUID(),
        token,
        userId: user.id,
        expiresAt,
      },
    })

    // In a real app, send email with reset link containing the token.
    // For testing, return the token directly.
    return NextResponse.json(
      {
        message: 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.',
        token, // Only for testing — remove in production
        expiresAt: passwordReset.expiresAt,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Password reset request error:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
