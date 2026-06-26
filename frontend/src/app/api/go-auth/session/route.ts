/**
 * GET /api/go-auth/session
 * Shim: lit access_token cookie, appelle Go /api/me. Auto-refresh si expiré.
 */
import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://sect-s1pb.onrender.com'

export async function GET(request: NextRequest) {
  try {
    const accessToken = request.cookies.get('access_token')?.value
    const refreshToken = request.cookies.get('refresh_token')?.value

    if (!accessToken) {
      if (refreshToken) {
        return await tryRefresh(refreshToken)
      }
      return NextResponse.json({ user: null }, { status: 200 })
    }

    const meResp = await fetch(`${API_URL}/api/me`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })

    if (meResp.ok) {
      const user = await meResp.json()
      return NextResponse.json({ user, expires: new Date(Date.now() + 15 * 60 * 1000).toISOString() })
    }

    if (refreshToken && meResp.status === 401) {
      return await tryRefresh(refreshToken)
    }

    const response = NextResponse.json({ user: null }, { status: 200 })
    response.cookies.delete('access_token')
    response.cookies.delete('refresh_token')
    return response
  } catch {
    return NextResponse.json({ user: null }, { status: 200 })
  }
}

async function tryRefresh(refreshToken: string) {
  const refreshResp = await fetch(`${API_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })

  if (!refreshResp.ok) {
    const response = NextResponse.json({ user: null }, { status: 200 })
    response.cookies.delete('access_token')
    response.cookies.delete('refresh_token')
    return response
  }

  const refreshData = await refreshResp.json()
  const meResp = await fetch(`${API_URL}/api/me`, {
    headers: { 'Authorization': `Bearer ${refreshData.accessToken}` },
  })

  if (!meResp.ok) {
    const response = NextResponse.json({ user: null }, { status: 200 })
    return response
  }

  const user = await meResp.json()
  const response = NextResponse.json({ user, expires: new Date(Date.now() + 15 * 60 * 1000).toISOString() })
  response.cookies.set('access_token', refreshData.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60,
  })
  response.cookies.set('refresh_token', refreshData.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  })
  return response
}
