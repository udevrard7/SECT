/**
 * POST /api/go-auth/logout
 */
import { NextRequest, NextResponse } from 'next/server'

// SECT-OCI-CUTOVER-1 : API_BASE_URL (server-only) — primaire OCI Marseille.
// NEXT_PUBLIC_API_URL reste réservé au rewrite DEV (next.config.ts) ; sa valeur
// historique sur Vercel pointait sur Render et neutralisait le cutover.
const API_URL = process.env.API_BASE_URL || 'https://api.sect.ftci.fr'

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
