import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Next.js 16 Proxy.
 * Auth gate: vérifie le cookie access_token (JWT Go).
 * Pour /api/*: ajoute Authorization: Bearer depuis le cookie.
 */

const PUBLIC_PATHS = [
  '/',
  '/login',
  '/invitation',
  '/verify',
  '/api/go-auth',
  '/api/certificats/verify',
  '/offline',
]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Assets statiques
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/fonts') ||
    pathname.startsWith('/public') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // Routes publiques
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  // Pour /api/*: ajouter Authorization: Bearer si cookie présent
  if (pathname.startsWith('/api/')) {
    const accessToken = request.cookies.get('access_token')?.value
    if (accessToken) {
      const requestHeaders = new Headers(request.headers)
      requestHeaders.set('Authorization', `Bearer ${accessToken}`)
      return NextResponse.next({ request: { headers: requestHeaders } })
    }
    return NextResponse.next()
  }

  // Pages protégées: vérifier cookie access_token
  const accessToken = request.cookies.get('access_token')?.value

  if (!accessToken) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('error', 'SessionExpired')
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|fonts|public).*)',
  ],
}
