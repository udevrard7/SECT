import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { NiveauEtude } from '@prisma/client'

// ─── Extended user type from NextAuth session ───
export interface SessionUser {
  id: string
  name?: string | null
  email?: string | null
  image?: string | null
  role: string
  etablissementId: string | null
  filiereId: string | null
  etablissement: { id: string; nom: string } | null
  filiere: { id: string; nom: string } | null
  actif: boolean
  matricule: string | null
  mustChangePwd: boolean
}

// ─── Authenticated user type for API route handlers ───
export interface AuthenticatedUser {
  id: string
  email: string
  name: string | null
  role: string
  actif: boolean
  etablissementId: string | null
  filiereId: string | null
  niveau: NiveauEtude | null
}

// ─── Handler type for protected API routes ───
export type AuthenticatedHandler = (
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) => Promise<NextResponse>

/**
 * Get the current authenticated session on the server side.
 * Returns null if no valid session exists.
 */
export async function getAuthSession() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return null
  return session
}

/**
 * Get the current authenticated user from the session.
 * Returns null if no valid session or user not found in DB.
 * Also verifies the user still exists and is active in the database.
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const session = await getAuthSession()
  if (!session?.user?.id) return null

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      actif: true,
      etablissementId: true,
      filiereId: true,
      niveau: true,
    },
  })

  if (!user || !user.actif) return null
  return user
}

/**
 * Higher-order function to protect API routes.
 * Uses NextAuth session (HttpOnly JWT cookie) instead of custom headers.
 *
 * @param handler - The API route handler to protect.
 * @param allowedRoles - Optional array of roles that are allowed to access the route.
 */
export function withAuth(
  handler: AuthenticatedHandler,
  allowedRoles?: string[]
) {
  return async (request: NextRequest, context: { params: any }) => {
    const user = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Non authentifié. Session invalide ou expirée.' },
        { status: 401 }
      )
    }

    // Role-based access control
    if (allowedRoles && allowedRoles.length > 0) {
      if (!allowedRoles.includes(user.role)) {
        return NextResponse.json(
          { error: `Accès refusé. Rôle '${user.role}' non autorisé pour cette action.` },
          { status: 403 }
        )
      }
    }

    // Attach user to the context and call the original handler
    const newContext = { ...context, user: user as AuthenticatedUser }
    return handler(request, newContext)
  }
}

/**
 * Require a specific role from the session.
 * Returns user info if authorized, or a NextResponse error if not.
 * Used by routes that need to check auth without the withAuth wrapper.
 */
export async function requireRole(
  request: NextRequest,
  roles: string[]
): Promise<AuthenticatedUser | NextResponse> {
  const user = await getAuthenticatedUser()

  if (!user) {
    return NextResponse.json(
      { error: 'Non authentifié. Session invalide ou expirée.' },
      { status: 401 }
    )
  }

  if (!roles.includes(user.role)) {
    return NextResponse.json(
      { error: `Accès refusé. Rôle '${user.role}' non autorisé.` },
      { status: 403 }
    )
  }

  return user as AuthenticatedUser
}

/**
 * Check if the result of requireRole is an auth error (NextResponse) or a valid user.
 */
export function isAuthError(result: AuthenticatedUser | NextResponse): result is NextResponse {
  return result instanceof NextResponse
}

/**
 * Get user ID from session (lightweight - no DB lookup).
 * Useful when you just need the user ID for filtering queries.
 */
export async function getSessionUserId(): Promise<string | null> {
  const session = await getAuthSession()
  return session?.user?.id ?? null
}

/**
 * Get user role from session (lightweight - no DB lookup).
 */
export async function getSessionUserRole(): Promise<string | null> {
  const session = await getAuthSession()
  return session?.user?.role ?? null
}
