import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

// Public routes that don't require authentication
const PUBLIC_PATHS = [
  '/',               // Landing page (page.tsx handles auth redirect internally)
  '/login',
  '/invitation',
  '/verify',         // Public certificate verification page
  '/api/auth',       // NextAuth routes (login, session, callback)
  '/api/auth/password-reset',
  '/api/auth/password-reset/confirm',
  '/api/invitations/verify',
  '/api/invitations/accept',
  '/api/epreuves/auto-close', // Cron auto-close (has its own secret-based auth)
  '/api/certificats/verify',  // Public certificate verification endpoint
  '/api/landing-demo',        // Public interactive demo on landing page (rate-limited)
]

// API routes that should return 401 instead of redirecting
const API_PREFIX = '/api'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public paths
  if (PUBLIC_PATHS.some(path => path === '/' ? pathname === '/' : pathname.startsWith(path))) {
    return NextResponse.next()
  }

  // Allow static files and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/icon') ||
    pathname.startsWith('/apple-icon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // Check for valid JWT token
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  })

  // If no valid token
  if (!token) {
    // For API routes, return 401
    if (pathname.startsWith(API_PREFIX)) {
      return NextResponse.json(
        { error: 'Non authentifié. Session invalide ou expirée.' },
        { status: 401 }
      )
    }

    // For page routes, redirect to login
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Check if user is active (token should have actif flag)
  if (token.actif === false) {
    // For API routes, return 403
    if (pathname.startsWith(API_PREFIX)) {
      return NextResponse.json(
        { error: 'Compte désactivé. Contactez un administrateur.' },
        { status: 403 }
      )
    }

    // For page routes, redirect to login with error
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('error', 'AccountDisabled')
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, icon.svg, apple-icon.png
     */
    '/((?!_next/static|_next/image).*)',
  ],
}
