/**
 * POST /api/go-auth/exit-assistance-mode
 * Shim: appelle le backend Go /api/auth/exit-assistance-mode, stocke les
 * nouveaux tokens (ADMIN normal) en cookies httpOnly. Le backend RequireRole
 * ("ADMIN") valide que l'appelant est bien en mode assistance (token avec
 * etablissementId non vide) et renvoie un user avec etablissementId="" →
 * l'ADMIN retrouve sa session d'origine.
 */
import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://sect-s1pb.onrender.com'

export async function POST(request: NextRequest) {
  try {
    // Le backend lit le JWT courant (cookie → Authorization) ; aucun body
    // n'est requis, mais on forward quand même un body vide pour rester
    // symétrique avec /assistance-mode.
    let body: unknown = {}
    try {
      body = await request.json()
    } catch {
      // Body vide ou invalide : on envoie {} par défaut.
    }

    const resp = await fetch(`${API_URL}/api/auth/exit-assistance-mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = await resp.json()

    if (!resp.ok) {
      return NextResponse.json(data, { status: resp.status })
    }

    const response = NextResponse.json({
      user: data.user,
      message: data.message ?? 'Mode assistance désactivé',
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
    return NextResponse.json(
      { error: 'Erreur lors de la désactivation du mode assistance' },
      { status: 500 },
    )
  }
}
