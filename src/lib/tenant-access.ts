import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import type { AuthenticatedUser } from '@/lib/auth-session'

/**
 * Multi-tenant access control utilities.
 *
 * Core rule: The ADMIN (SaaS owner) must NOT access a client establishment's
 * data unless explicitly authorized via EtablissementAccess with statut='APPROUVE'
 * and a valid date range.
 */

/**
 * Check if an ADMIN user has authorized access to a specific establishment.
 * Returns true if there's an APPROUVE access record with valid date range.
 *
 * For non-ADMIN roles, always returns true (they are scoped by their own etablissementId).
 */
export async function checkAdminEtablissementAccess(
  adminId: string,
  etablissementId: string
): Promise<boolean> {
  const now = new Date()

  const accessRecord = await db.etablissementAccess.findFirst({
    where: {
      adminId,
      etablissementId,
      statut: 'APPROUVE',
      OR: [
        { dateDebut: null },
        { dateDebut: { lte: now } },
      ],
    },
  })

  if (!accessRecord) return false

  // Check dateFin is not expired
  if (accessRecord.dateFin && accessRecord.dateFin < now) return false

  return true
}

/**
 * Get all establishment IDs that an ADMIN is authorized to access.
 * Returns a Set of etablissementId strings.
 *
 * For non-ADMIN roles, returns null (caller should use their own etablissementId).
 */
export async function getAuthorizedEtablissementIds(
  adminId: string
): Promise<Set<string>> {
  const now = new Date()

  const accessRecords = await db.etablissementAccess.findMany({
    where: {
      adminId,
      statut: 'APPROUVE',
      OR: [
        { dateDebut: null },
        { dateDebut: { lte: now } },
      ],
    },
    select: { etablissementId: true, dateFin: true },
  })

  // Filter out expired records
  const activeIds = accessRecords
    .filter((r) => !r.dateFin || r.dateFin >= now)
    .map((r) => r.etablissementId)

  return new Set(activeIds)
}

/**
 * Require that the authenticated ADMIN user has access to a specific establishment.
 * Returns a 403 error response if access is denied, or null if access is granted.
 *
 * For non-ADMIN roles, this always returns null (access granted) — they should be
 * scoped by their own etablissementId in the query.
 */
export async function requireAdminEtablissementAccess(
  user: AuthenticatedUser,
  etablissementId: string
): Promise<NextResponse | null> {
  if (user.role !== 'ADMIN') return null // Non-admin roles handled separately

  const hasAccess = await checkAdminEtablissementAccess(user.id, etablissementId)
  if (!hasAccess) {
    return NextResponse.json(
      { error: 'Accès refusé. Vous n\'êtes pas autorisé à accéder aux données de cet établissement.' },
      { status: 403 }
    )
  }

  return null
}

/**
 * Verify that the etudiantId parameter matches the authenticated user's ID
 * when the user is an ETUDIANT. Prevents IDOR attacks where a student
 * could query another student's data.
 *
 * Returns a 403 error if the IDs don't match, or null if access is granted.
 */
export function verifySelfAccess(
  user: AuthenticatedUser,
  targetUserId: string
): NextResponse | null {
  if (user.role === 'ETUDIANT' && user.id !== targetUserId) {
    return NextResponse.json(
      { error: 'Accès refusé. Vous ne pouvez accéder qu\'à vos propres données.' },
      { status: 403 }
    )
  }

  if (user.role === 'ENSEIGNANT') {
    // ENSEIGNANT can only access their own data or data within their establishment
    // Specific checks are done per-route
    return null
  }

  return null
}

/**
 * Verify that an ENSEIGNANT user can only access sessions/results for
 * students within their own establishment.
 * Returns the user's etablissementId for further filtering, or a 403 error.
 */
export function requireEnseignantEstablishmentScope(
  user: AuthenticatedUser,
  targetEtablissementId?: string | null
): string | null | NextResponse {
  if (user.role !== 'ENSEIGNANT') return user.etablissementId

  // ENSEIGNANT must be scoped to their own establishment
  if (targetEtablissementId && user.etablissementId !== targetEtablissementId) {
    return NextResponse.json(
      { error: 'Accès refusé. Vous ne pouvez accéder qu\'aux données de votre établissement.' },
      { status: 403 }
    )
  }

  return user.etablissementId
}

/**
 * Resolve the etablissementId filter for the authenticated user based on their role.
 *
 * - ADMIN: returns the list of authorized establishment IDs (via EtablissementAccess)
 * - RESPONSABLE/ENSEIGNANT: returns their own etablissementId
 * - ETUDIANT: returns their own etablissementId
 *
 * Returns:
 * - { etablissementIds: string[] } for use in `where.etablissementId: { in: ids }`
 * - { etablissementId: string } for use in `where.etablissementId = id`
 * - { error: NextResponse } if access is denied
 */
export async function resolveTenantFilter(
  user: AuthenticatedUser,
  requestedEtablissementId?: string | null
): Promise<
  | { etablissementIds: string[] }
  | { etablissementId: string }
  | { error: NextResponse }
> {
  // ADMIN: Must have EtablissementAccess
  if (user.role === 'ADMIN') {
    const authorizedIds = await getAuthorizedEtablissementIds(user.id)

    // If a specific etablissementId was requested, check access
    if (requestedEtablissementId) {
      if (!authorizedIds.has(requestedEtablissementId)) {
        return {
          error: NextResponse.json(
            { error: 'Accès refusé. Vous n\'êtes pas autorisé à accéder aux données de cet établissement.' },
            { status: 403 }
          ),
        }
      }
      return { etablissementId: requestedEtablissementId }
    }

    // No specific etablissementId requested — return all authorized IDs
    if (authorizedIds.size === 0) {
      return { etablissementIds: ['__NO_ACCESS__'] } // Will match nothing
    }
    return { etablissementIds: Array.from(authorizedIds) }
  }

  // RESPONSABLE/ENSEIGNANT/ETUDIANT: scoped to their own establishment
  if (!user.etablissementId) {
    return {
      error: NextResponse.json(
        { error: 'Aucun établissement associé à votre compte.' },
        { status: 403 }
      ),
    }
  }

  return { etablissementId: user.etablissementId }
}
