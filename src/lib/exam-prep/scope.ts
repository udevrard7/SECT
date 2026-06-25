import { NextResponse } from 'next/server'
import type { NiveauEtude } from '@prisma/client'
import type { AuthenticatedUser } from '@/lib/auth-session'

/**
 * Scope étudiant : garantit que l'utilisateur a une filière ET un niveau
 * définis (nécessaire pour le scoping des documents via UE).
 *
 * Retourne `{ filiereId, niveau }` typés non-null, ou `null` + une
 * NextResponse 403 si le scope est incomplet.
 *
 * Usage dans un handler withAuth :
 *   const scope = requireStudentScope(user)
 *   if (!scope) return scope.response
 *   const { filiereId, niveau } = scope
 */
export function requireStudentScope(user: AuthenticatedUser):
  | { filiereId: string; niveau: NiveauEtude; response: null }
  | { filiereId: null; niveau: null; response: NextResponse } {
  if (!user.filiereId || !user.niveau) {
    return {
      filiereId: null,
      niveau: null,
      response: NextResponse.json(
        { error: 'Profil incomplet : filière ou niveau manquant. Contactez votre responsable.' },
        { status: 403 }
      ),
    }
  }
  return {
    filiereId: user.filiereId,
    niveau: user.niveau,
    response: null,
  }
}

/**
 * Filtre Prisma réutilisable pour scoper les Document à la filière+niveau
 * de l'étudiant (via l'UE relationnelle). À utiliser dans les where:
 *   where: { ..., uniteEnseignement: studentUeFilter(filiereId, niveau) }
 */
export function studentUeFilter(filiereId: string, niveau: NiveauEtude) {
  return {
    filiereId,
    actif: true,
    OR: [
      { niveau },
      { niveaux: { contains: niveau } },
    ],
  }
}
