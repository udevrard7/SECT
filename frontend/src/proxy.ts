import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Next.js 16 Proxy.
 *
 * Pour /api/* : injecte Authorization: Bearer depuis le cookie, puis
 * laisse le rewrite next.config.ts faire le proxy vers Render.
 *
 * Pour les pages : redirect /login si pas de cookie
 */

const PUBLIC_PATHS = ['/', '/login', '/invitation', '/verify', '/offline']
const PUBLIC_API_PATHS = ['/api/go-auth', '/api/health', '/api/certificats/verify']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Assets statiques
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname.startsWith('/fonts') || pathname.includes('.')) {
    return NextResponse.next()
  }

  // Routes API publiques — laisser passer
  if (PUBLIC_API_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Pour les routes /api/* : injecter Authorization depuis le cookie
  if (pathname.startsWith('/api/')) {
    const accessToken = request.cookies.get('access_token')?.value
    if (accessToken) {
      const requestHeaders = new Headers(request.headers)
      requestHeaders.set('Authorization', `Bearer ${accessToken}`)
      return NextResponse.next({
        request: { headers: requestHeaders },
      })
    }
    return NextResponse.next()
  }

  // Pages publiques
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  // Pages protégées
  const accessToken = request.cookies.get('access_token')?.value
  if (!accessToken) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('error', 'SessionExpired')
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|fonts|public).*)'],
}
