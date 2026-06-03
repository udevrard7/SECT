import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export interface AuthContext {
  userId: string
  role: string
  email: string
  etablissementId: string | null
}

/**
 * Validates authentication by extracting x-user-id and x-user-role headers
 * AND verifying them against the database.
 *
 * This prevents header spoofing since the server confirms the user exists
 * and the role matches what's in the database.
 *
 * @param request - The incoming NextRequest
 * @returns AuthContext with verified user info, or null if invalid
 */
export async function getVerifiedUser(request: NextRequest): Promise<AuthContext | null> {
  const userId = request.headers.get('x-user-id')
  const clientRole = request.headers.get('x-user-role')

  if (!userId || !clientRole) {
    return null
  }

  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        email: true,
        actif: true,
        etablissementId: true,
      },
    })

    // User must exist, be active, and the client-provided role must match the DB
    if (!user || !user.actif || user.role !== clientRole) {
      return null
    }

    return {
      userId: user.id,
      role: user.role,
      email: user.email,
      etablissementId: user.etablissementId,
    }
  } catch {
    return null
  }
}

/**
 * Requires the user to be authenticated (any role).
 * Returns AuthContext or a 401 NextResponse.
 */
export async function requireAuth(request: NextRequest): Promise<AuthContext | NextResponse> {
  const user = await getVerifiedUser(request)
  if (!user) {
    return NextResponse.json(
      { error: 'Authentification requise. Veuillez vous reconnecter.' },
      { status: 401 }
    )
  }
  return user
}

/**
 * Requires the user to have a specific role (or one of several roles).
 * Returns AuthContext or a 403 NextResponse.
 */
export async function requireRole(
  request: NextRequest,
  allowedRoles: string[]
): Promise<AuthContext | NextResponse> {
  const user = await getVerifiedUser(request)
  if (!user) {
    return NextResponse.json(
      { error: 'Authentification requise.' },
      { status: 401 }
    )
  }
  if (!allowedRoles.includes(user.role)) {
    return NextResponse.json(
      { error: 'Vous n\'avez pas les permissions pour effectuer cette action.' },
      { status: 403 }
    )
  }
  return user
}

/**
 * Quick check — is this response an error (i.e., the auth check failed)?
 * Usage: const authResult = await requireRole(req, ['ADMIN']); if (authResult instanceof NextResponse) return authResult;
 */
export function isAuthError(result: AuthContext | NextResponse): result is NextResponse {
  return result instanceof NextResponse
}
