
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from 'next-auth/react'; // Placeholder for your actual session management

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
    // In a real app, you would get the session from a secure, HttpOnly cookie
    // For this example, we'll simulate getting a session.
    // Replace this with your actual session retrieval and verification logic.
    const session = await getSession({ req: request });

    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: 'Non authentifié. Session invalide ou expirée.' }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { id: session.user.id },
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
