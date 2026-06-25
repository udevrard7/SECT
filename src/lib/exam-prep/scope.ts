import { NextResponse } from 'next/server'
import type { NiveauEtude } from '@prisma/client'
import type { AuthenticatedUser } from '@/lib/auth-session'
import { db, withRetry } from '@/lib/db'

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

/**
 * Vérifie qu'un chapterId appartient bien à un document accessible à
 * l'étudiant (via le scoping filière+niveau de l'UE du document).
 *
 * À appeler avant de lier un ReviewItem / PracticeAttempt à un chapterId
 * fourni par le client, pour empêcher l'injection d'un SRS sur un chapitre
 * d'un document auquel l'étudiant n'a pas accès.
 *
 * Retourne true si le chapitre existe ET appartient à un document accessible.
 */
export async function isChapterAccessible(
  chapterId: string,
  filiereId: string,
  niveau: NiveauEtude
): Promise<boolean> {
  const chapter = await withRetry(() =>
    db.chapter.findFirst({
      where: {
        id: chapterId,
        document: {
          deletedAt: null,
          uniteEnseignement: studentUeFilter(filiereId, niveau),
        },
      },
      select: { id: true },
    })
  )
  return chapter !== null
}
