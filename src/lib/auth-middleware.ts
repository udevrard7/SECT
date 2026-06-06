
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Define a user type with the properties we expect
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  actif: boolean;
  etablissementId: string | null;
  filiereId: string | null;
}

// Define the type for a handler that uses the authenticated user
export type AuthenticatedHandler = (
  request: NextRequest,
  context: { params: any; user: AuthenticatedUser }
) => Promise<NextResponse>;

/**
 * Extract user info from request headers (x-user-id, x-user-role).
 * Returns null if headers are missing.
 */
function getUserFromHeaders(request: NextRequest): { userId: string; role: string } | null {
  const userId = request.headers.get('x-user-id')
  const role = request.headers.get('x-user-role')
  if (!userId || !role) return null
  return { userId, role }
}

/**
 * Higher-order function to protect API routes.
 * It checks for a valid user session and injects user data into the request.
 *
 * @param handler - The API route handler to protect.
 * @param allowedRoles - Optional array of roles that are allowed to access the route.
 */
export function withAuth(
  handler: AuthenticatedHandler,
  allowedRoles?: string[]
) {
  return async (request: NextRequest, context: { params: any }) => {
    // Get user info from headers
    const headerUser = getUserFromHeaders(request)

    if (!headerUser) {
      return NextResponse.json({ error: 'Non authentifié. Headers manquants.' }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { id: headerUser.userId },
    });

    if (!user || !user.actif) {
      return NextResponse.json({ error: 'Accès non autorisé. Compte inactif ou invalide.' }, { status: 403 });
    }

    // Role-based access control
    if (allowedRoles && allowedRoles.length > 0) {
      if (!allowedRoles.includes(user.role)) {
        return NextResponse.json(
          { error: `Accès refusé. Rôle '${user.role}' non autorisé pour cette action.` },
          { status: 403 }
        );
      }
    }

    // Attach user to the context and call the original handler
    const newContext = { ...context, user: user as AuthenticatedUser };
    return handler(request, newContext);
  };
}

/**
 * Require a specific role from the request headers.
 * Returns user info if authorized, or a NextResponse error if not.
 * Used by routes that need to check auth without the withAuth wrapper.
 */
export async function requireRole(
  request: NextRequest,
  roles: string[]
): Promise<AuthenticatedUser | NextResponse> {
  const headerUser = getUserFromHeaders(request)

  if (!headerUser) {
    return NextResponse.json({ error: 'Non authentifié. Headers manquants.' }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { id: headerUser.userId },
  });

  if (!user || !user.actif) {
    return NextResponse.json({ error: 'Accès non autorisé. Compte inactif ou invalide.' }, { status: 403 });
  }

  if (!roles.includes(user.role)) {
    return NextResponse.json(
      { error: `Accès refusé. Rôle '${user.role}' non autorisé.` },
      { status: 403 }
    );
  }

  return user as AuthenticatedUser;
}

/**
 * Check if the result of requireRole is an auth error (NextResponse) or a valid user.
 */
export function isAuthError(result: AuthenticatedUser | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}
