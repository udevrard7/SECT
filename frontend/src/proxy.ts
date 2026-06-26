import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Next.js 16 Proxy — version simplifiée (0 CPU Edge pour /api/*).
 *
 * Pour /api/* : laisse passer — le rewrite next.config.ts (afterFiles) forward
 * la requête vers Render en incluant le cookie httpOnly "access_token". Le
 * middleware Auth du backend Go lit ce cookie en priorité, avec fallback sur
 * l'en-tête Authorization: Bearer pour les clients mobiles/API directs.
 *
 * Validé par test A/B en preview Vercel (voir worklog, Task ID COOKIE-TEST-1) :
 * le cookie est bien forwardé par Vercel vers Render cross-origin, l'auth
 * fonctionne avec le cookie seul, sans injection d'en-tête Authorization.
 *
 * Pour les pages : redirect /login si pas de cookie.
 */

const PUBLIC_PATHS = ['/', '/login', '/invitation', '/verify', '/offline']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Assets statiques — ne jamais intercepter
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname.startsWith('/fonts') || pathname.includes('.')) {
    return NextResponse.next()
  }

  // Routes /api/* — laisser passer (0 manipulation, 0 CPU Edge).
  // Le cookie httpOnly est forwardé tel quel par le rewrite Vercel → Render.
  // Le backend Go gère lui-même l'auth : cookie en priorité, Authorization en fallback.
  if (pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // Pages publiques — laisser passer sans vérification
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  // Pages protégées — redirect /login si pas de cookie access_token
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
