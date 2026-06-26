import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Next.js 16 Proxy (anciennement `middleware.ts`).
 *
 * Pendant la transition: supporte les DEUX auth:
 * 1. NextAuth (cookie next-auth.session-token) — ancien
 * 2. Go JWT (cookie access_token) — nouveau
 *
 * Pour les routes /api/*, ajoute Authorization: Bearer si cookie access_token présent.
 */

const PUBLIC_PATHS = [
  '/',
  '/login',
  '/invitation',
  '/verify',
  '/api/auth',
  '/api/go-auth',
  '/api/certificats/verify',
  '/api/epreuves/auto-close',
  '/api/landing-demo',
  '/api/push/vapid-public-key',
  '/api/exam-prep/rappels',
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

  // Pour les routes /api/*, ajouter Authorization: Bearer si cookie Go JWT présent
  if (pathname.startsWith('/api/')) {
    const accessToken = request.cookies.get('access_token')?.value
    if (accessToken) {
      const requestHeaders = new Headers(request.headers)
      requestHeaders.set('Authorization', `Bearer ${accessToken}`)
      return NextResponse.next({ request: { headers: requestHeaders } })
    }
    return NextResponse.next()
  }

  // Pages protégées: vérifier UN des deux cookies d'auth
  const goToken = request.cookies.get('access_token')?.value
  const nextAuthToken = request.cookies.get('next-auth.session-token')?.value ||
                        request.cookies.get('__Secure-next-auth.session-token')?.value

  if (!goToken && !nextAuthToken) {
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
