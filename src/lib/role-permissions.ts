/**
 * Role-based permission helpers for user creation.
 *
 * Business rules:
 * - ADMIN can ONLY create users with role RESPONSABLE
 * - RESPONSABLE can ONLY create users with role ENSEIGNANT or ETUDIANT
 * - ENSEIGNANT and ETUDIANT cannot create users at all
 */

/** Map of creator role → list of roles they are allowed to create */
const CREATABLE_ROLES: Record<string, string[]> = {
  ADMIN: ['RESPONSABLE'],
  RESPONSABLE: ['ENSEIGNANT', 'ETUDIANT'],
  ENSEIGNANT: [],
  ETUDIANT: [],
}

/** French error messages per creator role */
const CREATION_ERROR_MESSAGES: Record<string, string> = {
  ADMIN: 'Les administrateurs ne peuvent créer que des responsables',
  RESPONSABLE: 'Les responsables ne peuvent créer que des enseignants ou des étudiants',
  ENSEIGNANT: 'Vous n\'avez pas les permissions pour créer des utilisateurs',
  ETUDIANT: 'Vous n\'avez pas les permissions pour créer des utilisateurs',
}

/**
 * Returns the list of roles a given creator role can create.
 *
 * @param creatorRole - The role of the user attempting to create another user
 * @returns Array of role strings the creator is allowed to assign
 */
export function getAllowedCreatableRoles(creatorRole: string): string[] {
  return CREATABLE_ROLES[creatorRole] ?? []
}

/**
 * Validates if a creator can create a target role.
 *
 * @param creatorRole - The role of the user attempting the creation
 * @param targetRole  - The role to be assigned to the new user
 * @returns true if the creator is allowed to assign the target role
 */
export function canCreateRole(creatorRole: string, targetRole: string): boolean {
  const allowed = getAllowedCreatableRoles(creatorRole)
  return allowed.includes(targetRole)
}

/**
 * Returns an error message if the creator is not allowed to create the target role,
 * or null if the operation is permitted.
 *
 * @param creatorRole - The role of the user attempting the creation
 * @param targetRole  - The role to be assigned to the new user
 * @returns A French error message string, or null if allowed
 */
export function validateCreationPermission(creatorRole: string, targetRole: string): string | null {
  if (canCreateRole(creatorRole, targetRole)) {
    return null
  }

  // Return the specific error message for this creator role
  return CREATION_ERROR_MESSAGES[creatorRole] ?? 'Vous n\'avez pas les permissions pour créer des utilisateurs'
}
