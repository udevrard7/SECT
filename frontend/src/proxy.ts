import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Next.js 16 Proxy — MINIMAL (0 CPU pour les routes API).
 *
 * RÔLE UNIQUE: rediriger vers /login si pas de cookie access_token sur les PAGES.
 *
 * POUR LES ROUTES /api/*: NE RIEN FAIRE.
 * Le rewrite next.config.ts (afterFiles) transfère directement vers le Go backend.
 * Le navigateur envoie le cookie httpOnly automatiquement.
 * Le Go backend lit le cookie directement (0 CPU Vercel, 0 Edge invocation).
 */

const PUBLIC_PAGES = [
  '/',
  '/login',
  '/invitation',
  '/verify',
  '/offline',
]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Assets statiques — laisser passer
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/fonts') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // Routes API — NE PAS intercepter (le rewrite s'en charge, 0 CPU)
  if (pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // Pages publiques — laisser passer
  if (PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  // Pages protégées — vérifier cookie access_token
  const accessToken = request.cookies.get('access_token')?.value

  if (!accessToken) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('error', 'SessionExpired')
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  // Matcher: exclure /api/* (géré par rewrite, pas par proxy)
  // et les assets statiques
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|fonts|public).*)',
  ],
}
