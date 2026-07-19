/**
 * POST /api/go-auth/login
 * Shim: appelle le backend Go /api/auth/login, stocke les tokens en cookies httpOnly.
 * NextAuth reste intact — cette route est utilisée uniquement par le nouveau auth-store.
 */
import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://sect-zead.onrender.com'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const resp = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = await resp.json()

    if (!resp.ok) {
      return NextResponse.json(data, { status: resp.status })
    }

    // SECT-B2C-MULTI-ETAB : si multi-comptes, retourner la liste (pas de tokens)
    if (data.multiAccounts && data.multiAccounts.length > 0) {
      return NextResponse.json({
        multiAccounts: data.multiAccounts,
        message: 'Plusieurs établissements trouvés. Choisissez-en un.',
      })
    }

    const response = NextResponse.json({
      user: data.user,
      message: 'Login réussi',
    })

    response.cookies.set('access_token', data.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60,
    })

    response.cookies.set('refresh_token', data.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    })

    return response
  } catch {
    return NextResponse.json({ error: 'Erreur lors de la connexion' }, { status: 500 })
  }
}
