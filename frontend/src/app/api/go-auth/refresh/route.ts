/**
 * POST /api/go-auth/refresh
 */
import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://sect-s1pb.onrender.com'

export async function POST(request: NextRequest) {
  try {
    const refreshToken = request.cookies.get('refresh_token')?.value

    if (!refreshToken) {
      return NextResponse.json({ error: 'Pas de refresh token' }, { status: 401 })
    }

    const resp = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })

    const data = await resp.json()

    if (!resp.ok) {
      const response = NextResponse.json(data, { status: resp.status })
      response.cookies.delete('access_token')
      response.cookies.delete('refresh_token')
      return response
    }

    const response = NextResponse.json({ user: data.user, message: 'Token rafraîchi' })

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
    return NextResponse.json({ error: 'Erreur lors du refresh' }, { status: 500 })
  }
}
