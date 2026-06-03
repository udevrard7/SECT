import { NextRequest } from 'next/server'

/**
 * Extracts user context from request headers.
 * The app uses client-side Zustand auth state, so authentication
 * information is passed via custom headers on API calls.
 *
 * @param request - The incoming NextRequest
 * @returns Object with userId and role, or null if headers are missing
 */
export function getUserFromRequest(request: NextRequest): { userId: string; role: string } | null {
  const userId = request.headers.get('x-user-id')
  const role = request.headers.get('x-user-role')

  if (!userId || !role) {
    return null
  }

  return { userId, role }
}
