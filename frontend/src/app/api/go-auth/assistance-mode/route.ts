/**
 * POST /api/go-auth/assistance-mode
 * Shim: appelle le backend Go /api/auth/assistance-mode, stocke les nouveaux
 * tokens (assistance) en cookies httpOnly. Le backend RequireRole("ADMIN")
 * valide que l'appelant est ADMIN et renvoie un user avec etablissementId
 * positionné → l'ADMIN "devient" RESPONSABLE le temps de la session d'assistance.
 */
import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://sect-s1pb.onrender.com'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const resp = await fetch(`${API_URL}/api/auth/assistance-mode`, {
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
      message: data.message ?? 'Mode assistance activé',
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
      { error: 'Erreur lors de l\'activation du mode assistance' },
      { status: 500 },
    )
  }
}
