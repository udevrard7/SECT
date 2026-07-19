/**
 * POST /api/go-auth/logout
 */
import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://sect-zead.onrender.com'

export async function POST(request: NextRequest) {
  try {
    const refreshToken = request.cookies.get('refresh_token')?.value

    if (refreshToken) {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      }).catch(() => {})
    }

    const response = NextResponse.json({ message: 'Déconnexion réussie' })
    response.cookies.delete('access_token')
    response.cookies.delete('refresh_token')
    return response
  } catch {
    const response = NextResponse.json({ message: 'Déconnexion réussie' }, { status: 200 })
    response.cookies.delete('access_token')
    response.cookies.delete('refresh_token')
    return response
  }
}
