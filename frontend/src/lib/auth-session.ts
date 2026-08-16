/**
 * auth-session.ts — Stub (NextAuth supprimé, auth gérée par Go backend via cookies httpOnly).
 * Types conservés pour compatibilité, fonctions retournent null.
 */

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

export interface AuthenticatedUser {
  id: string
  email: string
  name: string | null
  role: string
  actif: boolean
  etablissementId: string | null
  filiereId: string | null
  niveau: string | null
}

// Stubs — l'auth est gérée côté client via useAuthStore + cookies httpOnly Go
export async function getAuthSession(): Promise<any> { return null }
export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> { return null }
export function withAuth(handler: any, allowedRoles?: string[]): any { return handler }
export async function requireRole(request: any, roles: string[]): Promise<any> { return null }
export function isAuthError(result: any): boolean { return result && result.status !== undefined }
